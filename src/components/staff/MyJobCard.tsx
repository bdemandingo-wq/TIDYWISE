import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { Calendar, MapPin, Clock, User, Phone, Navigation, DollarSign, ClipboardCheck, Car, Loader2, FileText, Users } from 'lucide-react';
import { BookingPhotoUpload } from './BookingPhotoUpload';
import { BookingChecklist } from './BookingChecklist';
import { useMapsNavigation } from '@/hooks/useMapsNavigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface StaffInfo {
  hourly_rate: number | null;
  base_wage: number | null;
  percentage_rate: number | null;
  default_hours: number | null;
}

interface Booking {
  id: string;
  organization_id?: string | null;
  booking_number: number;
  scheduled_at: string;
  duration: number;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  total_amount: number;
  cleaner_wage: number | null;
  cleaner_wage_type: string | null;
  cleaner_actual_payment: number | null;
  cleaner_checkin_at?: string | null;
  cleaner_checkout_at?: string | null;
  notes?: string | null;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  service: {
    name: string;
  } | null;
  team_pay_share?: number | null;
  team_members?: string[];
}

interface Props {
  booking: Booking;
  staffInfo: StaffInfo & { id?: string };
  onUpdateStatus?: (bookingId: string, status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show') => void;
  isUpdating?: boolean;
}

export function MyJobCard({ booking, staffInfo, onUpdateStatus, isUpdating }: Props) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [isSendingOnTheWay, setIsSendingOnTheWay] = useState(false);
  const [onTheWaySent, setOnTheWaySent] = useState(false);

  const handleOnTheWayClick = async () => {
    if (!staffInfo.id || !booking.customer?.phone) {
      toast.error('Customer phone number is required');
      return;
    }

    setIsSendingOnTheWay(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-on-the-way-sms', {
        body: {
          bookingId: booking.id,
          staffId: staffInfo.id,
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Customer notified that you\'re on the way!');
        setOnTheWaySent(true);
      } else {
        toast.error(data?.error || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Error sending on the way SMS:', error);
      toast.error('Failed to send notification');
    } finally {
      setIsSendingOnTheWay(false);
    }
  };
  
  // Get actual hours from check-in/out if available
  const getActualHours = (): number => {
    if (booking.cleaner_checkin_at && booking.cleaner_checkout_at) {
      const checkin = new Date(booking.cleaner_checkin_at).getTime();
      const checkout = new Date(booking.cleaner_checkout_at).getTime();
      return (checkout - checkin) / (1000 * 60 * 60);
    }
    if (booking.cleaner_checkin_at && booking.status === 'in_progress') {
      // Job in progress - show elapsed time so far
      const checkin = new Date(booking.cleaner_checkin_at).getTime();
      return (Date.now() - checkin) / (1000 * 60 * 60);
    }
    return staffInfo.default_hours || booking.duration / 60 || 2;
  };

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

    const hours = getActualHours();
    const hasActualTime = !!(booking.cleaner_checkin_at && booking.cleaner_checkout_at);

    // If booking has specific cleaner wage set
    if (booking.cleaner_wage && booking.cleaner_wage_type) {
      if (booking.cleaner_wage_type === 'percentage') {
        return {
          amount: (booking.total_amount * booking.cleaner_wage) / 100,
          type: `${booking.cleaner_wage}% of job`,
          isExact: true,
        };
      } else if (booking.cleaner_wage_type === 'flat') {
        return {
          amount: booking.cleaner_wage,
          type: 'Flat rate',
          isExact: true,
        };
      } else {
        return {
          amount: booking.cleaner_wage * hours,
          type: `$${booking.cleaner_wage}/hr × ${hours.toFixed(1)}hrs`,
          isExact: hasActualTime,
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
      return {
        amount: staffInfo.hourly_rate * hours,
        type: `$${staffInfo.hourly_rate}/hr × ${hours.toFixed(1)}hrs`,
        isExact: hasActualTime,
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

  const { openDirections, platform } = useMapsNavigation();
  
  const hasAddress = Boolean(booking.address);

  const handleDirectionsClick = () => {
    openDirections({
      address: booking.address,
      city: booking.city,
      state: booking.state,
      label: `Job #${booking.booking_number}`,
    });
  };

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
        {/* Always show address section - show message if missing */}
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
          {booking.address ? (
            <span>
              {booking.address}
              {booking.city ? `, ${booking.city}` : ''}
              {booking.state ? ` ${booking.state}` : ''}
              {booking.zip_code ? ` ${booking.zip_code}` : ''}
            </span>
          ) : (
            <span className="text-muted-foreground italic">No address provided</span>
          )}
        </div>

        {/* Notes section */}
        {booking.notes && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Special Instructions</p>
                <p className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap">{booking.notes}</p>
              </div>
            </div>
          </div>
        )}

        {/* Team Members */}
        {booking.team_members && booking.team_members.length > 0 && (
          <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Team Clean ({booking.team_members.length} members)</p>
                <p className="text-sm text-indigo-800 dark:text-indigo-200">
                  {booking.team_members.join(' • ')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {/* On The Way Button - only show for confirmed jobs */}
          {booking.status === 'confirmed' && booking.customer?.phone && (
            <Button
              variant={onTheWaySent ? "secondary" : "default"}
              size="sm"
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={handleOnTheWayClick}
              disabled={isSendingOnTheWay || onTheWaySent}
            >
              {isSendingOnTheWay ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Car className="w-4 h-4" />
              )}
              {onTheWaySent ? 'Sent!' : 'On The Way'}
            </Button>
          )}
          {hasAddress && (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={handleDirectionsClick}
            >
              <Navigation className="w-4 h-4" />
              Directions
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
                  organizationId={booking.organization_id || ''}
                  onComplete={() => setChecklistOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}
          {staffInfo.id && booking.status === 'in_progress' && (
            <BookingPhotoUpload 
              bookingId={booking.id} 
              staffId={staffInfo.id}
              organizationId={booking.organization_id || ''}
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
