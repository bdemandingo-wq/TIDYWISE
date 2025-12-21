import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Calendar, MapPin, Clock, User, Phone, Navigation, DollarSign } from 'lucide-react';

interface Booking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  duration: number;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  total_amount: number;
  cleaner_actual_payment: number | null;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  service: {
    name: string;
  } | null;
}

interface Props {
  booking: Booking;
  onUpdateStatus?: (bookingId: string, status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show') => void;
  isUpdating?: boolean;
}

export function MyJobCard({ booking, onUpdateStatus, isUpdating }: Props) {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending' },
      confirmed: { variant: 'default', label: 'Confirmed' },
      in_progress: { variant: 'default', label: 'In Progress' },
      completed: { variant: 'outline', label: 'Completed' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
    };
    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getGoogleMapsUrl = () => {
    if (!booking.address) return null;
    const fullAddress = `${booking.address}${booking.city ? `, ${booking.city}` : ''}${booking.state ? `, ${booking.state}` : ''}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
  };

  const mapsUrl = getGoogleMapsUrl();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">#{booking.booking_number}</CardTitle>
            <p className="text-sm text-muted-foreground">{booking.service?.name}</p>
          </div>
          {getStatusBadge(booking.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Your Earnings */}
        {booking.cleaner_actual_payment && booking.cleaner_actual_payment > 0 && (
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-primary">
                <DollarSign className="w-4 h-4" />
                <span>Your Pay</span>
              </div>
              <span className="font-bold text-primary">
                ${booking.cleaner_actual_payment.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span>{format(new Date(booking.scheduled_at), 'EEE, MMM d, yyyy')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span>
            {format(new Date(booking.scheduled_at), 'h:mm a')} ({booking.duration} min)
          </span>
        </div>
        {booking.customer && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-muted-foreground" />
            <span>
              {booking.customer.first_name} {booking.customer.last_name}
            </span>
          </div>
        )}
        {booking.customer?.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <a href={`tel:${booking.customer.phone}`} className="text-primary hover:underline">
              {booking.customer.phone}
            </a>
          </div>
        )}
        {booking.address && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
            <span>
              {booking.address}
              {booking.city ? `, ${booking.city}` : ''}
              {booking.state ? `, ${booking.state}` : ''}
            </span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {mapsUrl && (
            <Button variant="outline" size="sm" asChild className="flex-1 gap-2">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="w-4 h-4" />
                Directions
              </a>
            </Button>
          )}
          {booking.status === 'confirmed' && onUpdateStatus && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onUpdateStatus(booking.id, 'in_progress')}
              disabled={isUpdating}
            >
              Start Job
            </Button>
          )}
          {booking.status === 'in_progress' && onUpdateStatus && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onUpdateStatus(booking.id, 'completed')}
              disabled={isUpdating}
            >
              Complete Job
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
