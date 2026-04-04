import { useState, useRef } from 'react';
import { Camera, Upload, X, CheckCircle, Loader2, ImageIcon, Video, Play, ChevronDown } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
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

const PHOTO_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
const ALLOWED_PHOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_VIDEO = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

function isVideoFile(file: File) {
  return file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov');
}

export function StaffPhotosTab({ staffId, organizationId }: StaffPhotosTabProps) {
  const queryClient = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [photoType, setPhotoType] = useState<string>('after');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<{ url: string; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch assigned bookings for dropdown
  const { data: bookings = [] } = useQuery({
    queryKey: ['staff-photo-bookings', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, scheduled_at, customer:customers(first_name, last_name), service:services(name)')
        .eq('staff_id', staffId)
        .in('status', ['pending', 'confirmed', 'in_progress', 'completed'])
        .order('scheduled_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as BookingOption[];
    },
    enabled: !!staffId,
  });

  // Fetch uploaded photos grouped by booking
  const { data: photos = [], isLoading: loadingPhotos } = useQuery({
    queryKey: ['staff-uploaded-photos', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_photos')
        .select(`
          id, booking_id, photo_url, photo_type, media_type, created_at,
          booking:bookings!booking_photos_booking_id_fkey(
            booking_number, scheduled_at,
            customer:customers!bookings_customer_id_fkey(first_name, last_name)
          )
        `)
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!staffId && !!organizationId,
  });

  // Group photos by booking
  const groupedPhotos = photos.reduce<Record<string, { booking: any; items: typeof photos }>>((acc, p) => {
    const key = p.booking_id;
    if (!acc[key]) {
      acc[key] = { booking: (p as any).booking, items: [] };
    }
    acc[key].items.push(p);
    return acc;
  }, {});

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newUploads: UploadItem[] = [];
    for (const file of files) {
      const isVid = isVideoFile(file);
      // Validate type
      if (!isVid && !ALLOWED_PHOTO.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
        toast.error(`${file.name}: Unsupported format. Use JPG, PNG, or HEIC.`);
        continue;
      }
      if (isVid && !ALLOWED_VIDEO.includes(file.type) && !file.name.toLowerCase().endsWith('.mov')) {
        toast.error(`${file.name}: Unsupported format. Use MP4 or MOV.`);
        continue;
      }
      // Validate size
      const maxSize = isVid ? VIDEO_MAX : PHOTO_MAX;
      if (file.size > maxSize) {
        toast.error(`${file.name}: Too large. ${isVid ? 'Videos must be under 100MB.' : 'Photos must be under 10MB.'}`);
        continue;
      }
      newUploads.push({
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        status: 'pending',
      });
    }
    setUploads(prev => [...prev, ...newUploads]);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeUpload = (index: number) => {
    setUploads(prev => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].preview);
      copy.splice(index, 1);
      return copy;
    });
  };

  const uploadAll = async () => {
    if (!selectedBookingId) {
      toast.error('Please select a booking first.');
      return;
    }
    if (uploads.filter(u => u.status === 'pending').length === 0) {
      toast.error('No files to upload.');
      return;
    }

    setIsUploading(true);

    for (let i = 0; i < uploads.length; i++) {
      if (uploads[i].status !== 'pending') continue;

      setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, status: 'uploading', progress: 10 } : u));

      try {
        const file = uploads[i].file;
        const isVid = isVideoFile(file);
        const ext = file.name.split('.').pop() || (isVid ? 'mp4' : 'jpg');
        const filePath = `${organizationId}/${selectedBookingId}/${staffId}/${photoType}/${Date.now()}_${i}.${ext}`;

        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 30 } : u));

        const { error: storageError } = await supabase.storage
          .from('booking-photos')
          .upload(filePath, file);

        if (storageError) throw storageError;

        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 70 } : u));

        const { error: dbError } = await supabase
          .from('booking_photos')
          .insert({
            booking_id: selectedBookingId,
            staff_id: staffId,
            organization_id: organizationId,
            photo_url: filePath,
            photo_type: photoType,
            media_type: isVid ? 'video' : 'photo',
          });

        if (dbError) throw new Error(dbError.message);

        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 100, status: 'done' } : u));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, status: 'error', error: msg } : u));
      }
    }

    setIsUploading(false);
    queryClient.invalidateQueries({ queryKey: ['staff-uploaded-photos'] });

    const successCount = uploads.filter(u => u.status === 'done').length;
    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully!`);
      // Clear completed uploads after a moment
      setTimeout(() => {
        setUploads(prev => prev.filter(u => u.status !== 'done'));
      }, 2000);
    }
  };

  const retryUpload = (index: number) => {
    setUploads(prev => prev.map((u, idx) => idx === index ? { ...u, status: 'pending', progress: 0, error: undefined } : u));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">📷 Job Photos & Videos</h2>
        <p className="text-sm text-muted-foreground">Upload before & after media for your bookings</p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-medium">Upload Job Photos</h3>

          {/* Booking Selector */}
          <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a booking..." />
            </SelectTrigger>
            <SelectContent>
              {bookings.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  #{b.booking_number} — {b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown'} — {format(new Date(b.scheduled_at), 'MMM d')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Photo Type */}
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

          {/* File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,.mov"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.setAttribute('capture', 'environment');
                  fileInputRef.current.click();
                  setTimeout(() => fileInputRef.current?.removeAttribute('capture'), 100);
                }
              }}
            >
              <Camera className="w-4 h-4" />
              Camera
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture');
                  fileInputRef.current.click();
                }
              }}
            >
              <Upload className="w-4 h-4" />
              Library
            </Button>
          </div>

          {/* Upload Queue */}
          {uploads.length > 0 && (
            <div className="space-y-2">
              {uploads.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 border rounded-lg">
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
                    {item.status === 'done' && <p className="text-xs text-green-600">✅ Uploaded</p>}
                    {item.status === 'error' && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-destructive truncate">{item.error}</p>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => retryUpload(idx)}>Retry</Button>
                      </div>
                    )}
                  </div>
                  {item.status === 'pending' && (
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => removeUpload(idx)}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                className="w-full gap-2"
                onClick={uploadAll}
                disabled={isUploading || !selectedBookingId || uploads.filter(u => u.status === 'pending').length === 0}
              >
                {isUploading ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</> : <><CheckCircle className="w-4 h-4" />Upload All ({uploads.filter(u => u.status === 'pending').length})</>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Gallery */}
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
              const beforeItems = group.items.filter(p => p.photo_type === 'before');
              const afterItems = group.items.filter(p => p.photo_type === 'after');
              const otherItems = group.items.filter(p => p.photo_type !== 'before' && p.photo_type !== 'after');

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
                        <div className="flex gap-2 overflow-x-auto">
                          {beforeItems.map(p => (
                            <MediaThumbnail key={p.id} item={p} onClick={() => setPreviewItem({ url: p.photo_url, type: (p as any).media_type || 'photo' })} />
                          ))}
                        </div>
                      </div>
                    )}

                    {afterItems.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">✅ After</p>
                        <div className="flex gap-2 overflow-x-auto">
                          {afterItems.map(p => (
                            <MediaThumbnail key={p.id} item={p} onClick={() => setPreviewItem({ url: p.photo_url, type: (p as any).media_type || 'photo' })} />
                          ))}
                        </div>
                      </div>
                    )}

                    {otherItems.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">📝 Other</p>
                        <div className="flex gap-2 overflow-x-auto">
                          {otherItems.map(p => (
                            <MediaThumbnail key={p.id} item={p} onClick={() => setPreviewItem({ url: p.photo_url, type: (p as any).media_type || 'photo' })} />
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

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={open => !open && setPreviewItem(null)}>
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

function MediaThumbnail({ item, onClick }: { item: any; onClick: () => void }) {
  const isVid = item.media_type === 'video' || item.photo_url?.toLowerCase().endsWith('.mp4') || item.photo_url?.toLowerCase().endsWith('.mov');

  return (
    <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted cursor-pointer" onClick={onClick}>
      {isVid ? (
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
        {isVid ? '🎥' : '📷'}
      </Badge>
    </div>
  );
}

function SignedVideo({ src, bucket, className }: { src: string; bucket: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useState(() => {
    supabase.storage.from(bucket).createSignedUrl(src, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  });

  if (!url) return <div className={`flex items-center justify-center bg-muted ${className}`}><Loader2 className="w-6 h-6 animate-spin" /></div>;
  return <video src={url} controls playsInline className={className} />;
}
