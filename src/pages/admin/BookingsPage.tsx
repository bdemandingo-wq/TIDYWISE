import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { 
  Search, 
  Download, 
  MoreHorizontal, 
  Eye, 
  Edit, 
  Trash2, 
  Plus, 
  Loader2, 
  CreditCard, 
  XCircle, 
  Copy,
  Calendar,
  User,
  Clock,
  DollarSign,
  Filter,
  CalendarRange,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useBookings, useUpdateBooking, useDeleteBooking, BookingWithDetails } from '@/hooks/useBookings';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { AddBookingDialog } from '@/components/admin/AddBookingDialog';
import { BookingDetailsDialog, AdjustPaymentDialog } from '@/components/admin/BookingDialogs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  confirmed: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  in_progress: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  no_show: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
};

const statusLabels: Record<string, string> = {
  pending: 'pending payment',
  confirmed: 'uncleaned',
  in_progress: 'in progress',
  completed: 'clean completed',
  cancelled: 'cancelled',
  no_show: 'no show',
};

const getPaymentStatusInfo = (booking: BookingWithDetails) => {
  const hasPaymentIntent = !!(booking as any).payment_intent_id;
  
  if (booking.payment_status === 'paid') {
    return { label: 'Paid', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '✓' };
  }
  if (booking.payment_status === 'refunded') {
    return { label: 'Refunded', bg: 'bg-slate-100', text: 'text-slate-600', icon: '↩' };
  }
  if (hasPaymentIntent && booking.payment_status === 'partial') {
    return { label: 'Hold', bg: 'bg-amber-50', text: 'text-amber-700', icon: '◐' };
  }
  if (hasPaymentIntent) {
    return { label: 'Hold', bg: 'bg-amber-50', text: 'text-amber-700', icon: '◐' };
  }
  return { label: 'Unpaid', bg: 'bg-rose-50', text: 'text-rose-700', icon: '○' };
};

