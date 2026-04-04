import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SignedImage } from '@/components/ui/signed-image';
import { Search, Camera, Calendar, User, Loader2, Image as ImageIcon, Trash2, Play, Download, Video } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';

interface BookingPhoto {
  id: string;
  booking_id: string;
  staff_id: string | null;
  photo_url: string;
  photo_type: string | null;
  caption: string | null;
  created_at: string | null;
  media_type?: string;
  booking?: {
    booking_number: number;
    scheduled_at: string;
    customer?: {
      first_name: string;
      last_name: string;
    } | null;
  } | null;
  staff?: {
    name: string;
  } | null;
}

function isVideoMedia(item: BookingPhoto): boolean {
  if (item.media_type === 'video') return true;
  const url = item.photo_url.toLowerCase();
  return url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.m4v');
}

function SignedVideo({ src, bucket, className }: { src: string; bucket: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(false);

    supabase.storage.from(bucket).createSignedUrl(src, 3600).then(({ data, error: signedUrlError }) => {
      if (!active) return;
      if (signedUrlError || !data?.signedUrl) {
        setError(true);
        return;
      }
      setUrl(data.signedUrl);
    });

    return () => {
      active = false;
    };
  }, [bucket, src]);

  if (error) return (
    <div className={`flex items-center justify-center bg-muted ${className}`}>
      <Video className="w-8 h-8 text-muted-foreground" />
    </div>
  );

  if (!url) return (
    <div className={`flex items-center justify-center bg-muted ${className}`}>
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return <video src={url} controls playsInline className={className} />;
}

