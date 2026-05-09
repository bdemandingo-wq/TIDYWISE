import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export const CANCELLATION_CATEGORIES = [
  'Client Request',
  'Cleaner No-Show',
  'Weather',
  'Other',
] as const;

export type CancellationCategory = typeof CANCELLATION_CATEGORIES[number];

interface CancelBookingDialogProps {
  open: boolean;
  bookingNumber?: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { reason: string; category: CancellationCategory }) => Promise<void> | void;
}

export function CancelBookingDialog({
  open,
  bookingNumber,
  onOpenChange,
  onConfirm,
}: CancelBookingDialogProps) {
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<CancellationCategory>('Client Request');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm({ reason: reason.trim(), category });
      setReason('');
      setCategory('Client Request');
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Booking{bookingNumber ? ` #${bookingNumber}` : ''}</DialogTitle>
          <DialogDescription>
            Mark this booking as cancelled. This will exclude it from revenue and cleaner pay totals by default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cancel-category">Cancellation category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as CancellationCategory)}>
              <SelectTrigger id="cancel-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">
              Reason for cancellation <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              placeholder='e.g. "Client cancelled same-day", "No access to property", "Cleaner no-show"'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Go Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting || !reason.trim()}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
