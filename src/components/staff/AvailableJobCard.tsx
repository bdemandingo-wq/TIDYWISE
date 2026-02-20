import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { Calendar, MapPin, Clock, User, CheckCircle2, DollarSign, TrendingUp, Loader2, FileText } from 'lucide-react';

interface StaffInfo {
  hourly_rate: number | null;
  base_wage: number | null;
  percentage_rate: number | null;
  default_hours: number | null;
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
  square_footage?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  notes?: string | null;
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
  claimingBookingId?: string | null;
}

export function AvailableJobCard({ booking, staffInfo, onAssign, isAssigning, claimingBookingId }: Props) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isClaimingThisJob = isAssigning && claimingBookingId === booking.id;

  // Calculate potential earnings based on staff pay type
  // Priority: staff's own rate type wins over booking-level wage type
  const calculatePotentialEarnings = (): { amount: number; type: string } => {
    const defaultHours = staffInfo.default_hours || 5;

    // Staff percentage rate takes priority — even if booking says "flat"
    if (staffInfo.percentage_rate && staffInfo.percentage_rate > 0) {
      return {
        amount: (booking.total_amount * staffInfo.percentage_rate) / 100,
        type: `${staffInfo.percentage_rate}% of job value`,
      };
    }

    // Staff hourly rate takes priority — even if booking says "flat"
    if (staffInfo.hourly_rate && staffInfo.hourly_rate > 0) {
      return {
        amount: staffInfo.hourly_rate * defaultHours,
        type: `$${staffInfo.hourly_rate}/hr × ${defaultHours}hrs`,
      };
    }

    // No staff-level rate set — fall back to booking-level wage
    if (booking.cleaner_wage && booking.cleaner_wage_type) {
      if (booking.cleaner_wage_type === 'percentage') {
        return {
          amount: (booking.total_amount * booking.cleaner_wage) / 100,
          type: `${booking.cleaner_wage}% of job value`,
        };
      } else if (booking.cleaner_wage_type === 'flat') {
        return {
          amount: booking.cleaner_wage,
          type: 'Flat rate',
        };
      } else {
        return {
          amount: booking.cleaner_wage * defaultHours,
          type: `$${booking.cleaner_wage}/hr × ${defaultHours}hrs`,
        };
      }
    }

    return { amount: 0, type: 'TBD' };
  };

  const earnings = calculatePotentialEarnings();

  const handleClaimClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmClaim = () => {
    setShowConfirmDialog(false);
    onAssign(booking.id);
  };

  return (
    <>
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

          {/* Property Details */}
          <div className="flex flex-wrap gap-2 text-xs">
            {booking.square_footage && (
              <Badge variant="outline" className="bg-background">
                {booking.square_footage} sq ft
              </Badge>
            )}
            {booking.bedrooms && (
              <Badge variant="outline" className="bg-background">
                {booking.bedrooms} bed
              </Badge>
            )}
            {booking.bathrooms && (
              <Badge variant="outline" className="bg-background">
                {booking.bathrooms} bath
              </Badge>
            )}
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
          <Button
            className="w-full mt-2 gap-2 bg-green-600 hover:bg-green-700"
            onClick={handleClaimClick}
            disabled={isClaimingThisJob}
          >
            {isClaimingThisJob ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Claiming Job...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Claim This Job
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Job Claim</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>You are about to claim job #{booking.booking_number}.</p>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-700 dark:text-green-300">Potential Pay</span>
                  <span className="font-bold text-xl text-green-700 dark:text-green-300">
                    ${earnings.amount.toFixed(2)}
                  </span>
                </div>
              </div>
              <p className="text-sm">
                <strong>Date:</strong> {format(new Date(booking.scheduled_at), 'EEE, MMM d, yyyy')} at {format(new Date(booking.scheduled_at), 'h:mm a')}
              </p>
              {booking.address && (
                <p className="text-sm">
                  <strong>Location:</strong> {booking.address}{booking.city ? `, ${booking.city}` : ''}{booking.state ? `, ${booking.state}` : ''}
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmClaim}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirm & Claim Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
