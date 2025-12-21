import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Calendar, MapPin, Clock, User, CheckCircle2, DollarSign, TrendingUp } from 'lucide-react';

interface StaffInfo {
  hourly_rate: number | null;
  base_wage: number | null;
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
  staffInfo: StaffInfo;
  onAssign: (bookingId: string) => void;
  isAssigning: boolean;
}

export function AvailableJobCard({ booking, staffInfo, onAssign, isAssigning }: Props) {
  // Calculate potential earnings based on staff pay type
  const calculatePotentialEarnings = (): { amount: number; type: string } => {
    // If booking has specific cleaner wage set
    if (booking.cleaner_wage && booking.cleaner_wage_type) {
      if (booking.cleaner_wage_type === 'percentage') {
        return {
          amount: (booking.total_amount * booking.cleaner_wage) / 100,
          type: `${booking.cleaner_wage}% of job`,
        };
      } else {
        const hours = booking.duration / 60;
        return {
          amount: booking.cleaner_wage * hours,
          type: `$${booking.cleaner_wage}/hr`,
        };
      }
    }

    // Fall back to staff's default rates
    if (staffInfo.hourly_rate) {
      const hours = booking.duration / 60;
      return {
        amount: staffInfo.hourly_rate * hours,
        type: `$${staffInfo.hourly_rate}/hr`,
      };
    }

    if (staffInfo.base_wage) {
      return {
        amount: staffInfo.base_wage,
        type: 'Flat rate',
      };
    }

    // Default estimate if no wage info
    return {
      amount: 0,
      type: 'TBD',
    };
  };

  const earnings = calculatePotentialEarnings();

  return (
    <Card className="hover:shadow-md transition-shadow border-2 border-dashed border-green-200 dark:border-green-900">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">#{booking.booking_number}</CardTitle>
            <p className="text-sm text-muted-foreground">{booking.service?.name}</p>
          </div>
          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
            Open
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Potential Earnings - Highlighted */}
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <DollarSign className="w-4 h-4" />
              <span>Potential Earnings</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="font-bold text-lg text-green-700 dark:text-green-300">
                ${earnings.amount.toFixed(2)}
              </span>
            </div>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">{earnings.type}</p>
        </div>

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
        <Button
          className="w-full mt-2 gap-2 bg-green-600 hover:bg-green-700"
          onClick={() => onAssign(booking.id)}
          disabled={isAssigning}
        >
          <CheckCircle2 className="w-4 h-4" />
          {isAssigning ? 'Claiming Job...' : 'Claim This Job'}
        </Button>
      </CardContent>
    </Card>
  );
}
