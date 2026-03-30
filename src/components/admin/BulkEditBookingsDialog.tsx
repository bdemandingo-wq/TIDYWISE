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
import { Loader2, Edit, Filter, User, Clock, DollarSign, Wrench } from 'lucide-react';
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
  const [editStaffId, setEditStaffId] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('');
  const [editPrice, setEditPrice] = useState<string>('');

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

  const hasChanges = editServiceId || editStaffId || editTime || editPrice;

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
        if (editStaffId) {
          updates.staff_id = editStaffId;
        }
        if (editPrice) {
          updates.total_amount = parseFloat(editPrice);
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
          // Also update team assignments if staff changed
          if (editStaffId) {
            await supabase.from('booking_team_assignments').delete().eq('booking_id', booking.id);
            await supabase.from('booking_team_assignments').insert({
              booking_id: booking.id,
              staff_id: editStaffId,
              is_primary: true,
              pay_share: 1,
              organization_id: (booking as any).organization_id,
            });
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
      setEditStaffId('');
      setEditTime('');
      setEditPrice('');
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
              <Select value={editServiceId} onValueChange={setEditServiceId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Keep current" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Keep current</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — ${s.price.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Staff */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Change Cleaner
              </Label>
              <Select value={editStaffId} onValueChange={setEditStaffId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Keep current" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Keep current</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
