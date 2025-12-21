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
}

export function AddBookingDialog({ 
  open, 
  onOpenChange, 
  defaultDate, 
  booking, 
  onDuplicate 
}: AddBookingDialogProps) {
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
          <BookingFormProvider defaultDate={defaultDate} booking={booking}>
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
