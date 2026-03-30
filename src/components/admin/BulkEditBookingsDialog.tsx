import { useState, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Edit, Filter, User, Users, Clock, DollarSign, Wrench, X, Banknote } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format, getDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import type { BookingWithDetails } from '@/hooks/useBookings';

interface BulkEditBookingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings: BookingWithDetails[];
  staffList: { id: string; name: string }[];
  services: { id: string; name: string; price: number; duration: number }[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function BulkEditBookingsDialog({
  open,
  onOpenChange,
  bookings,
  staffList,
  services,
}: BulkEditBookingsDialogProps) {
  const queryClient = useQueryClient();

  // Filters
  const [filterCustomerId, setFilterCustomerId] = useState<string>('all');
  const [filterDays, setFilterDays] = useState<Set<number>>(new Set());
  const [filterServiceId, setFilterServiceId] = useState<string>('all');

  // Fields to edit
  const [editServiceId, setEditServiceId] = useState<string>('');
  const [editStaffIds, setEditStaffIds] = useState<string[]>([]);
  const [editTime, setEditTime] = useState<string>('');
  const [editPrice, setEditPrice] = useState<string>('');
  const [editCleanerPay, setEditCleanerPay] = useState<string>('');
  const [editIndividualPay, setEditIndividualPay] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Unique customers from bookings
  const customers = useMemo(() => {
    const map = new Map<string, string>();
    bookings.forEach((b) => {
      if (b.customer) {
        map.set(b.customer.id, `${b.customer.first_name} ${b.customer.last_name}`);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [bookings]);

  // Filter bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (filterCustomerId !== 'all' && b.customer?.id !== filterCustomerId) return false;
      if (filterDays.size > 0) {
        const dayOfWeek = getDay(new Date(b.scheduled_at));
        if (!filterDays.has(dayOfWeek)) return false;
      }
      if (filterServiceId !== 'all' && b.service?.id !== filterServiceId) return false;
      return true;
    });
  }, [bookings, filterCustomerId, filterDays, filterServiceId]);

  const toggleDay = (day: number) => {
    setFilterDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const hasIndividualPay = Object.values(editIndividualPay).some(v => v !== '');
  const hasChanges = editServiceId || editStaffIds.length > 0 || editTime || editPrice || editCleanerPay || hasIndividualPay;

  const handleApply = async () => {
    if (!hasChanges) {
      toast({ title: 'No changes', description: 'Select at least one field to edit', variant: 'destructive' });
      return;
    }
    if (filteredBookings.length === 0) {
      toast({ title: 'No bookings matched', description: 'Adjust your filters', variant: 'destructive' });
      return;
    }

    const ok = window.confirm(
      `Apply changes to ${filteredBookings.length} booking(s)?`
    );
    if (!ok) return;

    setSaving(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const booking of filteredBookings) {
        const updates: Record<string, any> = {};

        if (editServiceId) {
          updates.service_id = editServiceId;
          const svc = services.find((s) => s.id === editServiceId);
          if (svc && !editPrice) {
            // Only update price from service if no explicit price override
            updates.total_amount = svc.price;
          }
        }
        if (editStaffIds.length > 0) {
          updates.staff_id = editStaffIds[0]; // Primary cleaner
        }
        if (editPrice) {
          updates.total_amount = parseFloat(editPrice);
        }
        if (editCleanerPay) {
          updates.cleaner_pay_expected = parseFloat(editCleanerPay);
        }
        if (editTime) {
          // Keep same date, change time
          const existing = new Date(booking.scheduled_at);
          const [hours, minutes] = editTime.split(':').map(Number);
          existing.setHours(hours, minutes, 0, 0);
          updates.scheduled_at = existing.toISOString();
        }

        if (Object.keys(updates).length === 0) continue;

        const { error } = await supabase
          .from('bookings')
          .update(updates)
          .eq('id', booking.id);

        if (error) {
          console.error('Bulk edit error for booking', booking.id, error);
          failCount++;
        } else {
          // Update team assignments if staff changed
          if (editStaffIds.length > 0) {
            await supabase.from('booking_team_assignments').delete().eq('booking_id', booking.id);
            for (let i = 0; i < editStaffIds.length; i++) {
              const individualPay = editIndividualPay[editStaffIds[i]];
              let payShare: number;
              if (individualPay) {
                payShare = parseFloat(individualPay);
              } else if (editCleanerPay) {
                payShare = parseFloat(editCleanerPay) / editStaffIds.length;
              } else {
                payShare = 1 / editStaffIds.length;
              }
              await supabase.from('booking_team_assignments').insert({
                booking_id: booking.id,
                staff_id: editStaffIds[i],
                is_primary: i === 0,
                pay_share: payShare,
                organization_id: (booking as any).organization_id,
              });
            }
          }
          successCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking-team-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['all-team-assignments'] });

      toast({
        title: 'Bulk Edit Complete',
        description: `${successCount} booking(s) updated${failCount > 0 ? `, ${failCount} failed` : ''}`,
      });

      // Reset
      setEditServiceId('');
      setEditStaffIds([]);
      setEditTime('');
      setEditPrice('');
      setEditCleanerPay('');
      setEditIndividualPay({});
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Bulk edit failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-primary" />
            Bulk Edit Bookings
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* FILTERS */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              <Filter className="w-4 h-4" />
              Filter Bookings
            </div>

            {/* Customer filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Customer</Label>
              <Select value={filterCustomerId} onValueChange={setFilterCustomerId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Day of week filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Days of Week</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((name, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      filterDays.has(idx)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Service filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Service Type</Label>
              <Select value={filterServiceId} onValueChange={setFilterServiceId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="All services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <span className="text-sm font-medium text-foreground">
                {filteredBookings.length}
              </span>
              <span className="text-sm text-muted-foreground ml-1">
                booking(s) matched
              </span>
            </div>
          </div>

          {/* EDIT FIELDS */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              <Edit className="w-4 h-4" />
              Apply Changes
            </div>

            {/* Service type */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />
                Change Service Type
              </Label>
              <Select value={editServiceId || '__none__'} onValueChange={(v) => setEditServiceId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Keep current" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Keep current</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — ${s.price.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Staff (multi-select for team) */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Assign Cleaner(s)
              </Label>
              {editStaffIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editStaffIds.map((id) => {
                    const staff = staffList.find((s) => s.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1">
                        {staff?.name || 'Unknown'}
                        <button
                          onClick={() => setEditStaffIds((prev) => prev.filter((sid) => sid !== id))}
                          className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <Select
                value="__none__"
                onValueChange={(v) => {
                  if (v !== '__none__' && !editStaffIds.includes(v)) {
                    setEditStaffIds((prev) => [...prev, v]);
                  }
                }}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder={editStaffIds.length > 0 ? 'Add another cleaner...' : 'Keep current'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {editStaffIds.length > 0 ? 'Add another cleaner...' : 'Keep current'}
                  </SelectItem>
                  {staffList
                    .filter((s) => !editStaffIds.includes(s.id))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {editStaffIds.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Team mode: pay will be split equally ({Math.round(100 / editStaffIds.length)}% each)
                </p>
              )}
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Change Time
              </Label>
              <Input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="h-10 rounded-xl"
                placeholder="Keep current"
              />
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                Change Price
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="h-10 rounded-xl"
                placeholder="Keep current"
              />
            </div>

            {/* Cleaner Pay */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                {editStaffIds.length > 1 ? 'Change Cleaner Pay (Total)' : 'Change Cleaner Pay'}
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editCleanerPay}
                onChange={(e) => setEditCleanerPay(e.target.value)}
                className="h-10 rounded-xl"
                placeholder="Keep current"
              />
              {editCleanerPay && editStaffIds.length > 1 && !hasIndividualPay && (
                <p className="text-xs text-muted-foreground">
                  Split equally: ${(parseFloat(editCleanerPay) / editStaffIds.length).toFixed(2)} each
                </p>
              )}
            </div>

            {/* Individual pay per cleaner (team mode) */}
            {editStaffIds.length > 1 && (
              <div className="space-y-2 bg-secondary/30 rounded-xl p-3">
                <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  Individual Pay Override (optional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Set custom pay per cleaner. Overrides the equal split above.
                </p>
                {editStaffIds.map((id) => {
                  const staff = staffList.find((s) => s.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-xs font-medium min-w-[100px] truncate">
                        {staff?.name || 'Unknown'}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editIndividualPay[id] || ''}
                        onChange={(e) => setEditIndividualPay((prev) => ({ ...prev, [id]: e.target.value }))}
                        className="h-8 rounded-lg text-xs flex-1"
                        placeholder="Use split"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview */}
          {filteredBookings.length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Preview ({Math.min(filteredBookings.length, 5)} of {filteredBookings.length})</Label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {filteredBookings.slice(0, 5).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs bg-secondary/30 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium">#{b.booking_number}</span>
                      <span className="text-muted-foreground ml-2">
                        {b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown'}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {format(new Date(b.scheduled_at), 'EEE, MMM d')}
                    </div>
                  </div>
                ))}
                {filteredBookings.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{filteredBookings.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90"
              onClick={handleApply}
              disabled={saving || !hasChanges || filteredBookings.length === 0}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Edit className="w-4 h-4 mr-2" />
              )}
              Apply to {filteredBookings.length} Booking(s)
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
