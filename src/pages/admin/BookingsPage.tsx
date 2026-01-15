import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  X,
  Phone,
  Bell,
  Settings2,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useBookings, useUpdateBooking, useDeleteBooking, useStaff, BookingWithDetails } from '@/hooks/useBookings';
import { format, isWithinInterval, startOfDay, endOfDay, differenceInDays, differenceInHours, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { AddBookingDialog } from '@/components/admin/AddBookingDialog';
import { BookingDetailsDialog, AdjustPaymentDialog } from '@/components/admin/BookingDialogs';
import { PaymentHistoryLogDialog } from '@/components/admin/PaymentHistoryLogDialog';
import { BulkEditCleanerWages } from '@/components/admin/BulkEditCleanerWages';
import { supabase } from '@/integrations/supabase/client';
import { QuotesTabContent } from '@/components/admin/QuotesTabContent';
import { toast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';

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
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
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
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkAssignDialogOpen, setBulkAssignDialogOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [chargeConfirmBooking, setChargeConfirmBooking] = useState<BookingWithDetails | null>(null);
  const [captureConfirmBooking, setCaptureConfirmBooking] = useState<BookingWithDetails | null>(null);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [paymentHistoryBooking, setPaymentHistoryBooking] = useState<BookingWithDetails | null>(null);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [sendingCleanerNotification, setSendingCleanerNotification] = useState<string | null>(null);
  const [bulkNotifyingCleaners, setBulkNotifyingCleaners] = useState(false);
  const [notifyingOpenJob, setNotifyingOpenJob] = useState<string | null>(null);
  const [sendingReviewRequest, setSendingReviewRequest] = useState<string | null>(null);
  const [bulkNotifyingWeek, setBulkNotifyingWeek] = useState(false);

  const { data: bookings = [], isLoading, error } = useBookings();
  const { data: staffList = [] } = useStaff();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();
  const { isTestMode, maskName, maskEmail, maskAmount, maskAddress } = useTestMode();
  const { organization } = useOrganization();

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

  // Filter for drafts (pending status with is_draft flag or pending payment)
  const draftBookings = sortedBookings.filter((booking) => 
    (booking as any).is_draft === true || 
    (booking.status === 'pending' && booking.payment_status === 'pending')
  );

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
    // Status filter - "pending" means bookings that haven't started yet (future bookings), "completed" means completed bookings
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        // Pending = bookings scheduled in the future that haven't started yet
        const now = new Date();
        const scheduledDate = new Date(booking.scheduled_at);
        matchesStatus = scheduledDate > now && !['completed', 'cancelled', 'no_show'].includes(booking.status);
      } else if (statusFilter === 'completed') {
        matchesStatus = booking.status === 'completed';
      } else {
        matchesStatus = booking.status === statusFilter;
      }
    }
    
    // Date range filter
    let matchesDate = true;
    if (dateRange?.from) {
      const bookingDate = new Date(booking.scheduled_at);
      const start = startOfDay(dateRange.from);
      const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      matchesDate = isWithinInterval(bookingDate, { start, end });
    }

    // Tab filter
    const isDraft = (booking as any).is_draft === true || 
      (booking.status === 'pending' && booking.payment_status === 'pending');
    const matchesTab = activeTab === 'all' || (activeTab === 'drafts' && isDraft);
    
    return matchesSearch && matchesStatus && matchesDate && matchesTab;
  });

  // Stats - pending payment based on payment_status, uncleaned based on status
  const stats = {
    total: bookings.length,
    pending: bookings.filter(b => b.payment_status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    completed: bookings.filter(b => b.status === 'completed').length,
  };

  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    // Find the booking to get details for cancellation notification
    const booking = bookings?.find(b => b.id === bookingId);
    
    await updateBooking.mutateAsync({
      id: bookingId,
      status: newStatus as BookingWithDetails['status'],
    });

    // Send cancellation SMS notification if status changed to cancelled
    if (newStatus === 'cancelled' && booking && organization?.id) {
      // Format date/time on client-side for timezone accuracy
      const scheduledDate = new Date(booking.scheduled_at);
      const formattedDate = scheduledDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const formattedTime = scheduledDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      supabase.functions.invoke('send-cancellation-sms-notification', {
        body: {
          customerName: booking.customer ? `${booking.customer.first_name} ${booking.customer.last_name}` : 'Customer',
          serviceName: booking.service?.name || 'Cleaning',
          scheduledAt: booking.scheduled_at,
          formattedDate,
          formattedTime,
          bookingNumber: booking.booking_number,
          organizationId: organization.id,
        }
      }).then(({ error }) => {
        if (error) {
          console.log('Cancellation SMS notification skipped (SMS may not be configured)');
        }
      }).catch((err) => {
        console.log('Cancellation SMS notification failed:', err);
      });
    }
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

  const handleBulkAssign = async () => {
    if (selectedBookings.size === 0 || !selectedStaffId) return;
    
    setBulkAssigning(true);
    try {
      const count = selectedBookings.size;
      for (const id of selectedBookings) {
        await updateBooking.mutateAsync({
          id,
          staff_id: selectedStaffId,
        });
      }
      setSelectedBookings(new Set());
      setBulkAssignDialogOpen(false);
      setSelectedStaffId('');
      toast({ title: "Assigned", description: `${count} bookings assigned to cleaner successfully` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to assign some bookings", variant: "destructive" });
    } finally {
      setBulkAssigning(false);
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
          organizationId: organization?.id,
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

  const handleSendReminder = async (booking: BookingWithDetails) => {
    if (!booking.customer?.phone) {
      toast({ title: "Error", description: "No customer phone number found", variant: "destructive" });
      return;
    }

    setSendingReminder(booking.id);
    
    try {
      // Format date/time on client-side for timezone accuracy
      const scheduledDate = new Date(booking.scheduled_at);
      const formattedDate = scheduledDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const formattedTime = scheduledDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const { error } = await supabase.functions.invoke('send-booking-reminder', {
        body: {
          bookingId: booking.id,
          customerPhone: booking.customer.phone,
          customerName: `${booking.customer.first_name} ${booking.customer.last_name}`,
          serviceName: booking.service?.name || 'Cleaning Service',
          scheduledAt: booking.scheduled_at,
          formattedDate,
          formattedTime,
          address: booking.address || '',
          totalAmount: booking.total_amount,
          organizationId: organization?.id,
        }
      });

      if (error) throw error;
      toast({ title: "Reminder Sent", description: `SMS sent to ${booking.customer.phone}` });
    } catch (error: any) {
      console.error('Failed to send reminder:', error);
      toast({ title: "Error", description: error.message || "Failed to send reminder", variant: "destructive" });
    } finally {
      setSendingReminder(null);
    }
  };

  const handleSendCleanerNotification = async (booking: BookingWithDetails) => {
    setSendingCleanerNotification(booking.id);
    
    try {
      const scheduledDate = new Date(booking.scheduled_at);
      const fullAddress = [booking.address, booking.apt_suite, booking.city, booking.state, booking.zip_code]
        .filter(Boolean)
        .join(', ');

      // Get team members for this booking
      const { data: teamAssignments } = await supabase
        .from('booking_team_assignments')
        .select('staff_id, staff:staff(id, name, phone)')
        .eq('booking_id', booking.id);

      // Collect all staff to notify (primary + team members)
      const staffToNotify: { name: string; phone: string }[] = [];
      
      // Add primary staff if assigned
      if (booking.staff?.phone) {
        staffToNotify.push({ name: booking.staff.name, phone: booking.staff.phone });
      }
      
      // Add team members (avoid duplicates)
      if (teamAssignments && teamAssignments.length > 0) {
        for (const assignment of teamAssignments) {
          const staffMember = assignment.staff as any;
          if (staffMember?.phone && !staffToNotify.some(s => s.phone === staffMember.phone)) {
            staffToNotify.push({ name: staffMember.name, phone: staffMember.phone });
          }
        }
      }

      if (staffToNotify.length === 0) {
        toast({ title: "Error", description: "No cleaners assigned or none have phone numbers", variant: "destructive" });
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const staffMember of staffToNotify) {
        try {
          const { data, error } = await supabase.functions.invoke('send-cleaner-notification', {
            body: {
              cleanerName: staffMember.name,
              cleanerPhone: staffMember.phone,
              customerName: booking.customer ? `${booking.customer.first_name} ${booking.customer.last_name}` : 'Customer',
              customerPhone: booking.customer?.phone || 'N/A',
              serviceName: booking.service?.name || 'Cleaning Service',
              appointmentDate: format(scheduledDate, 'MMMM d, yyyy'),
              appointmentTime: format(scheduledDate, 'h:mm a'),
              address: fullAddress || 'Address not provided',
              bookingNumber: booking.booking_number,
              organizationId: organization?.id,
            }
          });

          if (error) throw error;
          if (!data?.success) throw new Error(data?.error || 'SMS delivery failed');
          successCount++;
        } catch (error) {
          console.error(`Failed to notify ${staffMember.name}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        const message = staffToNotify.length > 1 
          ? `SMS sent to ${successCount} team member(s)${failCount > 0 ? `, ${failCount} failed` : ''}`
          : `SMS sent to ${staffToNotify[0].name}`;
        toast({ title: "Notification Sent", description: message });
      } else {
        toast({ title: "SMS Not Sent", description: "All notifications failed", variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Failed to send cleaner notification:', error);
      toast({ title: "Error", description: error.message || "Failed to send cleaner notification", variant: "destructive" });
    } finally {
      setSendingCleanerNotification(null);
    }
  };

  const handleBulkNotifyCleaners = async () => {
    if (selectedBookings.size === 0) return;
    
    const selectedBookingsList = filteredBookings.filter(b => selectedBookings.has(b.id));
    const bookingsWithCleaners = selectedBookingsList.filter(b => b.staff?.phone);
    
    if (bookingsWithCleaners.length === 0) {
      toast({ title: "No Cleaners to Notify", description: "None of the selected bookings have assigned cleaners with phone numbers.", variant: "destructive" });
      return;
    }

    setBulkNotifyingCleaners(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const booking of bookingsWithCleaners) {
        try {
          const scheduledDate = new Date(booking.scheduled_at);
          const fullAddress = [booking.address, booking.apt_suite, booking.city, booking.state, booking.zip_code]
            .filter(Boolean)
            .join(', ');

          const { data, error } = await supabase.functions.invoke('send-cleaner-notification', {
            body: {
              cleanerName: booking.staff!.name,
              cleanerPhone: booking.staff!.phone,
              customerName: booking.customer ? `${booking.customer.first_name} ${booking.customer.last_name}` : 'Customer',
              customerPhone: booking.customer?.phone || 'N/A',
              serviceName: booking.service?.name || 'Cleaning Service',
              appointmentDate: format(scheduledDate, 'MMMM d, yyyy'),
              appointmentTime: format(scheduledDate, 'h:mm a'),
              address: fullAddress || 'Address not provided',
              bookingNumber: booking.booking_number,
              organizationId: organization?.id,
            }
          });

          if (error) throw error;
          if (!data?.success) throw new Error(data?.error || 'SMS delivery failed');
          successCount++;
        } catch (error) {
          console.error(`Failed to notify cleaner for booking #${booking.booking_number}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({ 
          title: "Notifications Sent", 
          description: `Successfully notified ${successCount} cleaner(s) via SMS${failCount > 0 ? `. ${failCount} failed.` : '.'}`
        });
      } else {
        toast({ title: "Error", description: "Failed to send notifications", variant: "destructive" });
      }
    } finally {
      setBulkNotifyingCleaners(false);
    }
  };

  // Notify all active cleaners about an open/unassigned job
  const handleNotifyCleanersOpenJob = async (booking: BookingWithDetails) => {
    if (booking.staff) {
      toast({ title: "Already Assigned", description: "This job is already assigned to a cleaner.", variant: "destructive" });
      return;
    }

    setNotifyingOpenJob(booking.id);

    try {
      // Get all active staff with emails
      const { data: activeStaff, error: staffError } = await supabase
        .from('staff')
        .select('email, hourly_rate, base_wage')
        .eq('is_active', true)
        .not('email', 'is', null);

      if (staffError) throw staffError;

      if (!activeStaff || activeStaff.length === 0) {
        toast({ title: "No Cleaners", description: "No active cleaners found to notify.", variant: "destructive" });
        return;
      }

      const staffEmails = activeStaff.map(s => s.email).filter(Boolean);

      // Calculate average potential earnings based on typical staff wage
      const avgHourlyRate = activeStaff.reduce((sum, s) => sum + (s.hourly_rate || 0), 0) / activeStaff.length || 25;
      const potentialEarnings = (booking.duration / 60) * avgHourlyRate;

      const scheduledDate = new Date(booking.scheduled_at);
      const fullAddress = [booking.address, booking.city, booking.state, booking.zip_code]
        .filter(Boolean)
        .join(', ');

      // Fetch business settings for company name
      const { data: settings } = await supabase
        .from('business_settings')
        .select('company_name')
        .single();

      const { error } = await supabase.functions.invoke('notify-cleaners-open-job', {
        body: {
          staffEmails,
          jobDetails: {
            booking_number: booking.booking_number,
            service_name: booking.service?.name || 'Cleaning Service',
            scheduled_date: format(scheduledDate, 'MMMM d, yyyy'),
            scheduled_time: format(scheduledDate, 'h:mm a'),
            address: fullAddress || 'Address not provided',
            duration: booking.duration,
            potential_earnings: potentialEarnings,
          },
          companyName: settings?.company_name || 'Your Cleaning Company',
        }
      });

      if (error) throw error;

      toast({ 
        title: "Cleaners Notified", 
        description: `Sent notification to ${staffEmails.length} cleaner(s) about open job #${booking.booking_number}` 
      });
    } catch (error: any) {
      console.error('Failed to notify cleaners:', error);
      toast({ title: "Error", description: error.message || "Failed to notify cleaners", variant: "destructive" });
    } finally {
      setNotifyingOpenJob(null);
    }
  };

  // Notify all cleaners about their upcoming bookings for the week
  const handleBulkNotifyWeekCleaners = async () => {
    const now = new Date();
    const weekEnd = addDays(now, 7);
    
    // Get all upcoming bookings for the next 7 days with assigned cleaners
    const upcomingWeekBookings = sortedBookings.filter(b => {
      const scheduledDate = new Date(b.scheduled_at);
      return scheduledDate >= now && 
             scheduledDate <= weekEnd && 
             b.staff?.phone && 
             !['cancelled', 'completed'].includes(b.status);
    });

    if (upcomingWeekBookings.length === 0) {
      toast({ title: "No Bookings", description: "No upcoming bookings with assigned cleaners found for this week.", variant: "destructive" });
      return;
    }

    setBulkNotifyingWeek(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const booking of upcomingWeekBookings) {
        try {
          const scheduledDate = new Date(booking.scheduled_at);
          const fullAddress = [booking.address, booking.apt_suite, booking.city, booking.state, booking.zip_code]
            .filter(Boolean)
            .join(', ');

          const { data, error } = await supabase.functions.invoke('send-cleaner-notification', {
            body: {
              cleanerName: booking.staff!.name,
              cleanerPhone: booking.staff!.phone,
              customerName: booking.customer ? `${booking.customer.first_name} ${booking.customer.last_name}` : 'Customer',
              customerPhone: booking.customer?.phone || 'N/A',
              serviceName: booking.service?.name || 'Cleaning Service',
              appointmentDate: format(scheduledDate, 'MMMM d, yyyy'),
              appointmentTime: format(scheduledDate, 'h:mm a'),
              address: fullAddress || 'Address not provided',
              bookingNumber: booking.booking_number,
              organizationId: organization?.id,
            }
          });

          if (error) throw error;
          if (!data?.success) throw new Error(data?.error || 'SMS delivery failed');
          successCount++;
        } catch (error) {
          console.error(`Failed to notify cleaner for booking #${booking.booking_number}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({ 
          title: "Week's Notifications Sent", 
          description: `Successfully notified cleaners for ${successCount} upcoming booking(s)${failCount > 0 ? `. ${failCount} failed.` : '.'}`
        });
      } else {
        toast({ title: "Error", description: "Failed to send notifications", variant: "destructive" });
      }
    } finally {
      setBulkNotifyingWeek(false);
    }
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

  const handleSendReviewRequest = async (booking: BookingWithDetails) => {
    if (!booking.customer?.phone) {
      toast({ title: "Error", description: "No customer phone number found", variant: "destructive" });
      return;
    }

    if (booking.status !== 'completed') {
      toast({ title: "Cannot Send Review", description: "Review requests can only be sent for completed bookings", variant: "destructive" });
      return;
    }

    if (!organization?.id) {
      toast({ title: "Error", description: "Organization not found", variant: "destructive" });
      return;
    }

    setSendingReviewRequest(booking.id);
    
    try {
      const { error } = await supabase.functions.invoke('send-review-request-sms', {
        body: {
          bookingId: booking.id,
          customerId: (booking as any).customer_id || booking.customer?.id,
          customerPhone: booking.customer.phone,
          customerName: `${booking.customer.first_name} ${booking.customer.last_name}`,
          serviceName: booking.service?.name || 'Cleaning Service',
          organizationId: organization.id,
        }
      });

      if (error) throw error;
      toast({ title: "Review Request Sent", description: `SMS sent to ${booking.customer.phone}` });
    } catch (error: any) {
      console.error('Failed to send review request:', error);
      toast({ title: "Error", description: error.message || "Failed to send review request", variant: "destructive" });
    } finally {
      setSendingReviewRequest(null);
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
        <div className="flex gap-2">
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
        </div>
      }
    >
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="all" className="gap-2">
            <Calendar className="w-4 h-4" />
            All Bookings
          </TabsTrigger>
          <TabsTrigger value="drafts" className="gap-2">
            <Clock className="w-4 h-4" />
            Drafts
            {draftBookings.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {draftBookings.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="quotes" className="gap-2">
            <Star className="w-4 h-4" />
            Quotes
          </TabsTrigger>
          <TabsTrigger value="cleaner-wages" className="gap-2">
            <Settings2 className="w-4 h-4" />
            Cleaner Wages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
        {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
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
              <SelectItem value="all">All Bookings</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="h-11 gap-2 rounded-xl text-blue-600 border-blue-200 hover:bg-blue-50"
            onClick={handleBulkNotifyWeekCleaners}
            disabled={bulkNotifyingWeek}
          >
            {bulkNotifyingWeek ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            Notify Week's Cleaners
          </Button>
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
            <>
              <Button 
                variant="outline" 
                className="h-11 gap-2 rounded-xl"
                onClick={() => setBulkAssignDialogOpen(true)}
              >
                <User className="w-4 h-4" />
                Assign Cleaner ({selectedBookings.size})
              </Button>
              <Button 
                variant="outline" 
                className="h-11 gap-2 rounded-xl text-purple-600 border-purple-200 hover:bg-purple-50"
                onClick={handleBulkNotifyCleaners}
                disabled={bulkNotifyingCleaners}
              >
                {bulkNotifyingCleaners ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                Notify Cleaners ({selectedBookings.size})
              </Button>
              <Button 
                variant="destructive" 
                className="h-11 gap-2 rounded-xl"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete ({selectedBookings.size})
              </Button>
            </>
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
                  
                  // Reminder indicator logic
                  const now = new Date();
                  const scheduledDate = new Date(booking.scheduled_at);
                  const daysUntil = differenceInDays(scheduledDate, now);
                  const hoursUntil = differenceInHours(scheduledDate, now);
                  const isUpcoming = scheduledDate > now;
                  const needsReminder = isUpcoming && 
                    ['pending', 'confirmed'].includes(booking.status) &&
                    daysUntil >= 1 && daysUntil <= 7;
                  const urgentReminder = isUpcoming && 
                    ['pending', 'confirmed'].includes(booking.status) &&
                    hoursUntil > 0 && hoursUntil <= 48;
                  
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
                              {isTestMode ? 'J' : (booking.customer?.first_name?.[0] || '?')}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {booking.customer 
                                ? maskName(`${booking.customer.first_name} ${booking.customer.last_name}`)
                                : 'Unknown'
                              }
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {maskEmail(booking.customer?.email || 'No email')}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{booking.service?.name || 'Unknown'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {format(scheduledDate, 'MMM d, yyyy')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(scheduledDate, 'h:mm a')}
                            </span>
                          </div>
                          {(needsReminder || urgentReminder) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-7 w-7 rounded-full",
                                urgentReminder 
                                  ? "bg-amber-100 text-amber-600 hover:bg-amber-200" 
                                  : "bg-blue-50 text-blue-500 hover:bg-blue-100"
                              )}
                              onClick={() => handleSendReminder(booking)}
                              disabled={sendingReminder === booking.id}
                              title={urgentReminder ? `Urgent: ${hoursUntil}h until clean` : `${daysUntil} days until clean - send reminder`}
                            >
                              {sendingReminder === booking.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Phone className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          )}
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
                        <span className="font-bold text-foreground">{maskAmount(booking.total_amount)}</span>
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
                            <DropdownMenuItem 
                              className="gap-2 cursor-pointer text-emerald-600" 
                              onClick={async () => {
                                await updateBooking.mutateAsync({
                                  id: booking.id,
                                  payment_status: 'paid' as any
                                });
                                toast({ title: "Marked Paid", description: `Booking #${booking.booking_number} marked as paid.` });
                              }}
                              disabled={booking.payment_status === 'paid'}
                            >
                              <CreditCard className="w-4 h-4" /> 
                              {booking.payment_status === 'paid' ? 'Already Paid' : 'Mark Paid'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="gap-2 cursor-pointer" 
                              onClick={() => {
                                handleStatusChange(booking.id, 'completed');
                                setActiveBooking(booking);
                                setAdjustPaymentOpen(true);
                              }}
                              disabled={booking.status === 'completed'}
                            >
                              Mark Complete & Adjust Pay
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="gap-2 cursor-pointer text-amber-600" 
                              onClick={async () => {
                                await handleStatusChange(booking.id, 'confirmed');
                                toast({ title: "Marked Uncleaned", description: `Booking #${booking.booking_number} marked as uncleaned.` });
                              }}
                              disabled={booking.status === 'confirmed'}
                            >
                              <XCircle className="w-4 h-4" /> Mark Uncleaned
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
                            <DropdownMenuItem 
                              className="gap-2 cursor-pointer text-blue-600" 
                              onClick={() => handleSendReminder(booking)}
                              disabled={sendingReminder === booking.id || !booking.customer?.phone}
                            >
                              {sendingReminder === booking.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Phone className="w-4 h-4" />
                              )}
                              Send Customer Reminder
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="gap-2 cursor-pointer text-purple-600" 
                              onClick={() => handleSendCleanerNotification(booking)}
                              disabled={sendingCleanerNotification === booking.id || !booking.staff?.phone}
                            >
                              {sendingCleanerNotification === booking.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Phone className="w-4 h-4" />
                              )}
                              Notify Cleaner
                            </DropdownMenuItem>
                            {/* Notify All Cleaners for unassigned jobs */}
                            {!booking.staff && (
                              <DropdownMenuItem 
                                className="gap-2 cursor-pointer text-green-600" 
                                onClick={() => handleNotifyCleanersOpenJob(booking)}
                                disabled={notifyingOpenJob === booking.id}
                              >
                                {notifyingOpenJob === booking.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Bell className="w-4 h-4" />
                                )}
                                Notify All Cleaners (Open Job)
                              </DropdownMenuItem>
                            )}
                            {/* Send Review Request - styled as subtle link */}
                            <DropdownMenuItem 
                              className="gap-2 cursor-pointer text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline" 
                              onClick={() => handleSendReviewRequest(booking)}
                              disabled={sendingReviewRequest === booking.id || !booking.customer?.phone || booking.status !== 'completed'}
                            >
                              {sendingReviewRequest === booking.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Star className="w-3 h-3" />
                              )}
                              Send Review
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer text-amber-600"
                              onClick={() => setChargeConfirmBooking(booking)}
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
                              onClick={() => setCaptureConfirmBooking(booking)}
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
                                  ? 'Place Hold'
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
                            <DropdownMenuItem
                              className="gap-2 cursor-pointer"
                              onClick={() => {
                                setPaymentHistoryBooking(booking);
                                setPaymentHistoryOpen(true);
                              }}
                            >
                              <Clock className="w-4 h-4" /> Payment History
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
        </TabsContent>

        <TabsContent value="drafts" className="space-y-6">
          <div className="bg-card rounded-xl border border-border/50 shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Draft Bookings</h3>
            <p className="text-muted-foreground mb-4">
              These are bookings saved as drafts with pending payment status. Complete the booking or payment to move them to active bookings.
            </p>
            {draftBookings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No draft bookings found.
              </div>
            ) : (
              <div className="space-y-3">
                {draftBookings.map((booking) => (
                  <div key={booking.id} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border/50">
                    <div>
                      <p className="font-medium">
                        #{booking.booking_number} - {booking.customer?.first_name} {booking.customer?.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {booking.service?.name} • {format(new Date(booking.scheduled_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-amber-50 text-amber-700">
                        ${booking.total_amount?.toFixed(2)} unpaid
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveBooking(booking);
                          setViewDialogOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditingBooking(booking);
                          setAddDialogOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(booking)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="quotes" className="space-y-6">
          <QuotesTabContent />
        </TabsContent>

        <TabsContent value="cleaner-wages">
          <BulkEditCleanerWages />
        </TabsContent>
      </Tabs>

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

      {/* Charge Confirmation Dialog */}
      <AlertDialog open={!!chargeConfirmBooking} onOpenChange={(open) => !open && setChargeConfirmBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Charge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to charge <strong>${chargeConfirmBooking?.total_amount?.toFixed(2)}</strong> to{' '}
              <strong>{chargeConfirmBooking?.customer?.first_name} {chargeConfirmBooking?.customer?.last_name}</strong>'s card?
              <br /><br />
              This will immediately charge their saved payment method.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                if (chargeConfirmBooking) {
                  handleChargeCard(chargeConfirmBooking);
                  setChargeConfirmBooking(null);
                }
              }}
            >
              Yes, Charge Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Capture Hold Confirmation Dialog */}
      <AlertDialog open={!!captureConfirmBooking} onOpenChange={(open) => !open && setCaptureConfirmBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Capture Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to capture <strong>${captureConfirmBooking?.total_amount?.toFixed(2)}</strong> from the hold on{' '}
              <strong>{captureConfirmBooking?.customer?.first_name} {captureConfirmBooking?.customer?.last_name}</strong>'s card?
              <br /><br />
              This will finalize the payment hold and transfer the funds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              onClick={() => {
                if (captureConfirmBooking) {
                  handleCapturePayment(captureConfirmBooking);
                  setCaptureConfirmBooking(null);
                }
              }}
            >
              Yes, Capture Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment History Dialog */}
      <PaymentHistoryLogDialog
        open={paymentHistoryOpen}
        onOpenChange={setPaymentHistoryOpen}
        booking={paymentHistoryBooking}
      />

      {/* Bulk Assign Cleaner Dialog */}
      <AlertDialog open={bulkAssignDialogOpen} onOpenChange={setBulkAssignDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign Cleaner to {selectedBookings.size} Booking{selectedBookings.size > 1 ? 's' : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              Select a cleaner to assign to the selected bookings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a cleaner..." />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedStaffId('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!selectedStaffId || bulkAssigning}
              onClick={handleBulkAssign}
            >
              {bulkAssigning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Assigning...
                </>
              ) : (
                'Assign Cleaner'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AdminLayout>
  );
}
