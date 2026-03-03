import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SignedImage } from '@/components/ui/signed-image';
import { Search, Camera, Calendar, User, Loader2, Image as ImageIcon, X, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface BookingPhoto {
  id: string;
  booking_id: string;
  staff_id: string | null;
  photo_url: string;
  photo_type: string | null;
  caption: string | null;
  created_at: string | null;
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

export default function BookingPhotosPage() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<BookingPhoto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['booking-photos', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('booking_photos')
        .select(`
          *,
          booking:bookings!booking_photos_booking_id_fkey(
            booking_number,
            scheduled_at,
            customer:customers!bookings_customer_id_fkey(first_name, last_name)
          ),
          staff:staff!booking_photos_staff_id_fkey(name)
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as BookingPhoto[];
    },
    enabled: !!organization?.id,
  });

  const filtered = photos.filter(p => {
    const matchesType = typeFilter === 'all' || p.photo_type === typeFilter;
    if (!searchTerm) return matchesType;
    const term = searchTerm.toLowerCase();
    const customerName = p.booking?.customer
      ? `${p.booking.customer.first_name} ${p.booking.customer.last_name}`.toLowerCase()
      : '';
    const staffName = p.staff?.name?.toLowerCase() || '';
    const bookingNum = p.booking?.booking_number?.toString() || '';
    return matchesType && (customerName.includes(term) || staffName.includes(term) || bookingNum.includes(term));
  });

  const handleDelete = async (photo: BookingPhoto) => {
    if (!confirm('Delete this photo? This cannot be undone.')) return;
    setDeletingId(photo.id);
    try {
      // Delete from storage
      await supabase.storage.from('booking-photos').remove([photo.photo_url]);
      // Delete from DB
      const { error } = await supabase.from('booking_photos').delete().eq('id', photo.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['booking-photos'] });
      toast.success('Photo deleted');
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete photo');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminLayout title="Booking Photos">
      <SubscriptionGate feature="Booking Photos">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Booking Photos</h1>
          <p className="text-muted-foreground">All before & after photos uploaded by your cleaners</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer, cleaner, or booking #..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
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
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{photos.length} total photos</span>
          <span>•</span>
          <span>{photos.filter(p => p.photo_type === 'before').length} before</span>
          <span>•</span>
          <span>{photos.filter(p => p.photo_type === 'after').length} after</span>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Camera className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium">No photos yet</p>
            <p className="text-sm">Photos will appear here when your cleaners upload them from the staff portal</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map(photo => (
              <Card
                key={photo.id}
                className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => setSelectedPhoto(photo)}
              >
                <div className="aspect-square relative bg-muted">
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
                  <Badge
                    className="absolute top-2 left-2 text-xs capitalize"
                    variant={photo.photo_type === 'before' ? 'secondary' : 'default'}
                  >
                    {photo.photo_type || 'photo'}
                  </Badge>
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
            ))}
          </div>
        )}
      </div>

      {/* Full-size photo dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={open => !open && setSelectedPhoto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              {selectedPhoto?.photo_type === 'before' ? 'Before' : 'After'} Photo — Booking #{selectedPhoto?.booking?.booking_number}
            </DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden bg-muted">
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
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={() => handleDelete(selectedPhoto)}
                  disabled={deletingId === selectedPhoto.id}
                >
                  {deletingId === selectedPhoto.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Photo
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
