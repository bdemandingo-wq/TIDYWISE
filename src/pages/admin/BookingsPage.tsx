import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  Star,
  PlusCircle,
  RotateCcw,
  Heart,
  Banknote,
  UserPlus,
  ChevronDown,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { handleSmsError } from '@/lib/smsErrorHandler';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { useBookings, useUpdateBooking, useDeleteBooking, useStaff, BookingWithDetails } from '@/hooks/useBookings';
import { format, isWithinInterval, startOfDay, endOfDay, differenceInDays, differenceInHours, addDays } from 'date-fns';
import { AddBookingDialog } from '@/components/admin/AddBookingDialog';
import { BookingDetailsDialog, AdjustPaymentDialog } from '@/components/admin/BookingDialogs';
import { PaymentHistoryLogDialog } from '@/components/admin/PaymentHistoryLogDialog';
import { BulkEditCleanerWages } from '@/components/admin/BulkEditCleanerWages';
import { supabase } from '@/lib/supabase';
import { QuotesTabContent } from '@/components/admin/QuotesTabContent';
import { AdditionalChargesDialog } from '@/components/admin/AdditionalChargesDialog';
import { toast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/admin/PullToRefreshIndicator';

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
  const isMobile = useIsMobile();
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
  const [placingHold, setPlacingHold] = useState<string | null>(null);
  const [placeHoldConfirmBooking, setPlaceHoldConfirmBooking] = useState<BookingWithDetails | null>(null);
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
  const [cleanerPickerOpen, setCleanerPickerOpen] = useState(false);
  const [cleanerPickerBooking, setCleanerPickerBooking] = useState<BookingWithDetails | null>(null);
  const [selectedCleanerIds, setSelectedCleanerIds] = useState<Set<string>>(new Set());
  const [sendingReviewRequest, setSendingReviewRequest] = useState<string | null>(null);
  const [sendingTipRequest, setSendingTipRequest] = useState<string | null>(null);
  const [bulkNotifyingWeek, setBulkNotifyingWeek] = useState(false);
  const [weeklyReminderDialogOpen, setWeeklyReminderDialogOpen] = useState(false);
  const [weeklyReminderClients, setWeeklyReminderClients] = useState<BookingWithDetails[]>([]);
  const [sendingWeeklyReminders, setSendingWeeklyReminders] = useState(false);
  const [additionalChargesOpen, setAdditionalChargesOpen] = useState(false);
  const [additionalChargesBooking, setAdditionalChargesBooking] = useState<BookingWithDetails | null>(null);
  const [refundDialogBooking, setRefundDialogBooking] = useState<BookingWithDetails | null>(null);
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [depositDialogBooking, setDepositDialogBooking] = useState<BookingWithDetails | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [sendingDepositRequest, setSendingDepositRequest] = useState(false);
  const [assignCleanerBooking, setAssignCleanerBooking] = useState<BookingWithDetails | null>(null);
  const [assigningCleaner, setAssigningCleaner] = useState(false);
  const [actionSheetBooking, setActionSheetBooking] = useState<BookingWithDetails | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const { data: bookings = [], isLoading, error } = useBookings();
  const { data: staffList = [] } = useStaff();
  const queryClient = useQueryClient();

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['bookings'] });
  }, [queryClient]);

  const { refreshing, pullDistance, handlers: pullHandlers } = usePullToRefresh(handlePullRefresh);
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();
  const { isTestMode, maskName, maskEmail, maskAmount, maskAddress } = useTestMode();
  const { organization } = useOrganization();

  // Helper: is a booking fully done (completed + paid)?
  const isFullyDone = useCallback((b: BookingWithDetails) => {
    return b.status === 'completed' && b.payment_status === 'paid';
  }, []);

  // Sort bookings: today's active bookings pinned to top, then reverse chronological
  // On mobile: additionally pin uncompleted/unpaid bookings above fully-done ones
  const sortedBookings = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const isTodayActive = (b: typeof bookings[0]) => {
      const d = new Date(b.scheduled_at);
      return d >= todayStart && d < todayEnd && b.status !== 'completed' && b.status !== 'cancelled';
    };

    return [...bookings].sort((a, b) => {
      // Pin today's active (uncleaned/in-progress) bookings to the very top
      const aTodayActive = isTodayActive(a);
      const bTodayActive = isTodayActive(b);
      if (aTodayActive !== bTodayActive) return aTodayActive ? -1 : 1;
      // Within today's active: earliest first
      if (aTodayActive && bTodayActive) {
        return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
      }

      // Mobile smart sort: uncompleted/unpaid above completed+paid
      if (isMobile) {
        const aDone = isFullyDone(a);
        const bDone = isFullyDone(b);
        if (aDone !== bDone) return aDone ? 1 : -1;
      }

      // Rest: chronological (upcoming dates first)
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });
  }, [bookings, isMobile, isFullyDone]);

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

  const handlePlaceHold = async (booking: BookingWithDetails) => {
    if (!booking.customer?.email) {
      toast({ title: "Error", description: "No customer email found", variant: "destructive" });
      return;
    }

    if (!organization?.id) {
      toast({ title: "Error", description: "Organization context required", variant: "destructive" });
      return;
    }

    setPlacingHold(booking.id);

    try {
      const { data, error } = await supabase.functions.invoke('charge-customer-card', {
        body: {
          email: booking.customer.email,
          amount: booking.total_amount,
          description: `Hold for Booking #${booking.booking_number} - ${booking.service?.name || 'Service'}`,
          bookingId: booking.id,
          organizationId: organization.id,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Hold Placed",
          description: data.message
        });

        await updateBooking.mutateAsync({
          id: booking.id,
          payment_intent_id: data.paymentIntentId,
          payment_status: 'partial' as any,
        });
      } else {
        toast({
          title: data.declined ? "Card Declined" : "Hold Failed",
          description: data.error,
          variant: data.declined ? "default" : "destructive"
        });
      }
    } catch (error: any) {
      console.error('Failed to place hold:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to place hold",
        variant: "destructive"
      });
    } finally {
      setPlacingHold(null);
    }
  };

  const handleProcessRefund = async (booking: BookingWithDetails) => {
    const paymentIntentId = (booking as any).payment_intent_id;

    if (!organization?.id) {
      toast({ title: "Error", description: "Organization context required", variant: "destructive" });
      return;
    }

    if (refundType === 'partial' && (!refundAmount || parseFloat(refundAmount) <= 0)) {
      toast({ title: "Error", description: "Please enter a valid refund amount", variant: "destructive" });
      return;
    }

    setProcessingRefund(true);

    try {
      // If no payment intent, handle as manual refund (just update status)
      if (!paymentIntentId) {
        const newStatus = refundType === 'full' ? 'refunded' : 'partial';
        await updateBooking.mutateAsync({
          id: booking.id,
          payment_status: newStatus as any,
        });
        toast({
          title: "Refund Recorded",
          description: refundType === 'full'
            ? `Full refund of $${booking.total_amount?.toFixed(2)} recorded`
            : `Partial refund of $${parseFloat(refundAmount).toFixed(2)} recorded`,
        });
        setRefundDialogBooking(null);
        setRefundType('full');
        setRefundAmount('');
        return;
      }

      const { data, error } = await supabase.functions.invoke('process-refund', {
        body: {
          paymentIntentId,
          organizationId: organization.id,
          refundType,
          amount: refundType === 'partial' ? parseFloat(refundAmount) : undefined,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Refund Processed",
          description: data.message,
        });

        await updateBooking.mutateAsync({
          id: booking.id,
          payment_status: (data.isFullRefund ? 'refunded' : 'partial') as any,
        });

        setRefundDialogBooking(null);
        setRefundType('full');
        setRefundAmount('');
      } else {
        toast({
          title: "Refund Failed",
          description: data.error,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Failed to process refund:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process refund",
        variant: "destructive"
      });
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleCapturePayment = async (booking: BookingWithDetails) => {
    const paymentIntentId = (booking as any).payment_intent_id;
    
    if (!paymentIntentId) {
      toast({ title: "Error", description: "No payment hold found for this booking", variant: "destructive" });
      return;
    }

    if (!organization?.id) {
      toast({ title: "Error", description: "Organization context required", variant: "destructive" });
      return;
    }

    setCapturingPayment(booking.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('capture-payment', {
        body: {
          paymentIntentId,
          amountToCapture: booking.total_amount,
          organizationId: organization.id,
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

    if (!organization?.id) {
      toast({ title: "Error", description: "Organization context required", variant: "destructive" });
      return;
    }

    setCancelingHold(booking.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('cancel-hold', {
        body: {
          paymentIntentId,
          organizationId: organization.id,
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
    // UI-level single-submit guard (prevents double-click / double-tap charges)
    if (chargingCard === booking.id) return;

    if (booking.payment_status === 'paid') {
      toast({ title: "Already paid", description: "This booking is already marked as paid." });
      return;
    }

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
          bookingId: booking.id,
          // Let the edge function generate the idempotency key with a time bucket
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
      
      // Extract error message from edge function response body if available
      let errorMessage = "Failed to charge card";
      try {
        const body = error?.context?.body;
        if (typeof body === "string" && body.trim()) {
          const parsed = JSON.parse(body);
          if (parsed?.error) {
            errorMessage = parsed.error;
          }
        }
      } catch {
        // Fallback to generic error message
        if (error?.message) {
          errorMessage = error.message;
        }
      }
      
      toast({ 
        title: "Charge Failed", 
        description: errorMessage, 
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

      const response = await supabase.functions.invoke('send-booking-reminder', {
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

      // Handle SMS-specific errors
      if (handleSmsError(response)) {
        return;
      }
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

      // Get team members for this booking (org-scoped)
      const { data: teamAssignments } = await supabase
        .from('booking_team_assignments')
        .select('staff_id, staff:staff(id, name, phone)')
        .eq('booking_id', booking.id)
        .eq('organization_id', organization?.id ?? '');

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
          const response = await supabase.functions.invoke('send-cleaner-notification', {
            body: {
              cleanerName: staffMember.name,
              cleanerPhone: staffMember.phone,
              customerName: booking.customer ? `${booking.customer.first_name} ${booking.customer.last_name}` : 'Customer',
              customerPhone: booking.customer?.phone || 'N/A',
              serviceName: booking.service?.name || 'Cleaning Service',
              appointmentDate: format(scheduledDate, 'EEEE, MMMM d, yyyy'),
              appointmentTime: format(scheduledDate, 'h:mm a'),
              address: fullAddress || 'Address not provided',
              bookingNumber: booking.booking_number,
              organizationId: organization?.id,
            }
          });

          // Handle SMS-specific errors
          if (handleSmsError(response)) {
            failCount++;
            continue;
          }
          if (response.data && !response.data.success) throw new Error(response.data.error || 'SMS delivery failed');
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
              appointmentDate: format(scheduledDate, 'EEEE, MMMM d, yyyy'),
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

  // Open the cleaner picker dialog for an open job
  const handleOpenCleanerPicker = (booking: BookingWithDetails) => {
    if (booking.staff) {
      toast({ title: "Already Assigned", description: "This job is already assigned to a cleaner.", variant: "destructive" });
      return;
    }
    if (!organization?.id) {
      toast({ title: "Error", description: "Organization context required", variant: "destructive" });
      return;
    }
    // Pre-select all active staff
    const allActiveIds = new Set(staffList.filter(s => s.is_active).map(s => s.id));
    setSelectedCleanerIds(allActiveIds);
    setCleanerPickerBooking(booking);
    setCleanerPickerOpen(true);
  };

  // Notify selected cleaners about an open/unassigned job
  const handleNotifySelectedCleaners = async () => {
    const booking = cleanerPickerBooking;
    if (!booking || !organization?.id || selectedCleanerIds.size === 0) return;

    setCleanerPickerOpen(false);
    setNotifyingOpenJob(booking.id);

    try {
      const scheduledDate = new Date(booking.scheduled_at);
      const fullAddress = [booking.address, booking.city, booking.state, booking.zip_code]
        .filter(Boolean)
        .join(', ');

      const { error } = await supabase.functions.invoke('notify-cleaners-open-job', {
        body: {
          jobDetails: {
            booking_id: booking.id,
            booking_number: booking.booking_number,
            service_name: booking.service?.name || 'Cleaning Service',
            scheduled_date: format(scheduledDate, 'MMMM d, yyyy'),
            scheduled_time: format(scheduledDate, 'h:mm a'),
            address: fullAddress || 'Address not provided',
            square_footage: booking.square_footage || '',
            duration: booking.duration,
            total_amount: booking.total_amount,
          },
          organizationId: organization.id,
          staffIds: Array.from(selectedCleanerIds),
        }
      });

      if (error) throw error;

      toast({ 
        title: "Cleaners Notified", 
        description: `Sent notification to ${selectedCleanerIds.size} cleaner(s) about open job #${booking.booking_number}` 
      });
    } catch (error: any) {
      console.error('Failed to notify cleaners:', error);
      toast({ title: "Error", description: error.message || "Failed to notify cleaners", variant: "destructive" });
    } finally {
      setNotifyingOpenJob(null);
      setCleanerPickerBooking(null);
    }
  };

  const handleSendTipRequest = async (booking: BookingWithDetails) => {
    if (!booking.customer?.phone) {
      toast({ title: "Error", description: "Customer has no phone number", variant: "destructive" });
      return;
    }
    if (!organization?.id) {
      toast({ title: "Error", description: "Organization context required", variant: "destructive" });
      return;
    }

    setSendingTipRequest(booking.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-tip-request', {
        body: {
          bookingId: booking.id,
          organizationId: organization.id,
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "Tip Link Sent", description: `Tip request SMS sent to ${booking.customer.first_name}` });
      } else {
        toast({ title: "Error", description: data?.error || "Failed to send tip request", variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Failed to send tip request:', error);
      toast({ title: "Error", description: error.message || "Failed to send tip request", variant: "destructive" });
    } finally {
      setSendingTipRequest(null);
    }
  };

  const handleSendDepositRequest = async () => {
    if (!depositDialogBooking || !depositAmount || !organization?.id) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Error", description: "Please enter a valid deposit amount", variant: "destructive" });
      return;
    }
    if (!depositDialogBooking.customer?.phone) {
      toast({ title: "Error", description: "Customer has no phone number", variant: "destructive" });
      return;
    }

    setSendingDepositRequest(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-deposit-request', {
        body: {
          bookingId: depositDialogBooking.id,
          organizationId: organization.id,
          amount,
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast({ title: "Deposit Link Sent", description: `Deposit request of $${amount.toFixed(2)} sent to ${depositDialogBooking.customer.first_name}` });
        setDepositDialogBooking(null);
        setDepositAmount('');
      } else {
        toast({ title: "Error", description: data?.error || "Failed to send deposit request", variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Failed to send deposit request:', error);
      toast({ title: "Error", description: error.message || "Failed to send deposit request", variant: "destructive" });
    } finally {
      setSendingDepositRequest(false);
    }
  };

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
              appointmentDate: format(scheduledDate, 'EEEE, MMMM d, yyyy'),
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

  // Prepare weekly client reminders
  const handlePrepareWeeklyReminders = () => {
    const now = new Date();
    const weekEnd = addDays(now, 7);
    
    // Get all upcoming bookings for the next 7 days with clients
    const upcomingWeekBookings = sortedBookings.filter(b => {
      const scheduledDate = new Date(b.scheduled_at);
      const customer = b.customer;
      // Filter for clients with phone numbers
      const isEligible = customer && customer.phone;
      return scheduledDate >= now && 
             scheduledDate <= weekEnd && 
             isEligible &&
             !['cancelled', 'completed'].includes(b.status);
    });

    if (upcomingWeekBookings.length === 0) {
      toast({ title: "No Clients to Notify", description: "No upcoming bookings with eligible clients found for this week.", variant: "destructive" });
      return;
    }

    setWeeklyReminderClients(upcomingWeekBookings);
    setWeeklyReminderDialogOpen(true);
  };

  // Send weekly client reminders
  const handleSendWeeklyReminders = async () => {
    if (weeklyReminderClients.length === 0) return;
    
    setSendingWeeklyReminders(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const booking of weeklyReminderClients) {
        try {
          const scheduledDate = new Date(booking.scheduled_at);
          const customerName = booking.customer ? `${booking.customer.first_name}` : 'there';
          const formattedDate = format(scheduledDate, 'EEEE, MMMM d');
          const formattedTime = format(scheduledDate, 'h:mm a');
          
          // AI-style friendly reminder message
          const message = `Hey ${customerName}! 👋 Quick reminder: Your ${booking.service?.name || 'cleaning'} is scheduled for ${formattedDate} at ${formattedTime}.\n\n` +
            `Any special entry instructions? (Key under mat, gate code, etc.) Just reply to let us know!\n\n` +
            `Looking forward to making your space shine! ✨`;

          const response = await supabase.functions.invoke('send-openphone-sms', {
            body: {
              to: booking.customer!.phone,
              message,
              organizationId: organization?.id,
            }
          });

          // Handle SMS-specific errors
          if (handleSmsError(response)) {
            failCount++;
            continue;
          }
          
          // Update booking with reminder sent tag
          await supabase.from('bookings').update({
            notes: (booking.notes ? booking.notes + '\n' : '') + `[Reminder Sent: ${format(new Date(), 'MMM d, h:mm a')}]`
          }).eq('id', booking.id);
          
          successCount++;
        } catch (error) {
          console.error(`Failed to send reminder for booking #${booking.booking_number}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({ 
          title: "Reminders Sent!", 
          description: `Successfully sent ${successCount} reminder(s)${failCount > 0 ? `. ${failCount} failed.` : '.'}`
        });
      } else {
        toast({ title: "Error", description: "Failed to send reminders", variant: "destructive" });
      }
    } finally {
      setSendingWeeklyReminders(false);
      setWeeklyReminderDialogOpen(false);
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
          b.service?.name || (b.total_amount === 0 ? 'Re-clean' : 'Service'),
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
      const response = await supabase.functions.invoke('send-review-request-sms', {
        body: {
          bookingId: booking.id,
          customerId: (booking as any).customer_id || booking.customer?.id,
          customerPhone: booking.customer.phone,
          customerName: `${booking.customer.first_name} ${booking.customer.last_name}`,
          serviceName: booking.service?.name || 'Cleaning Service',
          organizationId: organization.id,
        }
      });

      // Handle SMS-specific errors
      if (handleSmsError(response)) {
        return;
      }
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
      <div className="flex flex-col sm:flex-row gap-2 md:gap-4 mb-4 md:mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
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
          <Button 
            variant="outline" 
            className="h-11 gap-2 rounded-xl text-emerald-600 border-emerald-200 hover:bg-emerald-50"
            onClick={handlePrepareWeeklyReminders}
          >
            <Phone className="w-4 h-4" />
            Remind Clients
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
        ) : isMobile ? (
          /* ========== MOBILE CARD VIEW ========== */
          <div
            className="divide-y divide-border overflow-y-auto"
            {...pullHandlers}
          >
            <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />
          {filteredBookings.map((booking, index) => {
              const paymentInfo = getPaymentStatusInfo(booking);
              const scheduledDate = new Date(booking.scheduled_at);
              const isCleaned = booking.status === 'completed';
              const isPaid = booking.payment_status === 'paid';
              
              return (
                <div
                  key={booking.id}
                  className="p-3 active:bg-muted/30 transition-colors"
                  onClick={() => setActionSheetBooking(booking)}
                >
                  {/* Top row: booking number + amount */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs font-bold text-primary">
                      #{booking.booking_number}
                    </span>
                    <span className="font-bold text-sm text-foreground">{maskAmount(booking.total_amount)}</span>
                  </div>
                  
                  {/* Client name */}
                  <p className="text-sm font-medium text-foreground mb-1">
                    {booking.customer 
                      ? maskName(`${booking.customer.first_name} ${booking.customer.last_name}`)
                      : 'Unknown'
                    }
                  </p>
                  
                  {/* Service + date */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span>{booking.service?.name || (booking.total_amount === 0 ? 'Re-clean' : 'Service')}</span>
                    <span>•</span>
                    <span>{format(scheduledDate, 'MMM d, h:mm a')}</span>
                  </div>
                  
                  {/* Staff */}
                  <div className="text-xs text-muted-foreground mb-2">
                    <span className={cn(!booking.staff?.name && "italic")}>
                      {booking.staff?.name ? maskName(booking.staff.name) : 'Unassigned'}
                    </span>
                  </div>
                  
                  {/* Badges row */}
                  <div className="flex items-center gap-2">
                    {/* Clean status badge */}
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium",
                      isCleaned
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    )}>
                      {isCleaned ? (
                        <>
                          <CheckCircle className="w-3 h-3" />
                          clean completed
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          uncleaned
                        </>
                      )}
                    </div>
                    {/* Payment badge */}
                    <div className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                      isPaid
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-orange-50 text-orange-700"
                    )}>
                      {isPaid ? (
                        <>
                          <CheckCircle className="w-3 h-3" />
                          Paid
                        </>
                      ) : (
                        <>
                          <span>○</span>
                          {paymentInfo.label}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ========== DESKTOP TABLE VIEW ========== */
          <div className="overflow-x-auto" data-no-swipe>
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
                        <div className="flex items-center gap-2 md:gap-3">
                          <div className="w-7 h-7 md:w-9 md:h-9 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                            <span className="text-xs md:text-sm font-semibold text-primary">
                              {isTestMode ? 'J' : (booking.customer?.first_name?.[0] || '?')}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm md:text-base font-medium text-foreground">
                              {booking.customer 
                                ? maskName(`${booking.customer.first_name} ${booking.customer.last_name}`)
                                : 'Unknown'
                              }
                            </p>
                            <p className="text-[10px] md:text-xs text-muted-foreground">
                              {maskEmail(booking.customer?.email || 'No email')}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{booking.service?.name || (booking.total_amount === 0 ? 'Re-clean' : 'Service')}</span>
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
                           <DropdownMenuContent align="end" className="w-[420px] bg-popover border-border rounded-xl p-0">
                            <div className="grid grid-cols-2 divide-x divide-border">
                              {/* Left column: Booking */}
                              <div className="p-1">
                                <DropdownMenuLabel className="text-xs text-muted-foreground px-2">Booking</DropdownMenuLabel>
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-destructive cursor-pointer focus:text-destructive"
                                  onClick={() => handleDelete(booking)}
                                >
                                  <Trash2 className="w-4 h-4" /> Delete
                                </DropdownMenuItem>
                              </div>

                              {/* Right column: Payments & Communication */}
                              <div className="p-1">
                                <DropdownMenuLabel className="text-xs text-muted-foreground px-2">Payments & Comms</DropdownMenuLabel>
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
                                {booking.payment_status === 'paid' && (
                                  <DropdownMenuItem 
                                    className="gap-2 cursor-pointer text-orange-600" 
                                    onClick={async () => {
                                      await updateBooking.mutateAsync({
                                        id: booking.id,
                                        payment_status: 'pending' as any
                                      });
                                      toast({ title: "Marked Unpaid", description: `Booking #${booking.booking_number} marked as unpaid.` });
                                    }}
                                  >
                                    <XCircle className="w-4 h-4" /> 
                                    Mark Unpaid
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer text-teal-600"
                                  onClick={() => {
                                    setAdditionalChargesBooking(booking);
                                    setAdditionalChargesOpen(true);
                                  }}
                                >
                                  <PlusCircle className="w-4 h-4" /> Additional Charge
                                </DropdownMenuItem>
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
                                  {booking.payment_status === 'paid' ? 'Already Paid' : 'Charge Card Now'}
                                </DropdownMenuItem>
                                {!(booking as any).payment_intent_id && booking.payment_status !== 'paid' && (
                                  <DropdownMenuItem
                                    className="gap-2 cursor-pointer"
                                    onClick={() => setPlaceHoldConfirmBooking(booking)}
                                    disabled={placingHold === booking.id || !booking.customer?.email}
                                  >
                                    {placingHold === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                                    Place Hold
                                  </DropdownMenuItem>
                                )}
                                {!!(booking as any).payment_intent_id && booking.payment_status !== 'paid' && (
                                  <DropdownMenuItem
                                    className="gap-2 cursor-pointer"
                                    onClick={() => setCaptureConfirmBooking(booking)}
                                    disabled={capturingPayment === booking.id}
                                  >
                                    {capturingPayment === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                                    Capture Hold
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer"
                                  onClick={() => handleCancelHold(booking)}
                                  disabled={cancelingHold === booking.id || booking.payment_status === 'paid' || booking.payment_status === 'refunded' || !(booking as any).payment_intent_id}
                                >
                                  {cancelingHold === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                  Release Hold
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer"
                                  onClick={() => { setRefundDialogBooking(booking); setRefundType('full'); setRefundAmount(''); }}
                                  disabled={booking.payment_status === 'refunded' || (booking.payment_status !== 'paid' && !(booking as any).payment_intent_id)}
                                >
                                  <RotateCcw className="w-4 h-4" /> Refund
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2 cursor-pointer"
                                  onClick={() => { setPaymentHistoryBooking(booking); setPaymentHistoryOpen(true); }}
                                >
                                  <Clock className="w-4 h-4" /> Payment History
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Communication</DropdownMenuLabel>
                                <DropdownMenuItem 
                                  className="gap-2 cursor-pointer text-blue-600" 
                                  onClick={() => handleSendReminder(booking)}
                                  disabled={sendingReminder === booking.id || !booking.customer?.phone}
                                >
                                  {sendingReminder === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                                  Send Reminder
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="gap-2 cursor-pointer text-purple-600" 
                                  onClick={() => handleSendCleanerNotification(booking)}
                                  disabled={sendingCleanerNotification === booking.id || !booking.staff?.phone}
                                >
                                  {sendingCleanerNotification === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                                  Notify Cleaner
                                </DropdownMenuItem>
                                {!booking.staff && (
                                  <DropdownMenuItem 
                                    className="gap-2 cursor-pointer text-green-600" 
                                    onClick={() => handleOpenCleanerPicker(booking)}
                                    disabled={notifyingOpenJob === booking.id}
                                  >
                                    {notifyingOpenJob === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                                    Notify Cleaners
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  className="gap-2 cursor-pointer text-amber-600" 
                                  onClick={() => handleSendReviewRequest(booking)}
                                  disabled={sendingReviewRequest === booking.id || !booking.customer?.phone || booking.status !== 'completed'}
                                >
                                  {sendingReviewRequest === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                                  Send Review
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="gap-2 cursor-pointer text-emerald-600" 
                                  onClick={() => handleSendTipRequest(booking)}
                                  disabled={sendingTipRequest === booking.id || !booking.customer?.phone || booking.status !== 'completed'}
                                >
                                  {sendingTipRequest === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
                                  Send Tip Link
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="gap-2 cursor-pointer text-blue-600" 
                                  onClick={() => {
                                    setDepositDialogBooking(booking);
                                    setDepositAmount('');
                                  }}
                                  disabled={!booking.customer?.phone}
                                >
                                  <Banknote className="w-4 h-4" />
                                  Send Deposit Link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Staff</DropdownMenuLabel>
                                <DropdownMenuItem 
                                  className="gap-2 cursor-pointer text-indigo-600" 
                                  onClick={() => setAssignCleanerBooking(booking)}
                                >
                                  <UserPlus className="w-4 h-4" />
                                  Assign Cleaner
                                </DropdownMenuItem>
                              </div>
                            </div>
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

      {/* ========== MOBILE ACTION BOTTOM SHEET ========== */}
      <Sheet open={!!actionSheetBooking} onOpenChange={(open) => !open && setActionSheetBooking(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
          {actionSheetBooking && (() => {
            const booking = actionSheetBooking;
            const statusStyle = statusConfig[booking.status] || statusConfig.pending;
            const paymentInfo = getPaymentStatusInfo(booking);
            return (
              <>
                <SheetHeader className="pb-3 border-b border-border">
                  <SheetTitle className="text-left">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-primary">#{booking.booking_number}</span>
                      <span className="font-bold">{maskAmount(booking.total_amount)}</span>
                    </div>
                    <p className="text-base font-medium text-foreground mt-1">
                      {booking.customer 
                        ? maskName(`${booking.customer.first_name} ${booking.customer.last_name}`)
                        : 'Unknown'
                      }
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium",
                        statusStyle.bg, statusStyle.text
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", statusStyle.dot)} />
                        {statusLabels[booking.status] || booking.status}
                      </div>
                      <div className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                        paymentInfo.bg, paymentInfo.text
                      )}>
                        <span>{paymentInfo.icon}</span>
                        {paymentInfo.label}
                      </div>
                    </div>
                  </SheetTitle>
                </SheetHeader>

                {/* Quick Actions - Always visible */}
                <div className="py-3 space-y-2 border-b border-border">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-10"
                    onClick={() => {
                      setActionSheetBooking(null);
                      setActiveBooking(booking);
                      setViewDialogOpen(true);
                    }}
                  >
                    <Eye className="w-4 h-4" /> View Details
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-10 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                    onClick={async () => {
                      await updateBooking.mutateAsync({ id: booking.id, payment_status: 'paid' as any });
                      toast({ title: "Marked Paid", description: `Booking #${booking.booking_number} marked as paid.` });
                      setActionSheetBooking(null);
                    }}
                    disabled={booking.payment_status === 'paid'}
                  >
                    <CreditCard className="w-4 h-4" /> {booking.payment_status === 'paid' ? 'Already Paid' : 'Mark Paid'}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-10"
                    onClick={() => {
                      handleStatusChange(booking.id, 'completed');
                      setActionSheetBooking(null);
                    }}
                    disabled={booking.status === 'completed'}
                  >
                    <CheckCircle className="w-4 h-4" /> Mark Complete
                  </Button>
                </div>

                {/* Collapsible Sections */}
                <div className="py-2 space-y-1">
                  {/* Booking Section */}
                  <Collapsible open={openSections['booking']} onOpenChange={(open) => setOpenSections(prev => ({ ...prev, booking: open }))}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-1 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg">
                      <span>Booking</span>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", openSections['booking'] && "rotate-180")} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 pb-2">
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { setActionSheetBooking(null); setEditingBooking(booking); setAddDialogOpen(true); }}>
                        <Edit className="w-4 h-4" /> Edit
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { setActionSheetBooking(null); handleDuplicate(booking); }}>
                        <Copy className="w-4 h-4" /> Duplicate
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { handleStatusChange(booking.id, 'completed'); setActiveBooking(booking); setAdjustPaymentOpen(true); setActionSheetBooking(null); }} disabled={booking.status === 'completed'}>
                        Mark Complete & Adjust Pay
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-amber-600" onClick={async () => { await handleStatusChange(booking.id, 'confirmed'); toast({ title: "Marked Uncleaned" }); setActionSheetBooking(null); }} disabled={booking.status === 'confirmed'}>
                        <XCircle className="w-4 h-4" /> Mark Uncleaned
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { setActiveBooking(booking); setAdjustPaymentOpen(true); setActionSheetBooking(null); }}>
                        <DollarSign className="w-4 h-4" /> Adjust Cleaner Pay
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-destructive" onClick={() => { setActionSheetBooking(null); handleDelete(booking); }}>
                        <Trash2 className="w-4 h-4" /> Delete
                      </Button>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Payments Section */}
                  <Collapsible open={openSections['payments']} onOpenChange={(open) => setOpenSections(prev => ({ ...prev, payments: open }))}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-1 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg">
                      <span>Payments</span>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", openSections['payments'] && "rotate-180")} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 pb-2">
                      {booking.payment_status === 'paid' && (
                        <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-orange-600" onClick={async () => { await updateBooking.mutateAsync({ id: booking.id, payment_status: 'pending' as any }); toast({ title: "Marked Unpaid" }); setActionSheetBooking(null); }}>
                          <XCircle className="w-4 h-4" /> Mark Unpaid
                        </Button>
                      )}
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { setAdditionalChargesBooking(booking); setAdditionalChargesOpen(true); setActionSheetBooking(null); }}>
                        <PlusCircle className="w-4 h-4" /> Additional Charge
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-amber-600" onClick={() => { setChargeConfirmBooking(booking); setActionSheetBooking(null); }} disabled={chargingCard === booking.id || booking.payment_status === 'paid' || !booking.customer?.email}>
                        <DollarSign className="w-4 h-4" /> Charge Card Now
                      </Button>
                      {!(booking as any).payment_intent_id && booking.payment_status !== 'paid' && (
                        <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { setPlaceHoldConfirmBooking(booking); setActionSheetBooking(null); }} disabled={placingHold === booking.id || !booking.customer?.email}>
                          <CreditCard className="w-4 h-4" /> Place Hold
                        </Button>
                      )}
                      {!!(booking as any).payment_intent_id && booking.payment_status !== 'paid' && (
                        <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { setCaptureConfirmBooking(booking); setActionSheetBooking(null); }} disabled={capturingPayment === booking.id}>
                          <CreditCard className="w-4 h-4" /> Capture Hold
                        </Button>
                      )}
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { handleCancelHold(booking); setActionSheetBooking(null); }} disabled={cancelingHold === booking.id || booking.payment_status === 'paid' || booking.payment_status === 'refunded' || !(booking as any).payment_intent_id}>
                        <XCircle className="w-4 h-4" /> Release Hold
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { setRefundDialogBooking(booking); setRefundType('full'); setRefundAmount(''); setActionSheetBooking(null); }} disabled={booking.payment_status === 'refunded' || (booking.payment_status !== 'paid' && !(booking as any).payment_intent_id)}>
                        <RotateCcw className="w-4 h-4" /> Refund
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm" onClick={() => { setPaymentHistoryBooking(booking); setPaymentHistoryOpen(true); setActionSheetBooking(null); }}>
                        <Clock className="w-4 h-4" /> Payment History
                      </Button>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Communication Section */}
                  <Collapsible open={openSections['communication']} onOpenChange={(open) => setOpenSections(prev => ({ ...prev, communication: open }))}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-1 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg">
                      <span>Communication</span>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", openSections['communication'] && "rotate-180")} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 pb-2">
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-blue-600" onClick={() => { handleSendReminder(booking); setActionSheetBooking(null); }} disabled={sendingReminder === booking.id || !booking.customer?.phone}>
                        <Phone className="w-4 h-4" /> Send Reminder
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-purple-600" onClick={() => { handleSendCleanerNotification(booking); setActionSheetBooking(null); }} disabled={sendingCleanerNotification === booking.id || !booking.staff?.phone}>
                        <Phone className="w-4 h-4" /> Notify Cleaner
                      </Button>
                      {!booking.staff && (
                        <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-green-600" onClick={() => { handleOpenCleanerPicker(booking); setActionSheetBooking(null); }} disabled={notifyingOpenJob === booking.id}>
                          <Bell className="w-4 h-4" /> Notify Cleaners (Open Job)
                        </Button>
                      )}
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-amber-600" onClick={() => { handleSendReviewRequest(booking); setActionSheetBooking(null); }} disabled={sendingReviewRequest === booking.id || !booking.customer?.phone || booking.status !== 'completed'}>
                        <Star className="w-4 h-4" /> Send Review
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-emerald-600" onClick={() => { handleSendTipRequest(booking); setActionSheetBooking(null); }} disabled={sendingTipRequest === booking.id || !booking.customer?.phone || booking.status !== 'completed'}>
                        <Heart className="w-4 h-4" /> Send Tip Link
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-blue-600" onClick={() => { setDepositDialogBooking(booking); setDepositAmount(''); setActionSheetBooking(null); }} disabled={!booking.customer?.phone}>
                        <Banknote className="w-4 h-4" /> Send Deposit Link
                      </Button>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Staff Section */}
                  <Collapsible open={openSections['staff']} onOpenChange={(open) => setOpenSections(prev => ({ ...prev, staff: open }))}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-1 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg">
                      <span>Staff</span>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", openSections['staff'] && "rotate-180")} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 pb-2">
                      <Button variant="ghost" className="w-full justify-start gap-2 h-9 text-sm text-indigo-600" onClick={() => { setAssignCleanerBooking(booking); setActionSheetBooking(null); }}>
                        <UserPlus className="w-4 h-4" /> Assign Cleaner
                      </Button>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
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

      {/* Place Hold Confirmation Dialog */}
      <AlertDialog open={!!placeHoldConfirmBooking} onOpenChange={(open) => !open && setPlaceHoldConfirmBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Place Hold</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to place a hold of <strong>${placeHoldConfirmBooking?.total_amount?.toFixed(2)}</strong> on{' '}
              <strong>{placeHoldConfirmBooking?.customer?.first_name} {placeHoldConfirmBooking?.customer?.last_name}</strong>'s card?
              <br /><br />
              This will authorize the amount but not charge the card until you capture the payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              onClick={() => {
                if (placeHoldConfirmBooking) {
                  handlePlaceHold(placeHoldConfirmBooking);
                  setPlaceHoldConfirmBooking(null);
                }
              }}
            >
              Yes, Place Hold
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

      {/* Refund Dialog */}
      <AlertDialog open={!!refundDialogBooking} onOpenChange={(open) => {
        if (!open) {
          setRefundDialogBooking(null);
          setRefundType('full');
          setRefundAmount('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Process Refund</AlertDialogTitle>
            <AlertDialogDescription>
              Refund payment for Booking #{refundDialogBooking?.booking_number} —{' '}
              <strong>{refundDialogBooking?.customer?.first_name} {refundDialogBooking?.customer?.last_name}</strong>
              <br />
              Original amount: <strong>${refundDialogBooking?.total_amount?.toFixed(2)}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <RadioGroup value={refundType} onValueChange={(v) => setRefundType(v as 'full' | 'partial')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="refund-full" />
                <Label htmlFor="refund-full">Full Refund (${refundDialogBooking?.total_amount?.toFixed(2)})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial" id="refund-partial" />
                <Label htmlFor="refund-partial">Partial Refund</Label>
              </div>
            </RadioGroup>
            {refundType === 'partial' && (
              <div className="space-y-2">
                <Label htmlFor="refund-amount">Refund Amount ($)</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={refundDialogBooking?.total_amount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processingRefund}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              disabled={processingRefund}
              onClick={() => {
                if (refundDialogBooking) {
                  handleProcessRefund(refundDialogBooking);
                }
              }}
            >
              {processingRefund ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                `Refund ${refundType === 'full' ? `$${refundDialogBooking?.total_amount?.toFixed(2)}` : refundAmount ? `$${parseFloat(refundAmount).toFixed(2)}` : '...'}`
              )}
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

      {/* Additional Charges Dialog */}
      {additionalChargesBooking && (
        <AdditionalChargesDialog
          open={additionalChargesOpen}
          onOpenChange={setAdditionalChargesOpen}
          bookingId={additionalChargesBooking.id}
          bookingNumber={additionalChargesBooking.booking_number}
          organizationId={organization?.id || ''}
          currentTotal={additionalChargesBooking.total_amount}
          customerEmail={additionalChargesBooking.customer?.email}
          onTotalUpdated={() => {
            // Refetch handled by invalidation in dialog
          }}
        />
      )}

      {/* Deposit Request Dialog */}
      <AlertDialog open={!!depositDialogBooking} onOpenChange={(open) => { if (!open) setDepositDialogBooking(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Deposit Link</AlertDialogTitle>
            <AlertDialogDescription>
              Send a deposit payment link to {depositDialogBooking?.customer?.first_name} {depositDialogBooking?.customer?.last_name} for Booking #{depositDialogBooking?.booking_number}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label className="text-sm font-medium">Deposit Amount ($)</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder="Enter deposit amount..."
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="mt-2"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Customer will receive an SMS with a secure payment link for this amount.
              <br />Phone: {depositDialogBooking?.customer?.phone || 'N/A'}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDepositDialogBooking(null); setDepositAmount(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sendingDepositRequest || !depositAmount || parseFloat(depositAmount) <= 0}
              onClick={handleSendDepositRequest}
              className="bg-primary hover:bg-primary/90"
            >
              {sendingDepositRequest ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                `Send $${depositAmount ? parseFloat(depositAmount).toFixed(2) : '0.00'} Deposit Link`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Cleaner Dialog */}
      <AlertDialog open={!!assignCleanerBooking} onOpenChange={(open) => !open && setAssignCleanerBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign Cleaner</AlertDialogTitle>
            <AlertDialogDescription>
              Select a cleaner to assign to Booking #{assignCleanerBooking?.booking_number} — {assignCleanerBooking?.customer?.first_name} {assignCleanerBooking?.customer?.last_name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger>
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
            <AlertDialogCancel onClick={() => { setAssignCleanerBooking(null); setSelectedStaffId(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={assigningCleaner || !selectedStaffId}
              onClick={async () => {
                if (!assignCleanerBooking || !selectedStaffId) return;
                setAssigningCleaner(true);
                try {
                  await updateBooking.mutateAsync({
                    id: assignCleanerBooking.id,
                    staff_id: selectedStaffId,
                  });
                  toast({ title: "Cleaner Assigned", description: `Cleaner assigned to booking #${assignCleanerBooking.booking_number}` });
                  setAssignCleanerBooking(null);
                  setSelectedStaffId('');
                } catch (error) {
                  toast({ title: "Error", description: "Failed to assign cleaner", variant: "destructive" });
                } finally {
                  setAssigningCleaner(false);
                }
              }}
              className="bg-primary hover:bg-primary/90"
            >
              {assigningCleaner ? (
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
      {/* Cleaner Picker Dialog */}
      <AlertDialog open={cleanerPickerOpen} onOpenChange={setCleanerPickerOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Select Cleaners to Notify</AlertDialogTitle>
            <AlertDialogDescription>
              Choose which cleaners should receive the notification for job #{cleanerPickerBooking?.booking_number}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2 py-2">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Checkbox
                checked={selectedCleanerIds.size === staffList.filter(s => s.is_active).length && selectedCleanerIds.size > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedCleanerIds(new Set(staffList.filter(s => s.is_active).map(s => s.id)));
                  } else {
                    setSelectedCleanerIds(new Set());
                  }
                }}
              />
              <Label className="text-sm font-medium cursor-pointer">Select All</Label>
            </div>
            {staffList.filter(s => s.is_active).map((staff) => (
              <div key={staff.id} className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCleanerIds.has(staff.id)}
                  onCheckedChange={(checked) => {
                    setSelectedCleanerIds(prev => {
                      const next = new Set(prev);
                      if (checked) next.add(staff.id);
                      else next.delete(staff.id);
                      return next;
                    });
                  }}
                />
                <Label className="text-sm cursor-pointer flex-1">{staff.name}</Label>
                {!staff.phone && <Badge variant="outline" className="text-xs text-muted-foreground">No phone</Badge>}
              </div>
            ))}
            {staffList.filter(s => s.is_active).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No active cleaners found.</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleNotifySelectedCleaners}
              disabled={selectedCleanerIds.size === 0}
            >
              <Bell className="w-4 h-4 mr-2" />
              Notify {selectedCleanerIds.size} Cleaner{selectedCleanerIds.size !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AdminLayout>
  );
}
