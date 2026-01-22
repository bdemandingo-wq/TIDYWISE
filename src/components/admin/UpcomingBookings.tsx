import { useState, useMemo } from 'react';
import { BookingWithDetails } from '@/hooks/useBookings';
import { cn } from '@/lib/utils';
import { Clock, User, ChevronRight, Phone, Loader2, Edit, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { handleSmsError } from '@/lib/smsErrorHandler';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { EditCustomerDialog } from './EditCustomerDialog';
import { AddBookingDialog } from './AddBookingDialog';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';

interface UpcomingBookingsProps {
  bookings: BookingWithDetails[];
}

const statusColors: Record<string, string> = {
  pending: 'bg-warning/20 text-warning border-warning/30',
  confirmed: 'bg-primary/20 text-primary border-primary/30',
  in_progress: 'bg-info/20 text-info border-info/30',
  completed: 'bg-success/20 text-success border-success/30',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
  no_show: 'bg-muted text-muted-foreground border-muted',
};

const statusLabels: Record<string, string> = {
  pending: 'pending payment',
  confirmed: 'uncleaned',
  in_progress: 'in progress',
  completed: 'clean completed',
  cancelled: 'cancelled',
  no_show: 'no show',
};

// Default service colors
const serviceColors = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'
];

export function UpcomingBookings({ bookings }: UpcomingBookingsProps) {
  const navigate = useNavigate();
  const [selectedBooking, setSelectedBooking] = useState<BookingWithDetails | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<BookingWithDetails['customer'] | null>(null);
  const [editingBooking, setEditingBooking] = useState<BookingWithDetails | null>(null);
  const { isTestMode, maskName, maskEmail, maskAddress, maskAmount } = useTestMode();
  const { organization } = useOrganization();

  const upcomingBookings = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return bookings
      .filter(b => {
        const bookingDate = new Date(b.scheduled_at);
        return bookingDate >= today && b.status !== 'cancelled';
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .slice(0, 5);
  }, [bookings]);

  const getServiceColor = (index: number) => {
    return serviceColors[index % serviceColors.length];
  };

  const sendCleanerNotification = async (booking: BookingWithDetails) => {
    setSendingEmail(true);
    try {
      const customerName = booking.customer 
        ? `${booking.customer.first_name} ${booking.customer.last_name}`
        : 'Unknown Customer';

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
        toast.error('No cleaners assigned or none have phone numbers');
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
              customerName,
              customerPhone: booking.customer?.phone || 'Not provided',
              serviceName: booking.service?.name || 'Cleaning Service',
              appointmentDate: format(new Date(booking.scheduled_at), 'MMMM d, yyyy'),
              appointmentTime: format(new Date(booking.scheduled_at), 'h:mm a'),
              address: booking.address || 'Address not provided',
              bookingNumber: booking.booking_number,
              organizationId: organization?.id,
            },
          });

          // Handle SMS-specific errors
          if (handleSmsError(response)) {
            failCount++;
            continue;
          }
          successCount++;
        } catch (err) {
          console.error(`Failed to notify ${staffMember.name}:`, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        const message = staffToNotify.length > 1 
          ? `SMS sent to ${successCount} team member(s)${failCount > 0 ? `, ${failCount} failed` : ''}`
          : `SMS sent to ${staffToNotify[0].name}`;
        toast.success(message);
      } else {
        toast.error('All notifications failed');
      }
    } catch (err: any) {
      console.error('Failed to send notification:', err);
      toast.error('Failed to send notification: ' + (err.message || 'Unknown error'));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCustomerClick = (booking: BookingWithDetails, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedBooking(booking);
  };

  const handleEditCustomer = () => {
    if (selectedBooking?.customer) {
      setEditingCustomer(selectedBooking.customer);
    }
  };

  const handleEditBooking = () => {
    if (selectedBooking) {
      setEditingBooking(selectedBooking);
      setSelectedBooking(null);
    }
  };

  const getFullAddress = (booking: BookingWithDetails) => {
    const parts = [
      booking.address,
      booking.city,
      booking.state,
      booking.zip_code
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <>
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Upcoming Bookings</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-1 text-primary"
            onClick={() => navigate('/dashboard/bookings')}
          >
            View all <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="divide-y divide-border">
          {upcomingBookings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No upcoming bookings
            </div>
          ) : (
            upcomingBookings.map((booking, index) => (
              <div
                key={booking.id}
                className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setSelectedBooking(booking)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-1 h-full min-h-[60px] rounded-full"
                    style={{ backgroundColor: getServiceColor(index) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{booking.service?.name || 'Service'}</p>
                      <Badge className={cn('capitalize text-xs', statusColors[booking.status])}>
                        {statusLabels[booking.status] || booking.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <button 
                          className="flex items-center gap-1 hover:text-primary transition-colors"
                          onClick={(e) => handleCustomerClick(booking, e)}
                        >
                          <User className="w-3.5 h-3.5" />
                          <span className="truncate">
                            {booking.customer 
                              ? maskName(`${booking.customer.first_name} ${booking.customer.last_name}`)
                              : 'Unknown'}
                        </span>
                      </button>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{format(new Date(booking.scheduled_at), 'h:mm a')}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(booking.scheduled_at), 'EEE, MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Booking Detail Dialog */}
      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Booking Details</DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">
                  {selectedBooking.service?.name || 'Cleaning Service'}
                </span>
                <Badge className={cn('capitalize', statusColors[selectedBooking.status])}>
                  {statusLabels[selectedBooking.status] || selectedBooking.status}
                </Badge>
              </div>
              
              <div className="text-sm text-muted-foreground">
                Booking #{selectedBooking.booking_number}
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {selectedBooking.customer 
                          ? maskName(`${selectedBooking.customer.first_name} ${selectedBooking.customer.last_name}`)
                          : 'Unknown Customer'
                        }
                      </p>
                      <p className="text-muted-foreground">
                        {selectedBooking.customer ? maskEmail(selectedBooking.customer.email) : 'No email'}
                      </p>
                    </div>
                  </div>
                  {selectedBooking.customer && (
                    <Button variant="outline" size="sm" onClick={handleEditCustomer}>
                      Edit
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {format(new Date(selectedBooking.scheduled_at), 'MMMM d, yyyy')} at{' '}
                      {format(new Date(selectedBooking.scheduled_at), 'h:mm a')}
                    </p>
                    <p className="text-muted-foreground">
                      Duration: {selectedBooking.duration} minutes
                    </p>
                  </div>
                </div>

                {getFullAddress(selectedBooking) && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <p>{maskAddress(getFullAddress(selectedBooking))}</p>
                  </div>
                )}

                {selectedBooking.staff && (
                  <div className="flex items-center gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Assigned: {maskName(selectedBooking.staff.name)}</p>
                      <p className="text-muted-foreground">{maskEmail(selectedBooking.staff.email)}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-2xl font-bold">{maskAmount(selectedBooking.total_amount)}</span>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="gap-2"
                    onClick={handleEditBooking}
                  >
                    <Edit className="w-4 h-4" />
                    Edit Booking
                  </Button>
                  <Button 
                    variant="outline" 
                    className="gap-2"
                    onClick={() => sendCleanerNotification(selectedBooking)}
                    disabled={sendingEmail || !selectedBooking.staff?.phone}
                  >
                    {sendingEmail ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Phone className="w-4 h-4" />
                    )}
                    Notify Cleaner
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <EditCustomerDialog 
        open={!!editingCustomer} 
        onOpenChange={(open) => !open && setEditingCustomer(null)}
        customer={editingCustomer}
      />

      {/* Edit Booking Dialog */}
      <AddBookingDialog 
        open={!!editingBooking} 
        onOpenChange={(open) => !open && setEditingBooking(null)}
        booking={editingBooking}
      />
    </>
  );
}