export default function BookingPhotosPage() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [mediaFilter, setMediaFilter] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<BookingPhoto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bookingPhotoSelect = `
    *,
    booking:bookings!booking_photos_booking_id_fkey(
      booking_number,
      scheduled_at,
      customer:customers!bookings_customer_id_fkey(first_name, last_name)
    ),
    staff:staff!booking_photos_staff_id_fkey(name)
  `;

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['booking-photos', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const merged = new Map<string, BookingPhoto>();

      const { data: directRows, error: directError } = await supabase
        .from('booking_photos')
        .select(bookingPhotoSelect)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      if (directError) throw directError;

      for (const row of (directRows || []) as unknown as BookingPhoto[]) {
        merged.set(row.id, row);
      }

      const { data: orgBookingRows, error: bookingError } = await supabase
        .from('bookings')
        .select('id')
        .eq('organization_id', organization.id)
        .limit(1000);

      if (bookingError) throw bookingError;

      const bookingIds = (orgBookingRows || []).map((row) => row.id);
      if (bookingIds.length) {
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from('booking_photos')
          .select(bookingPhotoSelect)
          .in('booking_id', bookingIds)
          .order('created_at', { ascending: false });

        if (fallbackError) throw fallbackError;

        for (const row of (fallbackRows || []) as unknown as BookingPhoto[]) {
          merged.set(row.id, row);
        }
      }

      return Array.from(merged.values()).sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
    },
    enabled: !!organization?.id,
  });

  const filtered = photos.filter((photo) => {
    const matchesType = typeFilter === 'all' || photo.photo_type === typeFilter;
    const matchesMedia = mediaFilter === 'all' || (mediaFilter === 'video' ? isVideoMedia(photo) : !isVideoMedia(photo));

    if (!searchTerm) return matchesType && matchesMedia;

    const term = searchTerm.toLowerCase();
    const customerName = photo.booking?.customer
      ? `${photo.booking.customer.first_name} ${photo.booking.customer.last_name}`.toLowerCase()
      : '';
    const staffName = photo.staff?.name?.toLowerCase() || '';
    const bookingNum = photo.booking?.booking_number?.toString() || '';

    return matchesType && matchesMedia && (customerName.includes(term) || staffName.includes(term) || bookingNum.includes(term));
  });

  const handleDelete = async (photo: BookingPhoto) => {
    if (!confirm(`Delete this ${isVideoMedia(photo) ? 'video' : 'photo'}? This cannot be undone.`)) return;

    setDeletingId(photo.id);
    try {
      await supabase.storage.from('booking-photos').remove([photo.photo_url]);
      const { error } = await supabase.from('booking_photos').delete().eq('id', photo.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['booking-photos'] });
      toast.success(`${isVideoMedia(photo) ? 'Video' : 'Photo'} deleted`);
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (photo: BookingPhoto) => {
    try {
      const { data, error } = await supabase.storage.from('booking-photos').createSignedUrl(photo.photo_url, 300);
      if (error || !data?.signedUrl) throw error;
      const anchor = document.createElement('a');
      anchor.href = data.signedUrl;
      anchor.download = photo.photo_url.split('/').pop() || 'download';
      anchor.click();
    } catch {
      toast.error('Failed to download');
    }
  };

  const videoCount = photos.filter((photo) => isVideoMedia(photo)).length;
  const photoCount = photos.length - videoCount;

  return (
    <AdminLayout title="Booking Media">
      <SEOHead title="Booking Media | TidyWise" description="View and manage photos and videos from your cleaning bookings" noIndex />
      <SubscriptionGate feature="Booking Photos">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Booking Media</h1>
            <p className="text-muted-foreground">All before & after photos and videos uploaded by your cleaners</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer, cleaner, or booking #..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="before">Before</SelectItem>
                <SelectItem value="after">After</SelectItem>
              </SelectContent>
            </Select>
            <Select value={mediaFilter} onValueChange={setMediaFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Media</SelectItem>
                <SelectItem value="photo">📷 Photos</SelectItem>
                <SelectItem value="video">🎥 Videos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{photos.length} total</span>
            <span>•</span>
            <span>📷 {photoCount} photos</span>
            <span>•</span>
            <span>🎥 {videoCount} videos</span>
            <span>•</span>
            <span>{photos.filter((photo) => photo.photo_type === 'before').length} before</span>
            <span>•</span>
            <span>{photos.filter((photo) => photo.photo_type === 'after').length} after</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Camera className="w-12 h-12 mb-3" />
              <p className="text-lg font-medium">No media yet</p>
              <p className="text-sm">Photos and videos will appear here when your cleaners upload them from the staff portal</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filtered.map((photo) => {
                const isVideo = isVideoMedia(photo);
                return (
                  <Card
                    key={photo.id}
                    className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <div className="aspect-square relative bg-muted">
                      {isVideo ? (
                        <div className="w-full h-full flex items-center justify-center bg-black/80">
                          <Play className="w-10 h-10 text-white fill-white" />
                        </div>
                      ) : (
                        <SignedImage
                          src={photo.photo_url}
                          bucket="booking-photos"
                          alt={`${photo.photo_type || 'Booking'} photo`}
                          className="w-full h-full object-cover"
                          fallback={
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                          }
                        />
                      )}
                      <div className="absolute top-2 left-2 flex gap-1">
                        <Badge className="text-xs capitalize" variant={photo.photo_type === 'before' ? 'secondary' : 'default'}>
                          {photo.photo_type || 'photo'}
                        </Badge>
                        <Badge className="text-xs" variant="outline">
                          {isVideo ? '🎥' : '📷'}
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="p-2">
                      <p className="text-xs font-medium truncate">
                        {photo.booking?.customer
                          ? `${photo.booking.customer.first_name} ${photo.booking.customer.last_name}`
                          : `Booking #${photo.booking?.booking_number || '—'}`}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {photo.staff ? photo.staff.name : 'Unknown cleaner'}
                      </p>
                      {photo.created_at && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(photo.created_at), 'MMM d, yyyy')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedPhoto && isVideoMedia(selectedPhoto) ? <Video className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                {selectedPhoto?.photo_type === 'before' ? 'Before' : 'After'} {selectedPhoto && isVideoMedia(selectedPhoto) ? 'Video' : 'Photo'} — Booking #{selectedPhoto?.booking?.booking_number}
              </DialogTitle>
            </DialogHeader>
            {selectedPhoto && (
              <div className="space-y-4">
                <div className="rounded-lg overflow-hidden bg-muted">
                  {isVideoMedia(selectedPhoto) ? (
                    <SignedVideo
                      src={selectedPhoto.photo_url}
                      bucket="booking-photos"
                      className="w-full max-h-[60vh]"
                    />
                  ) : (
                    <SignedImage
                      src={selectedPhoto.photo_url}
                      bucket="booking-photos"
                      alt="Full size"
                      className="w-full max-h-[60vh] object-contain"
                      fallback={
                        <div className="w-full h-64 flex items-center justify-center">
                          <ImageIcon className="w-12 h-12 text-muted-foreground" />
                        </div>
                      }
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {selectedPhoto.booking?.customer
                        ? `${selectedPhoto.booking.customer.first_name} ${selectedPhoto.booking.customer.last_name}`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>Cleaner: {selectedPhoto.staff ? selectedPhoto.staff.name : '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {selectedPhoto.booking?.scheduled_at
                        ? format(new Date(selectedPhoto.booking.scheduled_at), 'EEE, MMM d, yyyy')
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Uploaded: {selectedPhoto.created_at ? format(new Date(selectedPhoto.created_at), 'MMM d, yyyy h:mm a') : '—'}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDownload(selectedPhoto)}
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDelete(selectedPhoto)}
                    disabled={deletingId === selectedPhoto.id}
                  >
                    {deletingId === selectedPhoto.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </SubscriptionGate>
    </AdminLayout>
  );
}
