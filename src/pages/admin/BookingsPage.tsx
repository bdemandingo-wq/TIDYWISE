import { useState } from 'react';
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
import { Search, Download, MoreHorizontal, Eye, Edit, Trash2, Plus, Loader2, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useBookings, useUpdateBooking, BookingWithDetails } from '@/hooks/useBookings';
import { format } from 'date-fns';
import { AddBookingDialog } from '@/components/admin/AddBookingDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const statusColors: Record<string, string> = {
  pending: 'bg-warning/20 text-warning border-warning/30',
  confirmed: 'bg-primary/20 text-primary border-primary/30',
  in_progress: 'bg-info/20 text-info border-info/30',
  completed: 'bg-success/20 text-success border-success/30',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
  no_show: 'bg-muted text-muted-foreground border-muted',
};

export default function BookingsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [capturingPayment, setCapturingPayment] = useState<string | null>(null);

  const { data: bookings = [], isLoading, error } = useBookings();
  const updateBooking = useUpdateBooking();

  const filteredBookings = bookings.filter((booking) => {
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
    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    await updateBooking.mutateAsync({ 
      id: bookingId, 
      status: newStatus as BookingWithDetails['status']
    });
  };

  const handleCapturePayment = async (booking: BookingWithDetails) => {
    if (!booking.customer?.email) {
      toast({ title: "Error", description: "Customer email not found", variant: "destructive" });
      return;
    }

    setCapturingPayment(booking.id);
    
    try {
      // First, we need to find any pending payment intents for this customer
      // For now, we'll prompt the admin to enter the payment intent ID
      // In a real implementation, you'd store the payment intent ID with the booking
      const paymentIntentId = prompt("Enter the Payment Intent ID to capture:");
      
      if (!paymentIntentId) {
        setCapturingPayment(null);
        return;
      }

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
        
        // Update booking payment status
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
      subtitle={`${filteredBookings.length} total bookings`}
      actions={
        <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Booking
        </Button>
      }
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search bookings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-muted-foreground mb-4">No bookings found</p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create your first booking
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow key={booking.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-sm font-semibold">
                    #{booking.booking_number}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {booking.customer 
                          ? `${booking.customer.first_name} ${booking.customer.last_name}`
                          : 'Unknown Customer'
                        }
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {booking.customer?.email || 'No email'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{booking.service?.name || 'Unknown Service'}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {format(new Date(booking.scheduled_at), 'MMM d, yyyy')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(booking.scheduled_at), 'h:mm a')}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{booking.staff?.name || 'Unassigned'}</TableCell>
                  <TableCell>
                    <Badge className={cn('capitalize', statusColors[booking.status] || statusColors.pending)}>
                      {booking.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">${booking.total_amount}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <Eye className="w-4 h-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Edit className="w-4 h-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="gap-2"
                          onClick={() => handleStatusChange(booking.id, 'confirmed')}
                        >
                          Confirm
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="gap-2"
                          onClick={() => handleStatusChange(booking.id, 'completed')}
                        >
                          Mark Complete
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="gap-2"
                          onClick={() => handleCapturePayment(booking)}
                          disabled={capturingPayment === booking.id || booking.payment_status === 'paid'}
                        >
                          {capturingPayment === booking.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CreditCard className="w-4 h-4" />
                          )}
                          {booking.payment_status === 'paid' ? 'Payment Captured' : 'Capture Payment'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="gap-2 text-destructive"
                          onClick={() => handleStatusChange(booking.id, 'cancelled')}
                        >
                          <Trash2 className="w-4 h-4" /> Cancel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AddBookingDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </AdminLayout>
  );
}
