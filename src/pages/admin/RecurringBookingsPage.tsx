import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Calendar, RefreshCw, Pause, Play, Trash2, Edit, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format, addDays, addWeeks, addMonths, isBefore, startOfDay } from 'date-fns';
import { useCustomers, useServices, useStaff } from '@/hooks/useBookings';
import { useOrganization } from '@/contexts/OrganizationContext';

interface RecurringBooking {
  id: string;
  customer_id: string;
  service_id: string;
  staff_id: string | null;
  frequency: string;
  preferred_day: number | null;
  preferred_time: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  total_amount: number;
  is_active: boolean;
  next_scheduled_at: string | null;
  recurring_days_of_week: number[] | null;
  created_at: string;
  customer?: { first_name: string; last_name: string; email: string };
  service?: { name: string };
  staff?: { name: string };
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => {
  const totalMinutes = 8 * 60 + i * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
});

/**
 * Compute the next date for a recurring booking based on the client's
 * actual latest booking (anchor), NOT from "today".
 *
 * @param booking - the recurring template
 * @param latestBookingDate - the latest existing booking date for this customer+service (or null)
 * @param existingBookingDates - set of ISO date strings (YYYY-MM-DD) already booked for this customer
 */
function computeNextDate(
  booking: RecurringBooking,
  latestBookingDate: Date | null,
  existingBookingDates?: Set<string>,
  customFrequencies?: { id: string; name: string; interval_days: number; days_of_week: number[] | null }[]
): Date | null {
  if (booking.frequency === 'anyday') return null;

  const now = new Date();

  // Determine the anchor: latest actual booking > stored next_scheduled_at > created_at
  let anchor: Date;
  if (latestBookingDate) {
    anchor = startOfDay(latestBookingDate);
  } else if (booking.next_scheduled_at) {
    anchor = startOfDay(new Date(booking.next_scheduled_at));
  } else {
    anchor = startOfDay(new Date(booking.created_at));
  }

  const intervalAdder = getIntervalAdder(booking.frequency, customFrequencies);
  const preferredDay = booking.preferred_day;
  const preferredDateOfMonth = (booking as any).preferred_date_of_month as number | null;
  const isWeekBased = ['weekly', 'biweekly', 'triweekly'].includes(booking.frequency);

  // Use explicit preferred_date_of_month, or derive from anchor date for non-week-based frequencies
  const effectiveDateOfMonth = !isWeekBased
    ? (preferredDateOfMonth ?? anchor.getDate())
    : null;

  // For week-based: align to preferred weekday; for others: align to date-of-month
  const alignToPreferred = (d: Date): Date => {
    if (!isWeekBased && effectiveDateOfMonth != null) {
      const year = d.getFullYear();
      const month = d.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const day = Math.min(effectiveDateOfMonth, daysInMonth);
      return new Date(year, month, day);
    }
    if (isWeekBased && preferredDay !== null) {
      while (d.getDay() !== preferredDay) {
        d = addDays(d, 1);
      }
    }
    return d;
  };

  // Advance from anchor by interval, then align to preferred day/date
  let nextDate = alignToPreferred(intervalAdder(anchor));

  // Keep advancing until we're past the latest existing booking AND in the future
  const mustBeAfter = latestBookingDate ? startOfDay(latestBookingDate) : startOfDay(now);
  let safety = 0;
  while ((isBefore(nextDate, mustBeAfter) || isBefore(nextDate, startOfDay(now))) && safety < 200) {
    nextDate = alignToPreferred(intervalAdder(nextDate));
    safety++;
  }

  // Conflict protection: skip dates that already have a booking
  if (existingBookingDates) {
    let conflictSafety = 0;
    while (existingBookingDates.has(formatDateKey(nextDate)) && conflictSafety < 52) {
      nextDate = alignToPreferred(intervalAdder(nextDate));
      conflictSafety++;
    }
  }

  return nextDate;
}

