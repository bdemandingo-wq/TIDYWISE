import { useState, useEffect } from 'react';
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
import { Plus, Calendar, RefreshCw, Pause, Play, Trash2, Edit } from 'lucide-react';
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

  // Advance from anchor by interval, then align to preferred day
  let nextDate = intervalAdder(anchor);

  // Align to preferred weekday
  if (preferredDay !== null) {
    // Find the nearest occurrence of preferredDay on or after nextDate
    while (nextDate.getDay() !== preferredDay) {
      nextDate = addDays(nextDate, 1);
    }
  }

  // Keep advancing until we're past the latest existing booking AND in the future
  const mustBeAfter = latestBookingDate ? startOfDay(latestBookingDate) : startOfDay(now);
  let safety = 0;
  while ((isBefore(nextDate, mustBeAfter) || isBefore(nextDate, startOfDay(now))) && safety < 200) {
    nextDate = intervalAdder(nextDate);
    if (preferredDay !== null) {
      while (nextDate.getDay() !== preferredDay) {
        nextDate = addDays(nextDate, 1);
      }
    }
    safety++;
  }

  // Conflict protection: skip dates that already have a booking
  if (existingBookingDates) {
    let conflictSafety = 0;
    while (existingBookingDates.has(formatDateKey(nextDate)) && conflictSafety < 52) {
      nextDate = intervalAdder(nextDate);
      if (preferredDay !== null) {
        while (nextDate.getDay() !== preferredDay) {
          nextDate = addDays(nextDate, 1);
        }
      }
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

    // Use the same anchor logic as computeNextDate
    const key = `${recurring.customer_id}__${recurring.service_id}`;
    const latestDate = latestBookingMap.get(key) || null;
    const existingDates = existingDatesMap.get(key);
    const nextDate = computeNextDate(recurring, latestDate, existingDates, customFrequencies);

    if (!nextDate) {
      toast.error('Could not compute next date');
      return;
    }

    const scheduledAt = applyTime(new Date(nextDate)).toISOString();

    const { error } = await supabase.from('bookings').insert([{
      ...baseBooking,
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
  };

  const activeCount = recurringBookings.filter(b => b.is_active).length;
  const pausedCount = recurringBookings.filter(b => !b.is_active).length;

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
                recurringBookings.map((booking) => (
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
                      {booking.frequency.startsWith('custom_')
                        ? customFrequencies.find(cf => cf.id === booking.frequency.replace('custom_', ''))?.name || booking.frequency
                        : booking.frequency}
                    </TableCell>
                    <TableCell>
                      {booking.preferred_day !== null && (
                        <span>{DAYS_OF_WEEK[booking.preferred_day]}</span>
                      )}
                      {booking.preferred_time && (
                        <span className="text-muted-foreground"> @ {booking.preferred_time}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">${booking.total_amount}</TableCell>
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
  const [formData, setFormData] = useState({
    customer_id: '',
    service_id: '',
    staff_id: '',
    frequency: 'weekly',
    preferred_day: '',
    preferred_time: '',
    total_amount: '',
    is_active: true,
  });

  // Reset form when booking changes or dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        customer_id: booking?.customer_id || '',
        service_id: booking?.service_id || '',
        staff_id: booking?.staff_id || '',
        frequency: booking?.frequency || 'weekly',
        preferred_day: booking?.preferred_day?.toString() || '',
        preferred_time: booking?.preferred_time || '',
        total_amount: booking?.total_amount?.toString() || '',
        is_active: booking?.is_active ?? true,
      });
    }
  }, [booking, open]);

  const handleSubmit = () => {
    if (!formData.customer_id || !formData.service_id || !formData.total_amount) {
      return;
    }
    onSave({
      ...formData,
      preferred_day: formData.preferred_day ? parseInt(formData.preferred_day) : null,
      total_amount: parseFloat(formData.total_amount),
      staff_id: formData.staff_id || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Service *</Label>
            <Select value={formData.service_id} onValueChange={(v) => setFormData({ ...formData, service_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Assign Cleaner</Label>
            <Select 
              value={formData.staff_id || "unassigned"} 
              onValueChange={(v) => setFormData({ ...formData, staff_id: v === "unassigned" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staff.filter(s => s.is_active).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div>
            <Label>Amount per Visit *</Label>
            <Input
              type="number"
              value={formData.total_amount}
              onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
              placeholder="0.00"
            />
          </div>
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