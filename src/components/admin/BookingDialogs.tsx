import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { BookingWithDetails, useStaff, useUpdateBooking } from "@/hooks/useBookings";
import { useOrgId } from "@/hooks/useOrgId";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, DollarSign, Percent, Clock, Send, CreditCard, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

const STATUS_OPTIONS: Array<{ value: BookingWithDetails["status"]; label: string }> = [
  { value: "pending", label: "Pending Payment" },
  { value: "confirmed", label: "Uncleaned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Clean Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

const WAGE_TYPE_OPTIONS = [
  { value: "hourly", label: "/hr", icon: Clock },
  { value: "flat", label: "$", icon: DollarSign },
  { value: "percentage", label: "%", icon: Percent },
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
  const [sendingLink, setSendingLink] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const { organizationId } = useOrgId();

  if (!booking) return null;

  const handleSendCardLink = async () => {
    if (!booking.customer?.email) {
      toast({
        title: "Error",
        description: "Customer email is required to send card link",
        variant: "destructive",
      });
      return;
    }

    setSendingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-card-collection-link', {
        body: {
          email: booking.customer.email,
          customerName: `${booking.customer.first_name} ${booking.customer.last_name}`,
          organizationId: organizationId ?? undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Card link sent!",
        description: `A secure card setup link has been emailed to ${booking.customer.email}`,
      });
    } catch (error: any) {
      console.error('Error sending card link:', error);
      toast({
        title: "Failed to send",
        description: error.message || "Could not send card collection link",
        variant: "destructive",
      });
    } finally {
      setSendingLink(false);
    }
  };

  const handleCreateQuote = async () => {
    if (!booking.customer?.id) {
      toast({
        title: "Error",
        description: "Customer is required to create a quote",
        variant: "destructive",
      });
      return;
    }

    setCreatingQuote(true);
    try {
      const extras = (booking as any).extras || [];
      const { data: quote, error } = await supabase
        .from('quotes')
        .insert({
          organization_id: organizationId,
          customer_id: booking.customer.id,
          service_id: booking.service?.id || null,
          address: booking.address || null,
          city: booking.city || null,
          state: booking.state || null,
          zip_code: booking.zip_code || null,
          bedrooms: (booking as any).bedrooms || null,
          bathrooms: (booking as any).bathrooms || null,
          square_footage: (booking as any).square_footage || null,
          extras: extras,
          subtotal: (booking as any).subtotal || booking.total_amount,
          total_amount: booking.total_amount,
          notes: booking.notes || null,
          status: 'draft',
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Quote created!",
        description: `Quote #${quote.quote_number} created. Go to Leads page to send it.`,
      });
      
      // Navigate to leads/quotes page
      window.location.href = '/dashboard/leads';
    } catch (error: any) {
      console.error('Error creating quote:', error);
      toast({
        title: "Failed to create quote",
        description: error.message || "Could not create quote",
        variant: "destructive",
      });
    } finally {
      setCreatingQuote(false);
    }
  };

  const scheduled = new Date(booking.scheduled_at);
  const bookingAny = booking as any;

  // Calculate cleaner pay display
  const getCleanerPayDisplay = () => {
    if (!bookingAny.cleaner_wage) return "Not set";
    
    const wage = bookingAny.cleaner_wage;
    const wageType = bookingAny.cleaner_wage_type || 'hourly';
    
    if (wageType === 'flat') {
      return `$${wage} flat fee`;
    } else if (wageType === 'percentage') {
      const amount = (booking.total_amount * wage) / 100;
      return `${wage}% ($${amount.toFixed(2)})`;
    } else {
      const hours = bookingAny.cleaner_override_hours || (booking.duration / 60);
      const amount = wage * hours;
      return `$${wage}/hr × ${hours}hrs = $${amount.toFixed(2)}`;
    }
  };

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
              <div>
                <dt className="text-xs text-muted-foreground">Total Amount</dt>
                <dd className="text-sm font-medium">${booking.total_amount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cleaner Pay</dt>
                <dd className="text-sm font-medium">{getCleanerPayDisplay()}</dd>
              </div>
              {bookingAny.cleaner_actual_payment && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Actual Paid to Cleaner</dt>
                  <dd className="text-sm font-bold text-emerald-600">${bookingAny.cleaner_actual_payment}</dd>
                </div>
              )}
            </dl>
          </div>

          {booking.notes ? (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{booking.notes}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {booking.customer?.id && (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={handleCreateQuote}
              disabled={creatingQuote}
            >
              {creatingQuote ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Create Quote
            </Button>
          )}
          {booking.customer?.email && (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={handleSendCardLink}
              disabled={sendingLink}
            >
              {sendingLink ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Send Card Link
            </Button>
          )}
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
    const bookingAny = booking as any;
    return {
      status: booking.status,
      date: format(d, "yyyy-MM-dd"),
      time: format(d, "HH:mm"),
      staffId: booking.staff?.id || "",
      notes: booking.notes || "",
      amount: String(booking.total_amount ?? ""),
      cleanerWage: bookingAny.cleaner_wage ? String(bookingAny.cleaner_wage) : "",
      cleanerWageType: bookingAny.cleaner_wage_type || "hourly",
      cleanerOverrideHours: bookingAny.cleaner_override_hours ? String(bookingAny.cleaner_override_hours) : "",
      cleanerActualPayment: bookingAny.cleaner_actual_payment ? String(bookingAny.cleaner_actual_payment) : "",
    };
  }, [booking]);

  const [status, setStatus] = useState<BookingWithDetails["status"]>("pending");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [cleanerWage, setCleanerWage] = useState<string>("");
  const [cleanerWageType, setCleanerWageType] = useState<string>("hourly");
  const [cleanerOverrideHours, setCleanerOverrideHours] = useState<string>("");
  const [cleanerActualPayment, setCleanerActualPayment] = useState<string>("");
  const [showActualPayment, setShowActualPayment] = useState(false);

  useEffect(() => {
    if (!open || !initial) return;
    setStatus(initial.status);
    setDate(initial.date);
    setTime(initial.time);
    setStaffId(initial.staffId);
    setNotes(initial.notes);
    setAmount(initial.amount);
    setCleanerWage(initial.cleanerWage);
    setCleanerWageType(initial.cleanerWageType);
    setCleanerOverrideHours(initial.cleanerOverrideHours);
    setCleanerActualPayment(initial.cleanerActualPayment);
    setShowActualPayment(initial.status === 'completed' || !!initial.cleanerActualPayment);
  }, [open, initial]);

  // Show actual payment field when status changes to completed
  useEffect(() => {
    if (status === 'completed' && !showActualPayment) {
      setShowActualPayment(true);
    }
  }, [status]);

  if (!booking) return null;

  const saving = updateBooking.isPending;

  // Calculate estimated cleaner pay
  const calculateEstimatedPay = () => {
    const wage = parseFloat(cleanerWage);
    if (!wage || isNaN(wage)) return null;
    
    const totalAmt = parseFloat(amount) || booking.total_amount;
    
    if (cleanerWageType === 'flat') {
      return wage;
    } else if (cleanerWageType === 'percentage') {
      return (totalAmt * wage) / 100;
    } else {
      const hours = parseFloat(cleanerOverrideHours) || (booking.duration / 60);
      return wage * hours;
    }
  };

  const estimatedPay = calculateEstimatedPay();

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
        cleaner_wage: cleanerWage ? parseFloat(cleanerWage) : null,
        cleaner_wage_type: cleanerWageType || null,
        cleaner_override_hours: cleanerOverrideHours ? parseFloat(cleanerOverrideHours) : null,
        cleaner_actual_payment: cleanerActualPayment ? parseFloat(cleanerActualPayment) : null,
      });

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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>

          <Separator />

          {/* Cleaner Payment Section */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Cleaner Payment
            </h4>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Wage</Label>
                <Input 
                  type="number" 
                  value={cleanerWage} 
                  onChange={(e) => setCleanerWage(e.target.value)} 
                  placeholder="25"
                  inputMode="decimal"
                />
              </div>

              <div className="space-y-2">
                <Label>Wage Type</Label>
                <Select value={cleanerWageType} onValueChange={setCleanerWageType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WAGE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex items-center gap-2">
                          <o.icon className="w-4 h-4" />
                          {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {cleanerWageType === 'hourly' && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Override Time (hours)</Label>
                  <Input 
                    type="number" 
                    value={cleanerOverrideHours} 
                    onChange={(e) => setCleanerOverrideHours(e.target.value)} 
                    placeholder={`Default: ${(booking.duration / 60).toFixed(1)} hrs`}
                    inputMode="decimal"
                  />
                </div>
              )}

              {estimatedPay !== null && (
                <div className="sm:col-span-2 p-3 bg-secondary/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Estimated Cleaner Pay</p>
                  <p className="text-lg font-bold text-primary">${estimatedPay.toFixed(2)}</p>
                </div>
              )}
            </div>

            {showActualPayment && (
              <div className="space-y-2 p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                <Label className="text-primary font-semibold">Actual Amount Paid to Cleaner</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Adjust the final amount you actually paid the cleaner after the job was completed.
                </p>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    type="number" 
                    value={cleanerActualPayment} 
                    onChange={(e) => setCleanerActualPayment(e.target.value)} 
                    placeholder={estimatedPay ? estimatedPay.toFixed(2) : "0.00"}
                    className="pl-9"
                    inputMode="decimal"
                  />
                </div>
              </div>
            )}
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

export function AdjustPaymentDialog({
  open,
  onOpenChange,
  booking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingWithDetails | null;
}) {
  const updateBooking = useUpdateBooking();
  const [actualPayment, setActualPayment] = useState<string>("");
  
  const bookingAny = booking as any;

  useEffect(() => {
    if (open && booking) {
      setActualPayment(bookingAny?.cleaner_actual_payment ? String(bookingAny.cleaner_actual_payment) : "");
    }
  }, [open, booking]);

  if (!booking) return null;

  const saving = updateBooking.isPending;

  // Calculate estimated pay for reference
  const calculateEstimatedPay = () => {
    const wage = bookingAny?.cleaner_wage;
    if (!wage) return null;
    
    const wageType = bookingAny?.cleaner_wage_type || 'hourly';
    
    if (wageType === 'flat') {
      return wage;
    } else if (wageType === 'percentage') {
      return (booking.total_amount * wage) / 100;
    } else {
      const hours = bookingAny?.cleaner_override_hours || (booking.duration / 60);
      return wage * hours;
    }
  };

  const estimatedPay = calculateEstimatedPay();

  const handleSave = async () => {
    try {
      await updateBooking.mutateAsync({
        id: booking.id,
        cleaner_actual_payment: actualPayment ? parseFloat(actualPayment) : null,
      });

      toast({ title: "Saved", description: "Payment adjusted successfully" });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update payment",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Cleaner Payment</DialogTitle>
          <DialogDescription>
            Booking #{booking.booking_number} - {booking.staff?.name || "Unassigned"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-secondary/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Service Total:</span>
              <span className="font-medium">${booking.total_amount}</span>
            </div>
            {estimatedPay !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Estimated Cleaner Pay:</span>
                <span className="font-medium">${estimatedPay.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-semibold">Actual Amount Paid</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type="number" 
                value={actualPayment} 
                onChange={(e) => setActualPayment(e.target.value)} 
                placeholder={estimatedPay ? estimatedPay.toFixed(2) : "0.00"}
                className="pl-9 text-lg"
                inputMode="decimal"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the final amount you paid to the cleaner for this job.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