function getIntervalAdder(frequency: string, customFrequencies?: { id: string; name: string; interval_days: number; days_of_week: number[] | null }[]): (d: Date) => Date {
  switch (frequency) {
    case 'weekly': return (d) => addWeeks(d, 1);
    case 'biweekly': return (d) => addWeeks(d, 2);
    case 'triweekly': return (d) => addWeeks(d, 3);
    case 'monthly': return (d) => addMonths(d, 1);
    default: {
      // Check if it's a custom frequency (stored as "custom_<id>")
      if (frequency.startsWith('custom_') && customFrequencies) {
        const cfId = frequency.replace('custom_', '');
        const cf = customFrequencies.find(f => f.id === cfId);
        if (cf) return (d) => addDays(d, cf.interval_days);
      }
      return (d) => addMonths(d, 1);
    }
  }
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RecurringBookingsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<RecurringBooking | null>(null);
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  
  const { data: customers = [] } = useCustomers();
  const { data: services = [] } = useServices();
  const { data: staff = [] } = useStaff();

  // Fetch org-specific custom frequencies
  const { data: customFrequencies = [] } = useQuery({
    queryKey: ['custom-frequencies', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('custom_frequencies')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('interval_days', { ascending: true });
      if (error) throw error;
      return data as { id: string; name: string; interval_days: number; is_active: boolean; days_of_week: number[] | null }[];
    },
    enabled: !!organization?.id,
  });

  const { data: recurringBookings = [], isLoading } = useQuery({
    queryKey: ['recurring-bookings', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('recurring_bookings')
        .select(`
          *,
          customer:customers(*),
          service:services(*),
          staff:staff(*)
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RecurringBooking[];
    },
    enabled: !!organization?.id,
  });

  // Fetch ALL bookings for this org to find each recurring client's latest booking
  const { data: allOrgBookings = [] } = useQuery({
    queryKey: ['all-bookings-for-recurring', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('id, customer_id, service_id, scheduled_at, status')
        .eq('organization_id', organization.id)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 2,
  });

  // Build lookup maps: latest booking date + existing date sets per customer+service
  const latestBookingMap = new Map<string, Date>();
  const existingDatesMap = new Map<string, Set<string>>();
  for (const b of allOrgBookings) {
    const key = `${b.customer_id}__${b.service_id}`;
    const bDate = new Date(b.scheduled_at);
    if (!latestBookingMap.has(key) || bDate > latestBookingMap.get(key)!) {
      latestBookingMap.set(key, bDate);
    }
    if (!existingDatesMap.has(key)) {
      existingDatesMap.set(key, new Set());
    }
    existingDatesMap.get(key)!.add(formatDateKey(startOfDay(bDate)));
  }

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!organization?.id) {
        throw new Error('No organization found');
      }
      const { error } = await supabase.from('recurring_bookings').insert({ ...data, organization_id: organization.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      toast.success('Recurring booking created');
      setDialogOpen(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = await supabase.from('recurring_bookings').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      toast.success('Recurring booking updated');
      setDialogOpen(false);
      setEditingBooking(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('recurring_bookings').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      toast.success('Status updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_bookings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      toast.success('Recurring booking deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const generateNextBooking = async (recurring: RecurringBooking) => {
    if (!organization?.id) {
      toast.error('No organization found');
      return;
    }
    
    const customer = customers.find(c => c.id === recurring.customer_id);
    if (!customer) {
      toast.error('Customer not found');
      return;
    }

    if (recurring.frequency === 'anyday') {
      toast.info('Airbnb/On-Demand bookings are scheduled manually per request');
      return;
    }

    const applyTime = (date: Date) => {
      if (recurring.preferred_time) {
        const [time, period] = recurring.preferred_time.split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        let hour24 = hours;
        if (period === 'PM' && hours !== 12) hour24 += 12;
        if (period === 'AM' && hours === 12) hour24 = 0;
        date.setHours(hour24, minutes, 0, 0);
      }
      return date;
    };

    const baseBooking = {
      customer_id: recurring.customer_id,
      service_id: recurring.service_id,
      staff_id: recurring.staff_id,
      address: recurring.address,
      city: recurring.city,
      state: recurring.state,
      zip_code: recurring.zip_code,
      total_amount: recurring.total_amount,
      duration: 180,
      status: 'pending' as const,
      payment_status: 'pending' as const,
      frequency: recurring.frequency,
      organization_id: organization.id,
      recurring_days_of_week: recurring.recurring_days_of_week,
    };

    // Resolve the custom frequency's days_of_week
    const isCustom = recurring.frequency === 'custom' || recurring.frequency.startsWith('custom_');
    let customDays: number[] | null = null;
    if (isCustom && recurring.recurring_days_of_week && recurring.recurring_days_of_week.length > 1) {
      customDays = recurring.recurring_days_of_week;
    }

    const dayPrices = (recurring as any).day_prices as Record<string, number> | null;
    const dayServices = (recurring as any).day_services as Record<string, string> | null;

    if (customDays && customDays.length > 1) {
      // For multi-day custom frequencies (M/W/F), generate one booking per day in the next week cycle
      const key = `${recurring.customer_id}__${recurring.service_id}`;
      const latestDate = latestBookingMap.get(key) || null;
      const existingDates = existingDatesMap.get(key) || new Set<string>();

      // Find the anchor: latest booking or now
      const now = new Date();
      let anchor: Date;
      if (latestDate) {
        anchor = startOfDay(latestDate);
      } else if (recurring.next_scheduled_at) {
        anchor = startOfDay(new Date(recurring.next_scheduled_at));
      } else {
        anchor = startOfDay(now);
      }

      // Find the next occurrence of each custom day after the anchor
      const bookingsToInsert: any[] = [];
      for (const dayIdx of customDays) {
        // Find the next occurrence of this day of week after anchor
        let candidate = addDays(anchor, 1); // Start from day after anchor
        let safety = 0;
        while (candidate.getDay() !== dayIdx && safety < 7) {
          candidate = addDays(candidate, 1);
          safety++;
        }
        // Make sure it's in the future and not already booked
        while ((isBefore(candidate, now) || existingDates.has(formatDateKey(candidate))) && safety < 60) {
          candidate = addWeeks(candidate, 1); // Jump by a week to find next occurrence of same day
          safety++;
        }

        let bookingAmount = recurring.total_amount;
        let bookingServiceId = recurring.service_id;
        const dayKey = dayIdx.toString();
        if (dayPrices && dayPrices[dayKey] != null) {
          bookingAmount = dayPrices[dayKey];
        }
        if (dayServices && dayServices[dayKey]) {
          bookingServiceId = dayServices[dayKey];
        }

        const scheduledAt = applyTime(new Date(candidate)).toISOString();
        bookingsToInsert.push({
          ...baseBooking,
          service_id: bookingServiceId,
          total_amount: bookingAmount,
          scheduled_at: scheduledAt,
        });
      }

      if (bookingsToInsert.length === 0) {
        toast.error('Could not compute next dates');
        return;
      }

      const { error } = await supabase.from('bookings').insert(bookingsToInsert);

      if (error) {
        toast.error('Failed to generate bookings');
      } else {
        // Update next_scheduled_at to the earliest of the new bookings
        const earliest = bookingsToInsert.reduce((min, b) => 
          b.scheduled_at < min ? b.scheduled_at : min, bookingsToInsert[0].scheduled_at);
        await supabase.from('recurring_bookings').update({
          last_generated_at: new Date().toISOString(),
          next_scheduled_at: earliest,
        }).eq('id', recurring.id);
        
        queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        queryClient.invalidateQueries({ queryKey: ['all-bookings-for-recurring'] });
        toast.success(`${bookingsToInsert.length} bookings generated for ${customDays.map(d => DAYS_OF_WEEK[d].substring(0, 3)).join('/')}`);
      }
    } else {
      // Single-day frequency (weekly, monthly, etc.) — generate one booking
      const key = `${recurring.customer_id}__${recurring.service_id}`;
      const latestDate = latestBookingMap.get(key) || null;
      const existingDates = existingDatesMap.get(key);
      const nextDate = computeNextDate(recurring, latestDate, existingDates, customFrequencies);

      if (!nextDate) {
        toast.error('Could not compute next date');
        return;
      }

      let bookingAmount = recurring.total_amount;
      let bookingServiceId = recurring.service_id;
      const dayOfWeek = nextDate.getDay().toString();
      if (dayPrices && dayPrices[dayOfWeek] != null) {
        bookingAmount = dayPrices[dayOfWeek];
      }
      if (dayServices && dayServices[dayOfWeek]) {
        bookingServiceId = dayServices[dayOfWeek];
      }

      const scheduledAt = applyTime(new Date(nextDate)).toISOString();

      const { error } = await supabase.from('bookings').insert([{
        ...baseBooking,
        service_id: bookingServiceId,
        total_amount: bookingAmount,
        scheduled_at: scheduledAt,
      }]);

      if (error) {
        toast.error('Failed to generate booking');
      } else {
        await supabase.from('recurring_bookings').update({
          last_generated_at: new Date().toISOString(),
          next_scheduled_at: scheduledAt,
        }).eq('id', recurring.id);
        
        queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        queryClient.invalidateQueries({ queryKey: ['all-bookings-for-recurring'] });
        toast.success('Booking generated');
      }
    }
  };

  const activeCount = recurringBookings.filter(b => b.is_active).length;
  const pausedCount = recurringBookings.filter(b => !b.is_active).length;

  // Sort recurring bookings chronologically by next upcoming date (soonest first)
  const sortedRecurringBookings = [...recurringBookings].sort((a, b) => {
    const keyA = `${a.customer_id}__${a.service_id}`;
    const keyB = `${b.customer_id}__${b.service_id}`;
    const nextA = computeNextDate(a, latestBookingMap.get(keyA) || null, existingDatesMap.get(keyA), customFrequencies);
    const nextB = computeNextDate(b, latestBookingMap.get(keyB) || null, existingDatesMap.get(keyB), customFrequencies);
    if (!nextA && !nextB) return 0;
    if (!nextA) return 1;
    if (!nextB) return -1;
    return nextA.getTime() - nextB.getTime();
  });

  return (
    <AdminLayout
      title="Recurring Bookings"
      subtitle={`${recurringBookings.length} recurring schedules`}
      actions={
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Recurring
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{recurringBookings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Pause className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Paused</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-600">{pausedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next Date</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : recurringBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No recurring bookings yet
                  </TableCell>
                </TableRow>
              ) : (
                sortedRecurringBookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {booking.customer?.first_name} {booking.customer?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">{booking.customer?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{booking.service?.name || '-'}</TableCell>
                    <TableCell className="capitalize">
                      {(() => {
                        if (booking.frequency.startsWith('custom_')) {
                          return customFrequencies.find(cf => cf.id === booking.frequency.replace('custom_', ''))?.name || booking.frequency;
                        }
                        if (booking.frequency === 'custom' && booking.recurring_days_of_week) {
                          const matched = customFrequencies.find(cf => {
                            const cfDays = [...(cf.days_of_week || [])].sort().join(',');
                            const bDays = [...(booking.recurring_days_of_week || [])].sort().join(',');
                            return cfDays === bDays;
                          });
                          return matched?.name || 'Custom';
                        }
                        return booking.frequency;
                      })()}
                    </TableCell>
                    <TableCell>
                      {booking.preferred_day !== null && (
                        <span>{DAYS_OF_WEEK[booking.preferred_day]}</span>
                      )}
                      {booking.preferred_time && (
                        <span className="text-muted-foreground"> @ {booking.preferred_time}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {(() => {
                        const dp = (booking as any).day_prices as Record<string, number> | null;
                        if (dp && Object.keys(dp).length > 0) {
                          const sum = Object.values(dp).reduce((a, b) => a + b, 0);
                          return `$${Math.round(sum * 100) / 100}`;
                        }
                        return `$${booking.total_amount}`;
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={booking.is_active ? 'default' : 'secondary'}>
                        {booking.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const key = `${booking.customer_id}__${booking.service_id}`;
                        const latestDate = latestBookingMap.get(key) || null;
                        const existingDates = existingDatesMap.get(key);
                        const nextDate = computeNextDate(booking, latestDate, existingDates, customFrequencies);
                        return nextDate ? (
                          format(nextDate, 'MMM d, yyyy')
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => generateNextBooking(booking)}
                          title="Generate next booking"
                        >
                          <Calendar className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleActiveMutation.mutate({ id: booking.id, is_active: !booking.is_active })}
                          title={booking.is_active ? 'Pause' : 'Resume'}
                        >
                          {booking.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingBooking(booking);
                            setDialogOpen(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            if (confirm('Delete this recurring booking?')) {
                              deleteMutation.mutate(booking.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <RecurringBookingDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingBooking(null);
        }}
        booking={editingBooking}
        customers={customers}
        services={services}
        staff={staff}
        customFrequencies={customFrequencies}
        onSave={(data) => {
          if (editingBooking) {
            updateMutation.mutate({ id: editingBooking.id, ...data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />
    </AdminLayout>
  );
}

function RecurringBookingDialog({
  open,
  onOpenChange,
  booking,
  customers,
  services,
  staff,
  customFrequencies,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: RecurringBooking | null;
  customers: any[];
  services: any[];
  staff: any[];
  customFrequencies: { id: string; name: string; interval_days: number; is_active: boolean; days_of_week: number[] | null }[];
  onSave: (data: any) => void;
}) {
  const { organization } = useOrganization();
  const [formData, setFormData] = useState({
    customer_id: '',
    service_id: '',
    frequency: 'weekly',
    preferred_day: '',
    preferred_date_of_month: '',
    preferred_time: '',
    total_amount: '',
    is_active: true,
    day_prices: {} as Record<string, string>,
    day_services: {} as Record<string, string>,
  });

  // Team members state
  const [teamMembers, setTeamMembers] = useState<{ staff_id: string }[]>([]);

  const selectedCustomFreq = formData.frequency.startsWith('custom_')
    ? customFrequencies.find(cf => cf.id === formData.frequency.replace('custom_', ''))
    : null;
  const isMultiDay = selectedCustomFreq?.days_of_week && selectedCustomFreq.days_of_week.length > 1;

  useEffect(() => {
    if (open) {
      const existingDayPrices = (booking as any)?.day_prices as Record<string, number> | null;
      const dayPricesStr: Record<string, string> = {};
      if (existingDayPrices) {
        for (const [k, v] of Object.entries(existingDayPrices)) {
          dayPricesStr[k] = v.toString();
        }
      }
      const existingDayServices = (booking as any)?.day_services as Record<string, string> | null;
      const dayServicesStr: Record<string, string> = {};
      if (existingDayServices) {
        for (const [k, v] of Object.entries(existingDayServices)) {
          dayServicesStr[k] = v;
        }
      }
      // Resolve 'custom' frequency back to custom_${id} for the Select
      let resolvedFrequency = booking?.frequency || 'weekly';
      if (resolvedFrequency === 'custom' && booking?.recurring_days_of_week && customFrequencies.length > 0) {
        const matchedCf = customFrequencies.find((cf: any) => {
          const cfDays = [...(cf.days_of_week || [])].sort().join(',');
          const bookingDays = [...(booking.recurring_days_of_week || [])].sort().join(',');
          return cfDays === bookingDays;
        });
        if (matchedCf) resolvedFrequency = `custom_${matchedCf.id}`;
      }

      setFormData({
        customer_id: booking?.customer_id || '',
        service_id: booking?.service_id || '',
        frequency: resolvedFrequency,
        preferred_day: booking?.preferred_day?.toString() || '',
        preferred_date_of_month: (booking as any)?.preferred_date_of_month?.toString() || '',
        preferred_time: booking?.preferred_time || '',
        total_amount: booking?.total_amount?.toString() || '',
        is_active: booking?.is_active ?? true,
        day_prices: dayPricesStr,
        day_services: dayServicesStr,
      });

      if (booking?.staff_id) {
        setTeamMembers([{ staff_id: booking.staff_id }]);
      } else {
        setTeamMembers([]);
      }
    }
  }, [booking, open]);

  const addTeamMember = (staffId: string) => {
    if (teamMembers.some(m => m.staff_id === staffId)) return;
    setTeamMembers([...teamMembers, { staff_id: staffId }]);
  };

  const removeTeamMember = (staffId: string) => {
    setTeamMembers(teamMembers.filter(m => m.staff_id !== staffId));
  };

  const availableStaff = staff.filter((s: any) => s.is_active && !teamMembers.some(m => m.staff_id === s.id));

  const handleSubmit = () => {
    if (!formData.customer_id) return;
    if (!isMultiDay && !formData.service_id) return;
    if (!isMultiDay && !formData.total_amount) return;

    const isWeekBased = ['weekly', 'biweekly', 'triweekly'].includes(formData.frequency);

    let dayPricesPayload: Record<string, number> | null = null;
    let dayServicesPayload: Record<string, string> | null = null;
    let effectiveTotalAmount = parseFloat(formData.total_amount) || 0;

    if (isMultiDay && selectedCustomFreq?.days_of_week) {
      dayPricesPayload = {};
      dayServicesPayload = {};
      let sum = 0;
      for (const dayIdx of selectedCustomFreq.days_of_week) {
        const val = parseFloat(formData.day_prices[dayIdx.toString()] || '0');
        dayPricesPayload[dayIdx.toString()] = val;
        sum += val;
        if (formData.day_services[dayIdx.toString()]) {
          dayServicesPayload[dayIdx.toString()] = formData.day_services[dayIdx.toString()];
        }
      }
      effectiveTotalAmount = Math.round(sum * 100) / 100;
      if (Object.keys(dayServicesPayload).length === 0) dayServicesPayload = null;
    }

    const primaryStaffId = teamMembers.length > 0 ? teamMembers[0].staff_id : null;

    // Convert custom_${id} frequency to 'custom' for DB constraint compliance
    const dbFrequency = formData.frequency.startsWith('custom_') ? 'custom' : formData.frequency;
    const recurringDaysOfWeek = selectedCustomFreq?.days_of_week || null;

    onSave({
      customer_id: formData.customer_id,
      service_id: formData.service_id || null,
      staff_id: primaryStaffId,
      frequency: dbFrequency,
      preferred_day: isWeekBased ? (formData.preferred_day ? parseInt(formData.preferred_day) : null) : null,
      preferred_date_of_month: !isWeekBased && formData.preferred_date_of_month ? parseInt(formData.preferred_date_of_month) : null,
      preferred_time: formData.preferred_time || null,
      total_amount: effectiveTotalAmount,
      is_active: formData.is_active,
      day_prices: dayPricesPayload,
      day_services: dayServicesPayload,
      recurring_days_of_week: recurringDaysOfWeek,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{booking ? 'Edit' : 'Add'} Recurring Booking</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Customer *</Label>
            <Select value={formData.customer_id} onValueChange={(v) => setFormData({ ...formData, customer_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isMultiDay && (
            <div>
              <Label>Service *</Label>
              <Select value={formData.service_id} onValueChange={(v) => setFormData({ ...formData, service_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Multi-cleaner team builder */}
          <div>
            <Label>Assign Cleaners</Label>
            {teamMembers.length > 0 && (
              <div className="space-y-2 mt-2 mb-2">
                {teamMembers.map((member, idx) => {
                  const staffMember = staff.find((s: any) => s.id === member.staff_id);
                  return (
                    <div key={member.staff_id} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/30">
                      <span className="text-sm font-medium flex-1 truncate">
                        {staffMember?.name || 'Unknown'}
                      </span>
                      {idx === 0 && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Lead</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeTeamMember(member.staff_id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {availableStaff.length > 0 && (
              <Select onValueChange={(v) => addTeamMember(v)} value="">
                <SelectTrigger>
                  <SelectValue placeholder={teamMembers.length === 0 ? 'Add cleaner...' : 'Add another cleaner...'} />
                </SelectTrigger>
                <SelectContent>
                  {availableStaff.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label>Frequency *</Label>
            <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                <SelectItem value="triweekly">Tri-Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="anyday">Any Day (Airbnb/On-Demand)</SelectItem>
                {customFrequencies.length > 0 && (
                  <>
                    {customFrequencies.map((cf) => (
                      <SelectItem key={cf.id} value={`custom_${cf.id}`}>
                        {cf.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {['weekly', 'biweekly', 'triweekly'].includes(formData.frequency) ? (
              <div>
                <Label>Preferred Day</Label>
                <Select value={formData.preferred_day} onValueChange={(v) => setFormData({ ...formData, preferred_day: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any day" />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : formData.frequency !== 'anyday' ? (
              <div>
                <Label>Preferred Date</Label>
                <Select value={formData.preferred_date_of_month} onValueChange={(v) => setFormData({ ...formData, preferred_date_of_month: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Same as last" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={d.toString()}>
                        {d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : <div />}
            <div>
              <Label>Preferred Time</Label>
              <Select value={formData.preferred_time} onValueChange={(v) => setFormData({ ...formData, preferred_time: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Any time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isMultiDay && selectedCustomFreq?.days_of_week ? (
            <div>
              <Label>Service & Amount per Day *</Label>
              <div className="space-y-3 mt-2">
                {selectedCustomFreq.days_of_week.sort((a, b) => a - b).map((dayIdx) => (
                  <div key={dayIdx} className="space-y-1">
                    <span className="text-sm font-medium">{DAYS_OF_WEEK[dayIdx]}</span>
                    <div className="flex items-center gap-2">
                      <Select
                        value={formData.day_services[dayIdx.toString()] || formData.service_id}
                        onValueChange={(v) => setFormData({
                          ...formData,
                          day_services: { ...formData.day_services, [dayIdx.toString()]: v },
                        })}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Service" />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative w-24 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          type="number"
                          value={formData.day_prices[dayIdx.toString()] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            day_prices: { ...formData.day_prices, [dayIdx.toString()]: e.target.value },
                          })}
                          placeholder="0"
                          className="pl-5"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <Label>Amount per Visit *</Label>
              <Input
                type="number"
                value={formData.total_amount}
                onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>{booking ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}