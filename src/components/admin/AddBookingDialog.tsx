import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Lock, Sparkles, ExternalLink } from 'lucide-react';
import { BookingWithDetails } from '@/hooks/useBookings';
import { BookingFormProvider } from './booking-form/BookingFormContext';
import { BookingStepper } from './booking-form/BookingStepper';
import { useAuth } from '@/hooks/useAuth';
import { usePlatform } from '@/hooks/usePlatform';

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  booking?: BookingWithDetails | null;
  onDuplicate?: (booking: BookingWithDetails) => void;
}

export function AddBookingDialog({ 
  open, 
  onOpenChange, 
  defaultDate, 
  booking, 
  onDuplicate 
}: AddBookingDialogProps) {
  const { subscription, setShowSubscriptionDialog } = useAuth();
  const { canShowPaymentFlows, billingUrl } = usePlatform();
  const isSubscribed = subscription?.subscribed ?? false;

  // If editing existing booking, allow it. Only block new bookings for non-subscribers.
  // Don't block if subscription hasn't loaded yet (null = still checking)
  const shouldBlockNewBooking = !booking && subscription !== null && !isSubscribed;

  // Render subscription block content based on platform
  const renderSubscriptionBlock = () => {
    // On native: direct to website instead of showing subscription dialog
    if (!canShowPaymentFlows) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 rounded-full bg-muted mb-4">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Subscription Required</h3>
          <p className="text-muted-foreground mb-4 max-w-sm">
            Creating new bookings requires an active subscription. Manage your subscription at jointidywise.lovable.app
          </p>
          <Button 
            onClick={() => {
              onOpenChange(false);
              window.open(billingUrl, '_blank');
            }} 
            variant="outline"
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Manage Subscription on Web
          </Button>
        </div>
      );
    }

    // On web: show subscription dialog
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-full bg-muted mb-4">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Subscription Required</h3>
        <p className="text-muted-foreground mb-4 max-w-sm">
          Creating new bookings requires an active subscription. Start your free 2-month trial to unlock this feature.
        </p>
        <Button 
          onClick={() => {
            onOpenChange(false);
            setShowSubscriptionDialog(true);
          }} 
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Start Free Trial
        </Button>
      </div>
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden bg-gradient-to-br from-background via-background to-secondary/20 border-border/50 flex flex-col">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
              <CalendarIcon className="h-5 w-5 text-primary" />
            </div>
            <span>{booking ? 'Edit Booking' : 'New Booking'}</span>
            {booking?.is_draft && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                Draft
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4">
          {shouldBlockNewBooking ? (
            renderSubscriptionBlock()
          ) : (
            <BookingFormProvider defaultDate={defaultDate} booking={booking}>
              <BookingStepper 
                booking={booking} 
                onClose={() => onOpenChange(false)}
                onDuplicate={onDuplicate}
              />
            </BookingFormProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
