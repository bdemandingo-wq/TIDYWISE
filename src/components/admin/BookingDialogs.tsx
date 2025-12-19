import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { BookingWithDetails, useStaff, useUpdateBooking } from "@/hooks/useBookings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const STATUS_OPTIONS: Array<{ value: BookingWithDetails["status"]; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

export function BookingDetailsDialog({
  open,
  onOpenChange,
  booking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingWithDetails | null;
}) {
  if (!booking) return null;

  const scheduled = new Date(booking.scheduled_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Booking #{booking.booking_number}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Customer</dt>
                <dd className="text-sm font-medium">
                  {booking.customer
                    ? `${booking.customer.first_name} ${booking.customer.last_name}`
                    : "Unknown"}
                </dd>
                <dd className="text-xs text-muted-foreground">{booking.customer?.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Service</dt>
                <dd className="text-sm font-medium">{booking.service?.name || "Unknown"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Scheduled</dt>
                <dd className="text-sm font-medium">{format(scheduled, "MMM d, yyyy")}</dd>
                <dd className="text-xs text-muted-foreground">{format(scheduled, "h:mm a")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Staff</dt>
                <dd className="text-sm font-medium">{booking.staff?.name || "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="text-sm font-medium capitalize">{booking.status.replace("_", " ")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Payment</dt>
                <dd className="text-sm font-medium capitalize">{booking.payment_status}</dd>
              </div>
            </dl>
          </div>

          {booking.notes ? (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{booking.notes}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditBookingDialog({
  open,
  onOpenChange,
  booking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingWithDetails | null;
}) {
  const { data: staff = [], isLoading: staffLoading } = useStaff();
  const updateBooking = useUpdateBooking();

  const initial = useMemo(() => {
    if (!booking) return null;
    const d = new Date(booking.scheduled_at);
    return {
      status: booking.status,
      date: format(d, "yyyy-MM-dd"),
      time: format(d, "HH:mm"),
      staffId: booking.staff?.id || "",
      notes: booking.notes || "",
      amount: String(booking.total_amount ?? ""),
    };
  }, [booking]);

  const [status, setStatus] = useState<BookingWithDetails["status"]>("pending");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  useEffect(() => {
    if (!open || !initial) return;
    setStatus(initial.status);
    setDate(initial.date);
    setTime(initial.time);
    setStaffId(initial.staffId);
    setNotes(initial.notes);
    setAmount(initial.amount);
  }, [open, initial]);

  if (!booking) return null;

  const saving = updateBooking.isPending;

  const handleSave = async () => {
    try {
      const scheduledAtIso = date && time ? new Date(`${date}T${time}:00`).toISOString() : booking.scheduled_at;
      const parsedAmount = Number(amount);

      await updateBooking.mutateAsync({
        id: booking.id,
        status,
        scheduled_at: scheduledAtIso,
        staff_id: staffId || null,
        notes: notes || null,
        total_amount: Number.isFinite(parsedAmount) ? parsedAmount : booking.total_amount,
      } as any);

      toast({ title: "Saved", description: "Booking updated" });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update booking",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Booking #{booking.booking_number}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Staff</Label>
              <Select value={staffId} onValueChange={setStaffId} disabled={staffLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={staffLoading ? "Loading..." : "Unassigned"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {staff.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Amount</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
