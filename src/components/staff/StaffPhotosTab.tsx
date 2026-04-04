import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, CheckCircle, Loader2, ImageIcon, Video, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SignedImage } from '@/components/ui/signed-image';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

interface StaffPhotosTabProps {
  staffId: string;
  organizationId: string;
}

interface BookingOption {
  id: string;
  booking_number: number;
  scheduled_at: string;
  customer: { first_name: string; last_name: string } | null;
  service: { name: string } | null;
}

interface UploadItem {
  file: File;
  preview: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface PhotoRecord {
  id: string;
  booking_id: string;
  photo_url: string;
  photo_type: string | null;
  media_type: string;
  created_at: string | null;
  booking?: {
    organization_id?: string | null;
    booking_number: number;
    scheduled_at: string;
    customer: { first_name: string; last_name: string } | null;
  } | null;
}

const PHOTO_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
const ALLOWED_PHOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_VIDEO = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
const PICKER_INPUT_CLASS = 'absolute left-0 top-0 h-px w-px opacity-0 pointer-events-none';

function isVideoFile(file: File) {
  return file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov');
}

function openPicker(input: HTMLInputElement | null) {
  if (!input) return;

  const pickerInput = input as HTMLInputElement & { showPicker?: () => void };

  try {
    if (typeof pickerInput.showPicker === 'function') {
      pickerInput.showPicker();
      return;
    }
  } catch (error) {
    console.warn('showPicker failed, falling back to click()', error);
  }

  pickerInput.click();
}

function getUploadErrorMessage(error: unknown, isVideo: boolean) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('security') || lowerMessage.includes('policy') || lowerMessage.includes('row-level') || lowerMessage.includes('rls') || lowerMessage.includes('violates')) {
    return 'Photo upload not enabled yet. Contact your admin.';
  }

  if (lowerMessage.includes('payload') || lowerMessage.includes('too large') || lowerMessage.includes('size')) {
    return isVideo
      ? 'Video must be under 100MB. Try trimming it or recording a shorter clip.'
      : 'Photo must be under 10MB. Please try again.';
  }

  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('timeout')) {
    return isVideo
      ? 'Video upload timed out. Try on WiFi for large videos.'
      : 'Upload failed. Check your connection and try again.';
  }

  if (lowerMessage.includes('booking') || lowerMessage.includes('uuid')) {
    return 'Could not identify the selected booking. Refresh and try again.';
  }

  return message.length > 140 ? 'Upload failed. Please try again.' : message;
}

