import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  CalendarCheck, Phone, Mail, Briefcase, Loader2,
  ChevronLeft, ChevronRight, Ban, X, MessageSquare, 
  Calendar as CalendarIcon, Clock, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import { toast } from 'sonner';

interface DemoBooking {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  business_name: string;
  team_size: string | null;
  biggest_challenge: string | null;
  booked_date: string;
  booked_time: string;
  timezone: string | null;
  status: string;
  cancellation_reason: string | null;
  reschedule_note: string | null;
  original_date: string | null;
  original_time: string | null;
  created_at: string;
}

interface BlockedDate {
  id: string;
  blocked_date: string;
  reason: string | null;
  notes: string | null;
}

const statusColors: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  rescheduled: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

const CANCEL_REASONS = [
  'Emergency came up',
  'Schedule conflict',
  'Need to reschedule',
  'Other',
];

// Availability schedule
const AVAILABILITY: Record<number, { start: number; end: number } | null> = {
  0: { start: 13, end: 22 },
  1: { start: 19, end: 22 },
  2: null,
  3: { start: 19, end: 22 },
  4: null,
  5: null,
  6: { start: 10, end: 22 },
};

function generateTimeSlots(dow: number): string[] {
  const avail = AVAILABILITY[dow];
  if (!avail) return [];
  const slots: string[] = [];
  for (let h = avail.start; h < avail.end; h++) {
    slots.push(`${h}:00`);
    slots.push(`${h}:30`);
  }
  return slots;
}

