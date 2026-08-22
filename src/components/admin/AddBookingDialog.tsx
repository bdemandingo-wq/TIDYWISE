import { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon } from 'lucide-react';
import { BookingWithDetails } from '@/hooks/useBookings';
import { BookingFormProvider } from './booking-form/BookingFormContext';
import { BookingStepper } from './booking-form/BookingStepper';

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  booking?: BookingWithDetails | null;
  onDuplicate?: (booking: BookingWithDetails) => void;
  defaultCustomerId?: string | null;
}

export function AddBookingDialog({
  open,
  onOpenChange,
  defaultDate,
  booking,
  onDuplicate,
  defaultCustomerId,
}: AddBookingDialogProps) {
  // This dialog is opened from 5+ different call sites (BookingsPage,
  // SchedulerCalendar, UpcomingBookings, AdminHeader, MobileBottomNav),
  // each with its own trigger button, and is a CONTROLLED dialog
  // (open/onOpenChange from the caller's own state) rather than using
  // Radix's <DialogTrigger>. Radix's automatic "return focus to the
  // trigger" behavior relies on DialogTrigger recording that reference —
  // without it, focus doesn't return anywhere specific on close (confirmed
  // live 2026-07-14). Capturing document.activeElement ourselves at the
  // moment the dialog opens, and restoring it via onCloseAutoFocus, works
  // regardless of which of the 5+ triggers opened it, without needing to
  // change any of those call sites individually.
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[100vw] h-[100dvh] max-w-none rounded-none sm:w-auto sm:h-auto sm:max-w-6xl sm:max-h-[90vh] sm:rounded-lg overflow-hidden bg-gradient-to-br from-background via-background to-secondary/20 border-border/50 flex flex-col p-4 sm:p-6 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]"
        // A tap outside (very easy on mobile) was closing the dialog and
        // wiping a half-completed booking. Only the X button closes now.
        // Keyboard Escape is intentionally left enabled (Radix's default) —
        // unlike an accidental mobile tap, it's a deliberate, precise user
        // action, and blocking it entirely made this dialog impossible to
        // dismiss via keyboard from anywhere inside it (a WCAG "no keyboard
        // trap" violation), including from the nested customer-search
        // field. Confirmed live 2026-07-14: this dialog didn't close on
        // Escape at all, from any focus position, until this was removed.
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          // Fall back to Radix's default (focus whatever it thinks is
          // right) if the original trigger no longer exists in the DOM —
          // e.g. BookingsPage's "Create Booking" button only renders in
          // the empty state, so it may have unmounted after a booking was
          // created and the list is no longer empty.
          if (triggerRef.current && document.contains(triggerRef.current)) {
            e.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
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
          <BookingFormProvider defaultDate={defaultDate} booking={booking} defaultCustomerId={defaultCustomerId}>
            <BookingStepper 
              booking={booking} 
              onClose={() => onOpenChange(false)}
              onDuplicate={onDuplicate}
            />
          </BookingFormProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}