export function StaffPhotosTab({ staffId, organizationId }: StaffPhotosTabProps) {
  const queryClient = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [photoType, setPhotoType] = useState<string>('after');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<{ url: string; type: string } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      uploads.forEach((upload) => {
        if (upload.preview.startsWith('blob:')) {
          URL.revokeObjectURL(upload.preview);
        }
      });
    };
  }, [uploads]);

  const { data: bookings = [] } = useQuery({
    queryKey: ['staff-photo-bookings', staffId, organizationId],
    queryFn: async () => {
      if (!staffId || !organizationId) return [];

      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, scheduled_at, customer:customers(first_name, last_name), service:services(name)')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'confirmed', 'in_progress', 'completed'])
        .order('scheduled_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as BookingOption[];
    },
    enabled: !!staffId && !!organizationId,
  });

  const { data: photos = [], isLoading: loadingPhotos } = useQuery({
    queryKey: ['staff-uploaded-photos', staffId, organizationId],
    queryFn: async () => {
      if (!staffId || !organizationId) return [];

      const { data, error } = await supabase
        .from('booking_photos')
        .select(`
          id, booking_id, photo_url, photo_type, media_type, created_at,
          booking:bookings!booking_photos_booking_id_fkey(
            organization_id,
            booking_number,
            scheduled_at,
            customer:customers!bookings_customer_id_fkey(first_name, last_name)
          )
        `)
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data || []) as PhotoRecord[]).filter((item) => item.booking?.organization_id === organizationId);
    },
    enabled: !!staffId && !!organizationId,
  });

  const groupedPhotos = photos.reduce<Record<string, { booking: PhotoRecord['booking']; items: PhotoRecord[] }>>((acc, photo) => {
    const key = photo.booking_id;
    if (!acc[key]) {
      acc[key] = { booking: photo.booking, items: [] };
    }
    acc[key].items.push(photo);
    return acc;
  }, {});

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (!files.length) return;

    const newUploads: UploadItem[] = [];

    for (const file of files) {
      const isVideo = isVideoFile(file);

      if (!isVideo && !ALLOWED_PHOTO.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
        toast.error(`${file.name}: Only JPG, PNG, WebP, and HEIC photos are supported.`);
        continue;
      }

      if (isVideo && !ALLOWED_VIDEO.includes(file.type) && !file.name.toLowerCase().endsWith('.mov')) {
        toast.error(`${file.name}: Please upload MP4 or MOV videos only.`);
        continue;
      }

      const maxSize = isVideo ? VIDEO_MAX : PHOTO_MAX;
      if (file.size > maxSize) {
        toast.error(`${file.name}: ${isVideo ? 'Video must be under 100MB.' : 'Photo must be under 10MB.'}`);
        continue;
      }

      newUploads.push({
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        status: 'pending',
      });
    }

    setUploads((prev) => [...prev, ...newUploads]);
  };

  const removeUpload = (index: number) => {
    setUploads((prev) => {
      const copy = [...prev];
      const removed = copy[index];
      if (removed?.preview.startsWith('blob:')) {
        URL.revokeObjectURL(removed.preview);
      }
      copy.splice(index, 1);
      return copy;
    });
  };

  const uploadAll = async () => {
    if (!selectedBookingId) {
      toast.error('Please select a booking first.');
      return;
    }

    const pendingCount = uploads.filter((upload) => upload.status === 'pending').length;
    if (!pendingCount) {
      toast.error('No files to upload.');
      return;
    }

    setIsUploading(true);
    let successCount = 0;

    for (let index = 0; index < uploads.length; index += 1) {
      if (uploads[index].status !== 'pending') continue;

      setUploads((prev) => prev.map((upload, itemIndex) => (
        itemIndex === index ? { ...upload, status: 'uploading', progress: 10, error: undefined } : upload
      )));

      const file = uploads[index].file;
      const isVideo = isVideoFile(file);
      const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
      let uploadedPath: string | null = null;

      try {
        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('id, organization_id')
          .eq('id', selectedBookingId)
          .maybeSingle();

        if (bookingError) throw bookingError;

        const resolvedOrgId = bookingData?.organization_id || organizationId;
        if (!bookingData?.id || !resolvedOrgId) {
          throw new Error('Selected booking was not found.');
        }

        const filePath = `${resolvedOrgId}/${selectedBookingId}/${staffId}/${photoType}/${Date.now()}_${index}.${ext}`;

        setUploads((prev) => prev.map((upload, itemIndex) => (
          itemIndex === index ? { ...upload, progress: 30 } : upload
        )));

        const { error: storageError } = await supabase.storage
          .from('booking-photos')
          .upload(filePath, file, { upsert: false });

        if (storageError) throw storageError;
        uploadedPath = filePath;

        setUploads((prev) => prev.map((upload, itemIndex) => (
          itemIndex === index ? { ...upload, progress: 70 } : upload
        )));

        const { error: dbError } = await supabase
          .from('booking_photos')
          .insert({
            booking_id: selectedBookingId,
            photo_url: filePath,
            photo_type: photoType,
            media_type: isVideo ? 'video' : 'photo',
            staff_id: staffId,
            organization_id: resolvedOrgId,
          });

        if (dbError) throw dbError;

        successCount += 1;
        setUploads((prev) => prev.map((upload, itemIndex) => (
          itemIndex === index ? { ...upload, progress: 100, status: 'done' } : upload
        )));
      } catch (error) {
        console.error('Staff media upload failed:', error);

        if (uploadedPath) {
          await supabase.storage.from('booking-photos').remove([uploadedPath]);
        }

        const uploadError = getUploadErrorMessage(error, isVideo);
        setUploads((prev) => prev.map((upload, itemIndex) => (
          itemIndex === index ? { ...upload, status: 'error', error: uploadError } : upload
        )));
      }
    }

    setIsUploading(false);
    queryClient.invalidateQueries({ queryKey: ['staff-uploaded-photos'] });
    queryClient.invalidateQueries({ queryKey: ['booking-photos'] });

    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully!`);
      setTimeout(() => {
        setUploads((prev) => prev.filter((upload) => upload.status !== 'done'));
      }, 1500);
    }
  };

  const retryUpload = (index: number) => {
    setUploads((prev) => prev.map((upload, itemIndex) => (
      itemIndex === index ? { ...upload, status: 'pending', progress: 0, error: undefined } : upload
    )));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">📷 Job Photos & Videos</h2>
        <p className="text-sm text-muted-foreground">Upload before & after media for your bookings</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-medium">Upload Job Photos</h3>

          <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a booking..." />
            </SelectTrigger>
            <SelectContent>
              {bookings.map((booking) => (
                <SelectItem key={booking.id} value={booking.id}>
                  #{booking.booking_number} — {booking.customer ? `${booking.customer.first_name} ${booking.customer.last_name}` : 'Unknown'} — {format(new Date(booking.scheduled_at), 'MMM d')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button type="button" variant={photoType === 'before' ? 'default' : 'outline'} size="sm" onClick={() => setPhotoType('before')} className="flex-1">
              📷 Before
            </Button>
            <Button type="button" variant={photoType === 'after' ? 'default' : 'outline'} size="sm" onClick={() => setPhotoType('after')} className="flex-1">
              ✅ After
            </Button>
            <Button type="button" variant={photoType === 'other' ? 'default' : 'outline'} size="sm" onClick={() => setPhotoType('other')} className="flex-1">
              📝 Other
            </Button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/x-m4v,.mov,.mp4"
            capture="environment"
            multiple
            tabIndex={-1}
            className={PICKER_INPUT_CLASS}
            onChange={handleFilesSelected}
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/x-m4v,.mov,.mp4"
            multiple
            tabIndex={-1}
            className={PICKER_INPUT_CLASS}
            onChange={handleFilesSelected}
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => openPicker(cameraInputRef.current)}
              disabled={isUploading || bookings.length === 0}
            >
              <Camera className="w-4 h-4" />
              Camera
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => openPicker(libraryInputRef.current)}
              disabled={isUploading || bookings.length === 0}
            >
              <Upload className="w-4 h-4" />
              Library
            </Button>
          </div>

          {uploads.length > 0 && (
            <div className="space-y-2">
              {uploads.map((item, index) => (
                <div key={`${item.file.name}-${index}`} className="flex items-center gap-3 p-2 border rounded-lg">
                  <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                    {isVideoFile(item.file) ? (
                      <div className="w-full h-full flex items-center justify-center bg-black/80">
                        <Play className="w-5 h-5 text-white" />
                      </div>
                    ) : (
                      <img src={item.preview} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">{(item.file.size / (1024 * 1024)).toFixed(1)} MB</p>
                    {item.status === 'uploading' && <Progress value={item.progress} className="h-1 mt-1" />}
                    {item.status === 'done' && <p className="text-xs text-primary">Uploaded</p>}
                    {item.status === 'error' && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-destructive truncate">{item.error}</p>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => retryUpload(index)}>Retry</Button>
                      </div>
                    )}
                  </div>
                  {item.status === 'pending' && (
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => removeUpload(index)}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                className="w-full gap-2"
                onClick={uploadAll}
                disabled={isUploading || !selectedBookingId || uploads.filter((upload) => upload.status === 'pending').length === 0}
              >
                {isUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" />Upload All ({uploads.filter((upload) => upload.status === 'pending').length})</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="font-medium mb-3">Your Uploaded Media</h3>
        {loadingPhotos ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : Object.keys(groupedPhotos).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Camera className="w-10 h-10 mx-auto mb-2" />
            <p>No photos uploaded yet</p>
            <p className="text-xs">Select a booking above and start uploading!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedPhotos).map(([bookingId, group]) => {
              const beforeItems = group.items.filter((item) => item.photo_type === 'before');
              const afterItems = group.items.filter((item) => item.photo_type === 'after');
              const otherItems = group.items.filter((item) => item.photo_type !== 'before' && item.photo_type !== 'after');

              return (
                <Card key={bookingId}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {group.booking?.customer
                            ? `${group.booking.customer.first_name} ${group.booking.customer.last_name}`
                            : `Booking #${group.booking?.booking_number}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {group.booking?.scheduled_at ? format(new Date(group.booking.scheduled_at), 'EEE, MMM d, yyyy') : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {group.items.length} file{group.items.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    {beforeItems.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">📷 Before</p>
                        <div className="grid grid-cols-2 sm:flex gap-2 overflow-x-auto">
                          {beforeItems.map((item) => (
                            <MediaThumbnail key={item.id} item={item} onClick={() => setPreviewItem({ url: item.photo_url, type: item.media_type || 'photo' })} />
                          ))}
                        </div>
                      </div>
                    )}

                    {afterItems.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">✅ After</p>
                        <div className="grid grid-cols-2 sm:flex gap-2 overflow-x-auto">
                          {afterItems.map((item) => (
                            <MediaThumbnail key={item.id} item={item} onClick={() => setPreviewItem({ url: item.photo_url, type: item.media_type || 'photo' })} />
                          ))}
                        </div>
                      </div>
                    )}

                    {otherItems.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">📝 Other</p>
                        <div className="grid grid-cols-2 sm:flex gap-2 overflow-x-auto">
                          {otherItems.map((item) => (
                            <MediaThumbnail key={item.id} item={item} onClick={() => setPreviewItem({ url: item.photo_url, type: item.media_type || 'photo' })} />
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">Sent to Admin ✅</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Media Preview</DialogTitle>
          </DialogHeader>
          {previewItem && (
            previewItem.type === 'video' ? (
              <SignedVideo src={previewItem.url} bucket="booking-photos" className="w-full rounded-lg" />
            ) : (
              <SignedImage
                src={previewItem.url}
                bucket="booking-photos"
                alt="Preview"
                className="w-full rounded-lg"
                fallback={<div className="w-full h-48 flex items-center justify-center bg-muted"><ImageIcon className="w-10 h-10 text-muted-foreground" /></div>}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaThumbnail({ item, onClick }: { item: PhotoRecord; onClick: () => void }) {
  const isVideo = item.media_type === 'video' || item.photo_url?.toLowerCase().endsWith('.mp4') || item.photo_url?.toLowerCase().endsWith('.mov');

  return (
    <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted cursor-pointer" onClick={onClick}>
      {isVideo ? (
        <div className="w-full h-full flex items-center justify-center bg-black/80">
          <Play className="w-6 h-6 text-white fill-white" />
        </div>
      ) : (
        <SignedImage
          src={item.photo_url}
          bucket="booking-photos"
          alt=""
          className="w-full h-full object-cover"
          fallback={<div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-5 h-5 text-muted-foreground" /></div>}
        />
      )}
      <Badge className="absolute bottom-0.5 right-0.5 text-[9px] px-1 py-0" variant="secondary">
        {isVideo ? '🎥' : '📷'}
      </Badge>
    </div>
  );
}

function SignedVideo({ src, bucket, className }: { src: string; bucket: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);

    supabase.storage.from(bucket).createSignedUrl(src, 3600).then(({ data }) => {
      if (active) {
        setUrl(data?.signedUrl ?? null);
      }
    });

    return () => {
      active = false;
    };
  }, [bucket, src]);

  if (!url) {
    return <div className={`flex items-center justify-center bg-muted ${className}`}><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return <video src={url} controls playsInline className={className} />;
}