export default function BookingsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [adjustPaymentOpen, setAdjustPaymentOpen] = useState(false);
  const [activeBooking, setActiveBooking] = useState<BookingWithDetails | null>(null);
  const [editingBooking, setEditingBooking] = useState<BookingWithDetails | null>(null);
  const [capturingPayment, setCapturingPayment] = useState<string | null>(null);
  const [cancelingHold, setCancelingHold] = useState<string | null>(null);
  const [chargingCard, setChargingCard] = useState<string | null>(null);
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: bookings = [], isLoading, error } = useBookings();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();

  // Sort bookings: upcoming first (chronologically), then past
  const sortedBookings = useMemo(() => {
    const now = new Date();
    return [...bookings].sort((a, b) => {
      const aDate = new Date(a.scheduled_at);
      const bDate = new Date(b.scheduled_at);
      const aIsUpcoming = aDate >= now;
      const bIsUpcoming = bDate >= now;
      
      // Both upcoming: earliest first
      if (aIsUpcoming && bIsUpcoming) {
        return aDate.getTime() - bDate.getTime();
      }
      // Both past: most recent first
      if (!aIsUpcoming && !bIsUpcoming) {
        return bDate.getTime() - aDate.getTime();
      }
      // Upcoming before past
      return aIsUpcoming ? -1 : 1;
    });
  }, [bookings]);

  const filteredBookings = sortedBookings.filter((booking) => {
    const customerName = booking.customer 
      ? `${booking.customer.first_name} ${booking.customer.last_name}`.toLowerCase()
      : '';
    const serviceName = booking.service?.name?.toLowerCase() || '';
    const bookingNum = booking.booking_number.toString();
    
    const matchesSearch =
      customerName.includes(searchTerm.toLowerCase()) ||
      serviceName.includes(searchTerm.toLowerCase()) ||
      bookingNum.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    
    // Date range filter
    let matchesDate = true;
    if (dateRange?.from) {
      const bookingDate = new Date(booking.scheduled_at);
      const start = startOfDay(dateRange.from);
      const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      matchesDate = isWithinInterval(bookingDate, { start, end });
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  // Stats - pending payment based on payment_status, uncleaned based on status
  const stats = {
    total: bookings.length,
    pending: bookings.filter(b => b.payment_status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    completed: bookings.filter(b => b.status === 'completed').length,
  };

  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    await updateBooking.mutateAsync({
      id: bookingId,
      status: newStatus as BookingWithDetails['status'],
    });
  };

  const handleDelete = async (booking: BookingWithDetails) => {
    const ok = window.confirm(`Delete booking #${booking.booking_number}? This cannot be undone.`);
    if (!ok) return;
    await deleteBooking.mutateAsync(booking.id);
    setSelectedBookings(prev => {
      const next = new Set(prev);
      next.delete(booking.id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedBookings.size === 0) return;
    const ok = window.confirm(`Delete ${selectedBookings.size} selected bookings? This cannot be undone.`);
    if (!ok) return;
    
    setBulkDeleting(true);
    try {
      for (const id of selectedBookings) {
        await deleteBooking.mutateAsync(id);
      }
      setSelectedBookings(new Set());
      toast({ title: "Deleted", description: `${selectedBookings.size} bookings deleted successfully` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete some bookings", variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedBookings.size === filteredBookings.length) {
      setSelectedBookings(new Set());
    } else {
      setSelectedBookings(new Set(filteredBookings.map(b => b.id)));
    }
  };

  const toggleSelectBooking = (id: string) => {
    setSelectedBookings(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCapturePayment = async (booking: BookingWithDetails) => {
    const paymentIntentId = (booking as any).payment_intent_id;
    
    if (!paymentIntentId) {
      toast({ title: "Error", description: "No payment hold found for this booking", variant: "destructive" });
      return;
    }

    setCapturingPayment(booking.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('capture-payment', {
        body: {
          paymentIntentId,
          amountToCapture: booking.total_amount,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({ 
          title: "Payment Captured", 
          description: data.message 
        });
        
        await updateBooking.mutateAsync({ 
          id: booking.id, 
          payment_status: 'paid' as any
        });
      } else {
        toast({ 
          title: "Capture Failed", 
          description: data.error, 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error('Failed to capture payment:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to capture payment", 
        variant: "destructive" 
      });
    } finally {
      setCapturingPayment(null);
    }
  };

  const handleCancelHold = async (booking: BookingWithDetails) => {
    const paymentIntentId = (booking as any).payment_intent_id;
    
    if (!paymentIntentId) {
      toast({ title: "Error", description: "No payment hold found for this booking", variant: "destructive" });
      return;
    }

    setCancelingHold(booking.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('cancel-hold', {
        body: {
          paymentIntentId,
        }
      });

      // Handle error responses - check if hold was already canceled
      if (error) {
        // Parse error message - it might indicate already canceled
        const errorMessage = error.message || '';
        if (errorMessage.includes('canceled') || errorMessage.includes('status: canceled')) {
          toast({ 
            title: "Already Released", 
            description: "This hold was already released previously." 
          });
          
          // Update payment status to refunded since hold is already canceled
          await updateBooking.mutateAsync({ 
            id: booking.id, 
            payment_status: 'refunded' as any
          });
          return;
        }
        throw error;
      }

      // Check data for already canceled status
      if (data?.status === 'canceled' || data?.error?.includes('canceled')) {
        toast({ 
          title: "Already Released", 
          description: "This hold was already released previously." 
        });
        
        await updateBooking.mutateAsync({ 
          id: booking.id, 
          payment_status: 'refunded' as any
        });
        return;
      }

      if (data.success) {
        toast({ 
          title: "Hold Released", 
          description: data.message 
        });
        
        await updateBooking.mutateAsync({ 
          id: booking.id, 
          payment_status: 'refunded' as any
        });
      } else {
        toast({ 
          title: "Release Failed", 
          description: data.error, 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error('Failed to cancel hold:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to release hold", 
        variant: "destructive" 
      });
    } finally {
      setCancelingHold(null);
    }
  };

  const handleChargeCard = async (booking: BookingWithDetails) => {
    if (!booking.customer?.email) {
      toast({ title: "Error", description: "No customer email found", variant: "destructive" });
      return;
    }

    setChargingCard(booking.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('charge-card-directly', {
        body: {
          email: booking.customer.email,
          amount: booking.total_amount,
          description: `Booking #${booking.booking_number} - ${booking.service?.name || 'Service'}`,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({ 
          title: "Payment Successful", 
          description: data.message 
        });
        
        await updateBooking.mutateAsync({ 
          id: booking.id, 
          payment_status: 'paid' as any
        });
      } else {
        toast({ 
          title: "Charge Failed", 
          description: data.error, 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error('Failed to charge card:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to charge card", 
        variant: "destructive" 
      });
    } finally {
      setChargingCard(null);
    }
  };

  const handleDuplicate = (booking: BookingWithDetails) => {
    setEditingBooking({
      ...booking,
      id: '',
      booking_number: 0,
      payment_intent_id: null,
      payment_status: 'pending',
    });
    setAddDialogOpen(true);
  };

  const handleExport = async (type: 'csv' | 'json') => {
    setExporting(true);
    try {
      if (type === 'csv') {
        const headers = ['Booking #', 'Customer', 'Service', 'Date', 'Time', 'Staff', 'Status', 'Payment', 'Amount'];
        const rows = filteredBookings.map(b => [
          b.booking_number,
          b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
          b.service?.name || 'Unknown',
          format(new Date(b.scheduled_at), 'yyyy-MM-dd'),
          format(new Date(b.scheduled_at), 'h:mm a'),
          b.staff?.name || 'Unassigned',
          statusLabels[b.status] || b.status,
          getPaymentStatusInfo(b).label,
          `$${b.total_amount}`
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookings-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(filteredBookings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookings-${format(new Date(), 'yyyy-MM-dd')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast({ title: "Export completed", description: `Exported ${filteredBookings.length} bookings` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to export", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (error) {
    return (
      <AdminLayout title="Bookings" subtitle="Error loading bookings">
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Failed to load bookings. Please try again.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Bookings"
      subtitle="Manage your appointments"
      actions={
        <Button
          className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity shadow-md"
          onClick={() => {
            setEditingBooking(null);
            setAddDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          New Booking
        </Button>
      }
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-fade-in">
        <div className="group relative bg-gradient-to-br from-card to-secondary/30 rounded-2xl p-5 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Total</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats.total}</p>
          </div>
        </div>
        
        <div className="group relative bg-gradient-to-br from-card to-amber-50/30 rounded-2xl p-5 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Pending Payment</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats.pending}</p>
          </div>
        </div>
        
        <div className="group relative bg-gradient-to-br from-card to-blue-50/30 rounded-2xl p-5 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-xl">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Uncleaned</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats.confirmed}</p>
          </div>
        </div>
        
        <div className="group relative bg-gradient-to-br from-card to-emerald-50/30 rounded-2xl p-5 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-100 rounded-xl">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Clean Completed</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats.completed}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, service, or booking #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11 h-11 bg-card border-border/50 rounded-xl focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <div className="flex gap-3 flex-wrap">
          {/* Date Range Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-11 gap-2 rounded-xl border-border/50 hover:bg-secondary/50">
                <CalendarRange className="w-4 h-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <span className="text-sm">
                      {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d')}
                    </span>
                  ) : (
                    <span className="text-sm">{format(dateRange.from, 'MMM d, yyyy')}</span>
                  )
                ) : (
                  <span>Date Range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                initialFocus
              />
              {dateRange && (
                <div className="p-3 border-t">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full gap-2"
                    onClick={() => setDateRange(undefined)}
                  >
                    <X className="w-4 h-4" />
                    Clear Date Filter
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-11 bg-card border-border/50 rounded-xl">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border rounded-xl">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending Payment</SelectItem>
              <SelectItem value="confirmed">Uncleaned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Clean Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11 gap-2 rounded-xl border-border/50 hover:bg-secondary/50" disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedBookings.size > 0 && (
            <Button 
              variant="destructive" 
              className="h-11 gap-2 rounded-xl"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete ({selectedBookings.size})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden animate-fade-in" style={{ animationDelay: '0.2s' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading bookings...</p>
            </div>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-8">
            <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No bookings found</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              {searchTerm || statusFilter !== 'all' 
                ? "Try adjusting your search or filter criteria"
                : "Get started by creating your first booking"
              }
            </p>
            <Button 
              onClick={() => setAddDialogOpen(true)}
              className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              Create Booking
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      checked={selectedBookings.size === filteredBookings.length && filteredBookings.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="font-semibold">Booking</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Service</TableHead>
                  <TableHead className="font-semibold">Schedule</TableHead>
                  <TableHead className="font-semibold">Staff</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Payment</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.map((booking, index) => {
                  const statusStyle = statusConfig[booking.status] || statusConfig.pending;
                  const paymentInfo = getPaymentStatusInfo(booking);
                  
                  return (
                    <TableRow 
                      key={booking.id} 
                      className={cn(
                        "group transition-colors hover:bg-secondary/20",
                        selectedBookings.has(booking.id) && "bg-primary/5"
                      )}
                      style={{ animationDelay: `${index * 0.03}s` }}
                    >
                      <TableCell>
                        <Checkbox 
                          checked={selectedBookings.has(booking.id)}
                          onCheckedChange={() => toggleSelectBooking(booking.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm font-bold text-primary">
                          #{booking.booking_number}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                            <span className="text-sm font-semibold text-primary">
                              {booking.customer?.first_name?.[0] || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {booking.customer 
                                ? `${booking.customer.first_name} ${booking.customer.last_name}`
                                : 'Unknown'
                              }
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {booking.customer?.email || 'No email'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{booking.service?.name || 'Unknown'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {format(new Date(booking.scheduled_at), 'MMM d, yyyy')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(booking.scheduled_at), 'h:mm a')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-sm",
                          booking.staff?.name ? "text-foreground" : "text-muted-foreground italic"
                        )}>
                          {booking.staff?.name || 'Unassigned'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                          statusStyle.bg, statusStyle.text
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", statusStyle.dot)} />
                          {statusLabels[booking.status] || booking.status.replace('_', ' ')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                          paymentInfo.bg, paymentInfo.text
                        )}>
                          <span>{paymentInfo.icon}</span>
                          {paymentInfo.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-bold text-foreground">${booking.total_amount}</span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-popover border-border rounded-xl">
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onClick={() => {
                                setActiveBooking(booking);
                                setViewDialogOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onClick={() => {
                                setEditingBooking(booking);
                                setAddDialogOpen(true);
                              }}
                            >
                              <Edit className="w-4 h-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onClick={() => handleDuplicate(booking)}
                            >
                              <Copy className="w-4 h-4" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="gap-2 cursor-pointer" 
                              onClick={() => {
                                handleStatusChange(booking.id, 'completed');
                                setActiveBooking(booking);
                                setAdjustPaymentOpen(true);
                              }}
                            >
                              Mark Complete & Adjust Pay
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="gap-2 cursor-pointer" 
                              onClick={() => {
                                setActiveBooking(booking);
                                setAdjustPaymentOpen(true);
                              }}
                            >
                              <DollarSign className="w-4 h-4" /> Adjust Cleaner Pay
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer text-emerald-600"
                              onClick={() => handleChargeCard(booking)}
                              disabled={
                                chargingCard === booking.id ||
                                booking.payment_status === 'paid' ||
                                !booking.customer?.email
                              }
                            >
                              {chargingCard === booking.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <DollarSign className="w-4 h-4" />
                              )}
                              {booking.payment_status === 'paid'
                                ? 'Already Paid'
                                : 'Charge Card Now'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onClick={() => handleCapturePayment(booking)}
                              disabled={
                                capturingPayment === booking.id ||
                                booking.payment_status === 'paid' ||
                                !(booking as any).payment_intent_id
                              }
                            >
                              {capturingPayment === booking.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CreditCard className="w-4 h-4" />
                              )}
                              {booking.payment_status === 'paid'
                                ? 'Payment Captured'
                                : !(booking as any).payment_intent_id
                                  ? 'No Hold'
                                  : 'Capture Hold'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onClick={() => handleCancelHold(booking)}
                              disabled={
                                cancelingHold === booking.id ||
                                booking.payment_status === 'paid' ||
                                booking.payment_status === 'refunded' ||
                                !(booking as any).payment_intent_id
                              }
                            >
                              {cancelingHold === booking.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                              Release Hold
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 text-destructive cursor-pointer focus:text-destructive"
                              onClick={() => handleDelete(booking)}
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AddBookingDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        booking={editingBooking}
        onDuplicate={handleDuplicate}
      />
      
      <BookingDetailsDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        booking={activeBooking}
      />

      <AdjustPaymentDialog
        open={adjustPaymentOpen}
        onOpenChange={setAdjustPaymentOpen}
        booking={activeBooking}
      />
    </AdminLayout>
  );
}