export function DemoCalendarTab() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('personal');
  const [blockNotes, setBlockNotes] = useState('');
  const [blockDateRange, setBlockDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  
  // Cancel/Reschedule state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [activeBooking, setActiveBooking] = useState<DemoBooking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [sendSmsOnCancel, setSendSmsOnCancel] = useState(true);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['demo-bookings'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('demo_bookings' as any)
        .select('*') as any)
        .order('booked_date', { ascending: true });
      if (error) throw error;
      return (data || []) as DemoBooking[];
    },
  });

  const { data: blockedDates = [] } = useQuery({
    queryKey: ['demo-blocked-dates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('demo_blocked_dates' as any)
        .select('*');
      if (error) throw error;
      return (data || []) as unknown as BlockedDate[];
    },
  });

  const blockDateMutation = useMutation({
    mutationFn: async (dates: { blocked_date: string; reason: string; notes: string }[]) => {
      for (const d of dates) {
        const { error } = await supabase.from('demo_blocked_dates' as any).insert(d as any);
        if (error && !error.message?.includes('duplicate')) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-blocked-dates'] });
      toast.success('Date(s) blocked');
      setBlockDialogOpen(false);
      setBlockDateRange({ start: '', end: '' });
      setBlockNotes('');
    },
    onError: () => toast.error('Failed to block date'),
  });

  const unblockMutation = useMutation({
    mutationFn: async (dateStr: string) => {
      const { error } = await supabase
        .from('demo_blocked_dates' as any)
        .delete()
        .eq('blocked_date', dateStr);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-blocked-dates'] });
      toast.success('Date unblocked');
    },
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from('demo_bookings' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-bookings'] });
    },
  });

  // Calendar computation
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });
  }, [currentMonth]);

  const blockedDateStrings = blockedDates.map(b => b.blocked_date);

  const getBookingsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return bookings.filter(b => b.booked_date === dateStr && b.status !== 'cancelled');
  };

  const handleCancel = async () => {
    if (!activeBooking) return;
    
    await updateBookingMutation.mutateAsync({
      id: activeBooking.id,
      updates: { status: 'cancelled', cancellation_reason: cancelReason },
    });

    if (sendSmsOnCancel) {
      const firstName = activeBooking.full_name.split(' ')[0];
      const dateDisplay = format(new Date(activeBooking.booked_date + 'T00:00:00'), 'EEEE, MMMM d');
      const timeDisplay = formatTime12h(activeBooking.booked_time.substring(0, 5));

      try {
        await supabase.functions.invoke('send-openphone-sms', {
          body: {
            to: activeBooking.phone,
            message: `Hi ${firstName}, Emmanuel here from TidyWise. Unfortunately I need to cancel our demo scheduled for ${dateDisplay} at ${timeDisplay} EST.\n\nI sincerely apologize for the inconvenience! Please rebook at a time that works for you:\n→ jointidywise.com/demo\n\nOr reply to this message and we'll find a time together.\n\n— Emmanuel, TidyWise 🙏`,
            organizationId: 'e95b92d0-7099-408e-a773-e4407b34f8b4',
          },
        });
      } catch {}
    }

    toast.success('Demo cancelled');
    setCancelDialogOpen(false);
    setActiveBooking(null);
  };

  const handleReschedule = async () => {
    if (!activeBooking || !rescheduleDate || !rescheduleTime) return;

    await updateBookingMutation.mutateAsync({
      id: activeBooking.id,
      updates: {
        status: 'rescheduled',
        original_date: activeBooking.booked_date,
        original_time: activeBooking.booked_time,
        booked_date: rescheduleDate,
        booked_time: rescheduleTime + ':00',
        reschedule_note: 'Rescheduled by admin',
      },
    });

    const firstName = activeBooking.full_name.split(' ')[0];
    const oldDate = format(new Date(activeBooking.booked_date + 'T00:00:00'), 'EEEE, MMMM d');
    const oldTime = formatTime12h(activeBooking.booked_time.substring(0, 5));
    const newDate = format(new Date(rescheduleDate + 'T00:00:00'), 'EEEE, MMMM d');
    const newTime = formatTime12h(rescheduleTime);

    try {
      await supabase.functions.invoke('send-openphone-sms', {
        body: {
          to: activeBooking.phone,
          message: `Hi ${firstName}! Emmanuel from TidyWise.\n\nI need to reschedule our demo from ${oldDate} at ${oldTime} to:\n\n📆 ${newDate}\n⏰ ${newTime} EST\n\nDoes this work for you? Reply YES to confirm or NO and I'll find another time.\n\n— Emmanuel (561) 571-8725`,
          organizationId: 'e95b92d0-7099-408e-a773-e4407b34f8b4',
        },
      });
    } catch {}

    toast.success('Demo rescheduled');
    setRescheduleDialogOpen(false);
    setActiveBooking(null);
  };

  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const cancelled = bookings.filter(b => b.status === 'cancelled');
  const upcoming = confirmed.filter(b => !isBefore(new Date(b.booked_date + 'T23:59:59'), startOfDay(new Date())));

  // Reschedule time slots
  const rescheduleSlots = rescheduleDate
    ? generateTimeSlots(new Date(rescheduleDate + 'T00:00:00').getDay())
    : [];

  return (
    <TabsContent value="demos">
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{bookings.length}</p>
              <p className="text-xs text-muted-foreground">Total Demos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{upcoming.length}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{cancelled.length}</p>
              <p className="text-xs text-muted-foreground">Cancelled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{blockedDates.length}</p>
              <p className="text-xs text-muted-foreground">Blocked Days</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Calendar */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-primary" />
                  Demo Calendar
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setBlockDialogOpen(true)}>
                  <Ban className="w-4 h-4 mr-1" /> Block Date
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-muted rounded-lg">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-semibold text-sm">{format(currentMonth, 'MMMM yyyy')}</span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-muted rounded-lg">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <div key={i} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map((day, i) => {
                  const inMonth = isSameMonth(day, currentMonth);
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isBlocked = blockedDateStrings.includes(dateStr);
                  const dayBookings = getBookingsForDate(day);
                  const today = isToday(day);
                  const selected = selectedDate && isSameDay(day, selectedDate);

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        aspect-square flex flex-col items-center justify-center rounded-md text-xs relative transition-all
                        ${!inMonth ? 'text-muted-foreground/30' : 'hover:bg-muted'}
                        ${today ? 'ring-1 ring-primary/40' : ''}
                        ${selected ? 'bg-primary/10 ring-2 ring-primary' : ''}
                        ${isBlocked ? 'bg-destructive/10' : ''}
                      `}
                    >
                      <span>{format(day, 'd')}</span>
                      {dayBookings.length > 0 && (
                        <span className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                      {isBlocked && (
                        <span className="absolute top-0.5 right-0.5 text-destructive">
                          <X className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected date details */}
              {selectedDate && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{format(selectedDate, 'EEEE, MMM d')}</p>
                    {blockedDateStrings.includes(format(selectedDate, 'yyyy-MM-dd')) ? (
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => unblockMutation.mutate(format(selectedDate, 'yyyy-MM-dd'))}>
                        Unblock
                      </Button>
                    ) : null}
                  </div>
                  {getBookingsForDate(selectedDate).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No demos scheduled</p>
                  ) : (
                    getBookingsForDate(selectedDate).map(b => (
                      <div key={b.id} className="p-2 bg-muted/50 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{formatTime12h(b.booked_time.substring(0, 5))} EST</span>
                          <Badge className={`text-[10px] ${statusColors[b.status] || ''}`}>{b.status}</Badge>
                        </div>
                        <p>{b.full_name} — {b.business_name}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bookings List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-primary" />
                Demo Bookings
                <Badge variant="secondary" className="ml-auto">{bookings.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : bookings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No demo bookings yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] pr-2">
                  <div className="space-y-2">
                    {bookings.map(demo => (
                      <div key={demo.id} className="p-3 bg-muted/50 rounded-lg border border-border space-y-2 text-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-foreground">{demo.full_name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Briefcase className="w-3 h-3" /> {demo.business_name}
                            </p>
                          </div>
                          <Badge className={`text-xs ${statusColors[demo.status] || ''}`}>{demo.status}</Badge>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" />
                            {format(new Date(demo.booked_date + 'T00:00:00'), 'MMM d, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime12h(demo.booked_time.substring(0, 5))} EST
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs">
                          <a href={`tel:${demo.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                            <Phone className="w-3 h-3" /> {demo.phone}
                          </a>
                          <a href={`mailto:${demo.email}`} className="flex items-center gap-1 text-primary hover:underline">
                            <Mail className="w-3 h-3" /> {demo.email}
                          </a>
                        </div>

                        {demo.status === 'confirmed' && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setActiveBooking(demo);
                                setRescheduleDialogOpen(true);
                                setRescheduleDate('');
                                setRescheduleTime('');
                              }}
                            >
                              📅 Reschedule
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => {
                                setActiveBooking(demo);
                                setCancelReason('');
                                setSendSmsOnCancel(true);
                                setCancelDialogOpen(true);
                              }}
                            >
                              ❌ Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                updateBookingMutation.mutate({ id: demo.id, updates: { status: 'completed' } });
                                toast.success('Marked as completed');
                              }}
                            >
                              ✅ Complete
                            </Button>
                          </div>
                        )}

                        {demo.cancellation_reason && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {demo.cancellation_reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Block Date Dialog */}
        <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Block Date(s)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={blockDateRange.start}
                  onChange={e => setBlockDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>End Date (optional for range)</Label>
                <Input
                  type="date"
                  value={blockDateRange.end}
                  onChange={e => setBlockDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Select value={blockReason} onValueChange={setBlockReason}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="travel">Travel</SelectItem>
                    <SelectItem value="holiday">Holiday</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={blockNotes} onChange={e => setBlockNotes(e.target.value)} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBlockDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={!blockDateRange.start}
                onClick={() => {
                  const dates: { blocked_date: string; reason: string; notes: string }[] = [];
                  const start = new Date(blockDateRange.start + 'T00:00:00');
                  const end = blockDateRange.end ? new Date(blockDateRange.end + 'T00:00:00') : start;
                  const days = eachDayOfInterval({ start, end });
                  for (const d of days) {
                    dates.push({ blocked_date: format(d, 'yyyy-MM-dd'), reason: blockReason, notes: blockNotes });
                  }
                  blockDateMutation.mutate(dates);
                }}
              >
                Block
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Dialog */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel Demo — {activeBooking?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Reason</Label>
                <div className="space-y-2 mt-2">
                  {CANCEL_REASONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setCancelReason(r)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                        cancelReason === r
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-foreground hover:border-primary/50'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendSmsOnCancel}
                  onChange={e => setSendSmsOnCancel(e.target.checked)}
                  className="rounded"
                />
                Send cancellation SMS to prospect
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelDialogOpen(false)}>Back</Button>
              <Button variant="destructive" disabled={!cancelReason} onClick={handleCancel}>
                Cancel Demo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reschedule Dialog */}
        <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reschedule — {activeBooking?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>New Date</Label>
                <Input
                  type="date"
                  value={rescheduleDate}
                  onChange={e => { setRescheduleDate(e.target.value); setRescheduleTime(''); }}
                  className="mt-1"
                />
              </div>
              {rescheduleSlots.length > 0 && (
                <div>
                  <Label>New Time</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {rescheduleSlots.map(t => (
                      <button
                        key={t}
                        onClick={() => setRescheduleTime(t)}
                        className={`px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                          rescheduleTime === t
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border text-foreground hover:border-primary/50'
                        }`}
                      >
                        {formatTime12h(t)} EST
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {rescheduleDate && rescheduleSlots.length === 0 && (
                <p className="text-sm text-muted-foreground">No available slots for this day.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRescheduleDialogOpen(false)}>Back</Button>
              <Button disabled={!rescheduleDate || !rescheduleTime} onClick={handleReschedule}>
                Reschedule & Notify
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TabsContent>
  );
}
