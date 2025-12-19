import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BookingWithDetails } from '@/hooks/useBookings';

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  booking?: BookingWithDetails | null;
}

export function AddBookingDialog({ open, onOpenChange, defaultDate, booking }: AddBookingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{booking ? 'Edit Booking' : 'New Booking'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden h-full">
          <iframe 
            src="https://agencyfootprintcleaning.bookingkoala.com/booknow?embed=true" 
            style={{ border: 'none', height: 'calc(90vh - 60px)' }}
            width="100%" 
            scrolling="yes"
            title="BookingKoala Booking Form"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
