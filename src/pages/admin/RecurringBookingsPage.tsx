import { useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { useCustomers, useServices, useStaff } from '@/hooks/useBookings';

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

export default function RecurringBookingsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<RecurringBooking | null>(null);
  const queryClient = useQueryClient();
  
  const { data: customers = [] } = useCustomers();
  const { data: services = [] } = useServices();
  const { data: staff = [] } = useStaff();

  const { data: recurringBookings = [], isLoading } = useQuery({
    queryKey: ['recurring-bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_bookings')
        .select(`
          *,
          customer:customers(*),
          service:services(*),
          staff:staff(*)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as RecurringBooking[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('recurring_bookings').insert(data);
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
    const customer = customers.find(c => c.id === recurring.customer_id);
    if (!customer) {
      toast.error('Customer not found');
      return;
    }

    let nextDate = new Date();
    if (recurring.frequency === 'weekly') {
      nextDate = addWeeks(nextDate, 1);
    } else if (recurring.frequency === 'biweekly') {
      nextDate = addWeeks(nextDate, 2);
    } else {
      nextDate = addMonths(nextDate, 1);
    }

    // Adjust to preferred day
    if (recurring.preferred_day !== null) {
      while (nextDate.getDay() !== recurring.preferred_day) {
        nextDate = addDays(nextDate, 1);
      }
    }

    const scheduledAt = new Date(nextDate);
    if (recurring.preferred_time) {
      const [time, period] = recurring.preferred_time.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let hour24 = hours;
      if (period === 'PM' && hours !== 12) hour24 += 12;
      if (period === 'AM' && hours === 12) hour24 = 0;
      scheduledAt.setHours(hour24, minutes, 0, 0);
    }

    const { error } = await supabase.from('bookings').insert({
      customer_id: recurring.customer_id,
      service_id: recurring.service_id,
      staff_id: recurring.staff_id,
      address: recurring.address,
      city: recurring.city,
      state: recurring.state,
      zip_code: recurring.zip_code,
      total_amount: recurring.total_amount,
      scheduled_at: scheduledAt.toISOString(),
      duration: 180,
      status: 'pending',
      payment_status: 'pending',
      frequency: recurring.frequency,
    });

    if (error) {
      toast.error('Failed to generate booking');
    } else {
      await supabase.from('recurring_bookings').update({
        last_generated_at: new Date().toISOString(),
        next_scheduled_at: scheduledAt.toISOString(),
      }).eq('id', recurring.id);
      
      queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Next booking generated');
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
                    <TableCell className="capitalize">{booking.frequency}</TableCell>
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
                      {booking.next_scheduled_at ? (
                        format(new Date(booking.next_scheduled_at), 'MMM d, yyyy')
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
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
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: RecurringBooking | null;
  customers: any[];
  services: any[];
  staff: any[];
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    customer_id: booking?.customer_id || '',
    service_id: booking?.service_id || '',
    staff_id: booking?.staff_id || '',
    frequency: booking?.frequency || 'weekly',
    preferred_day: booking?.preferred_day?.toString() || '',
    preferred_time: booking?.preferred_time || '',
    total_amount: booking?.total_amount?.toString() || '',
    is_active: booking?.is_active ?? true,
  });

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
            <Select value={formData.staff_id} onValueChange={(v) => setFormData({ ...formData, staff_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
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
                <SelectItem value="monthly">Monthly</SelectItem>
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