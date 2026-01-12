import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { Calendar, MapPin, Clock, User, Phone, Navigation, DollarSign, ClipboardCheck } from 'lucide-react';
import { BookingPhotoUpload } from './BookingPhotoUpload';
import { BookingChecklist } from './BookingChecklist';

interface StaffInfo {
  hourly_rate: number | null;
  base_wage: number | null;
  percentage_rate: number | null;
}

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
  cleaner_wage: number | null;
  cleaner_wage_type: string | null;
  cleaner_actual_payment: number | null;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  service: {
    name: string;
  } | null;
  team_pay_share?: number | null;
}

interface Props {
  booking: Booking;
  staffInfo: StaffInfo & { id?: string };
  onUpdateStatus?: (bookingId: string, status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show') => void;
  isUpdating?: boolean;
}

export function MyJobCard({ booking, staffInfo, onUpdateStatus, isUpdating }: Props) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  
  // Calculate exact pay based on wage type
  const calculatePay = (): { amount: number; type: string; isExact: boolean } => {
    // If team pay share is set, use it directly
    if (booking.team_pay_share && booking.team_pay_share > 0) {
      return {
        amount: booking.team_pay_share,
        type: 'Team share',
        isExact: true,
      };
    }

    // If actual payment is already set by admin, use it
    if (booking.cleaner_actual_payment && booking.cleaner_actual_payment > 0) {
      return {
        amount: booking.cleaner_actual_payment,
        type: 'Confirmed',
        isExact: true,
      };
    }

    // If booking has specific cleaner wage set
    if (booking.cleaner_wage && booking.cleaner_wage_type) {
      if (booking.cleaner_wage_type === 'percentage') {
        return {
          amount: (booking.total_amount * booking.cleaner_wage) / 100,
          type: `${booking.cleaner_wage}% of job`,
          isExact: true,
        };
      } else if (booking.cleaner_wage_type === 'flat') {
        // FLAT RATE - exact amount
        return {
          amount: booking.cleaner_wage,
          type: 'Flat rate',
          isExact: true,
        };
      } else {
        // Hourly wage - estimate based on duration
        const hours = booking.duration / 60 || 2;
        return {
          amount: booking.cleaner_wage * hours,
          type: `$${booking.cleaner_wage}/hr × ${hours.toFixed(1)}hrs`,
          isExact: false,
        };
      }
    }

    // Fall back to staff's default rates - check percentage first
    if (staffInfo.percentage_rate && staffInfo.percentage_rate > 0) {
      return {
        amount: (booking.total_amount * staffInfo.percentage_rate) / 100,
        type: `${staffInfo.percentage_rate}% of job`,
        isExact: true,
      };
    }

    // Then check hourly rate
    if (staffInfo.hourly_rate && staffInfo.hourly_rate > 0) {
      const hours = booking.duration / 60 || 2;
      return {
        amount: staffInfo.hourly_rate * hours,
        type: `$${staffInfo.hourly_rate}/hr × ${hours.toFixed(1)}hrs`,
        isExact: false,
      };
    }

    // Default if no wage info
    return {
      amount: 0,
      type: 'TBD',
      isExact: false,
    };
  };

  const pay = calculatePay();

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
        {/* Pay Display - Exact vs Estimated */}
        {pay.amount > 0 && (
          <div className={`p-3 rounded-lg border ${
            pay.isExact 
              ? 'bg-primary/10 border-primary/20' 
              : 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 text-sm ${
                pay.isExact ? 'text-primary' : 'text-blue-700 dark:text-blue-300'
              }`}>
                <DollarSign className="w-4 h-4" />
                <span>{pay.isExact ? 'Your Pay' : 'Estimated Pay'}</span>
              </div>
              <span className={`font-bold text-lg ${
                pay.isExact ? 'text-primary' : 'text-blue-700 dark:text-blue-300'
              }`}>
                ${pay.amount.toFixed(2)}
              </span>
            </div>
            <p className={`text-xs mt-1 ${
              pay.isExact ? 'text-primary/70' : 'text-blue-600 dark:text-blue-400'
            }`}>
              {pay.type}
            </p>
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

        <div className="flex flex-wrap gap-2 pt-2">
          {mapsUrl && (
            <Button variant="outline" size="sm" asChild className="gap-2">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="w-4 h-4" />
                Directions
              </a>
            </Button>
          )}
          {staffInfo.id && (booking.status === 'in_progress' || booking.status === 'confirmed') && (
            <Dialog open={checklistOpen} onOpenChange={setChecklistOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  Checklist
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Job #{booking.booking_number} Checklist</DialogTitle>
                </DialogHeader>
                <BookingChecklist
                  bookingId={booking.id}
                  staffId={staffInfo.id}
                  onComplete={() => setChecklistOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}
          {staffInfo.id && booking.status === 'in_progress' && (
            <BookingPhotoUpload 
              bookingId={booking.id} 
              staffId={staffInfo.id} 
            />
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
