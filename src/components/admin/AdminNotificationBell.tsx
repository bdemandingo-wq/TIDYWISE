import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { useOrgId } from '@/hooks/useOrgId';

interface AdminNotification {
  id: string;
  type: 'booking' | 'payment' | 'customer' | 'staff' | 'system';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  resource_id?: string;
  resource_type?: string;
}

export function AdminNotificationBell() {
  const { organizationId } = useOrgId();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Simulated notifications based on recent activity
  const fetchNotifications = async (force = false) => {
    if (!organizationId) return;
    if (hasFetched && !force) return;

    try {
      // Fetch recent booking request notifications
      const { data: requestNotifications, error: reqError } = await supabase
        .from('admin_booking_request_notifications')
        .select(`
          id,
          is_read,
          created_at,
          booking_request:client_booking_requests(
            id,
            requested_date,
            customer:customers(first_name, last_name),
            service:services(name)
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(10);

      const bookingRequestNotifs: AdminNotification[] = (requestNotifications || []).map((n: any) => {
        const customerName = n.booking_request?.customer 
          ? `${n.booking_request.customer.first_name} ${n.booking_request.customer.last_name}`
          : 'Customer';
        const serviceName = n.booking_request?.service?.name || 'Service';
        const requestDate = n.booking_request?.requested_date 
          ? format(new Date(n.booking_request.requested_date), 'MMM d, yyyy')
          : 'TBD';
        
        return {
          id: `request-${n.id}`,
          type: 'customer' as const,
          title: `New Booking Request`,
          message: `${customerName} requested ${serviceName} on ${requestDate}`,
          is_read: n.is_read,
          created_at: n.created_at,
          resource_id: n.booking_request?.id,
          resource_type: 'booking_request',
        };
      });

      // Fetch recent bookings with customer and service info
      const { data: recentBookings, error } = await supabase
        .from('bookings')
        .select(`
          id, 
          booking_number, 
          status, 
          created_at, 
          payment_status,
          scheduled_at,
          customers:customer_id (first_name, last_name),
          services:service_id (name)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(10);

      const bookingNotifications: AdminNotification[] = [];
      if (!error && recentBookings) {
        recentBookings.forEach((booking: any) => {
          const customerName = booking.customers 
            ? `${booking.customers.first_name} ${booking.customers.last_name}` 
            : 'Unknown Customer';
          const serviceName = booking.services?.name || 'Service';
          const cleanDate = booking.scheduled_at 
            ? format(new Date(booking.scheduled_at), 'MMM d, yyyy')
            : 'TBD';
          
          bookingNotifications.push({
            id: `booking-${booking.id}`,
            type: 'booking' as const,
            title: customerName,
            message: `${serviceName} • ${cleanDate}`,
            is_read: true,
            created_at: booking.created_at,
            resource_id: booking.id,
            resource_type: 'booking',
          });
        });
      }

      // Combine and sort by created_at
      const allNotifications = [...bookingRequestNotifs, ...bookingNotifications]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setNotifications(allNotifications);
      setUnreadCount(allNotifications.filter((n) => !n.is_read).length);
      setHasFetched(true);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchNotifications();

      // Subscribe to realtime booking changes
      const channel = supabase
        .channel('admin-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'admin_booking_request_notifications',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            // Refresh notifications when a new booking request comes in
            fetchNotifications(true);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'bookings',
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const newBooking = payload.new as any;
            // Fetch full booking details for better notification
            fetchNotifications();
            const newNotification: AdminNotification = {
              id: `booking-${newBooking.id}`,
              type: 'booking',
              title: 'New Booking Created',
              message: `Scheduled for ${newBooking.scheduled_at ? format(new Date(newBooking.scheduled_at), 'MMM d') : 'TBD'}`,
              is_read: false,
              created_at: newBooking.created_at,
              resource_id: newBooking.id,
              resource_type: 'booking',
            };
            setNotifications((prev) => [newNotification, ...prev]);
            setUnreadCount((prev) => prev + 1);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'bookings',
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const updatedBooking = payload.new as any;
            const oldBooking = payload.old as any;
            
            // Only notify on status changes
            if (oldBooking.status !== updatedBooking.status || oldBooking.payment_status !== updatedBooking.payment_status) {
              const newNotification: AdminNotification = {
                id: `booking-update-${updatedBooking.id}-${Date.now()}`,
                type: 'booking',
                title: `Booking #${updatedBooking.booking_number} Updated`,
                message: `Status changed to ${updatedBooking.status}`,
                is_read: false,
                created_at: new Date().toISOString(),
                resource_id: updatedBooking.id,
                resource_type: 'booking',
              };
              setNotifications((prev) => [newNotification, ...prev]);
              setUnreadCount((prev) => prev + 1);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [organizationId]);

  const markAsRead = async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    // If it's a booking request notification, also mark it as read in the database
    if (notificationId.startsWith('request-')) {
      const dbId = notificationId.replace('request-', '');
      await supabase
        .from('admin_booking_request_notifications')
        .update({ is_read: true })
        .eq('id', dbId);
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount > 0) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      
      // Also mark all booking request notifications as read in the database
      if (organizationId) {
        await supabase
          .from('admin_booking_request_notifications')
          .update({ is_read: true })
          .eq('organization_id', organizationId)
          .eq('is_read', false);
      }
    } else {
      // Clear all notifications if all are already read
      setNotifications([]);
    }
    setIsOpen(false);
  };

  const handleNotificationClick = (notification: AdminNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'booking':
        return '📅';
      case 'payment':
        return '💳';
      case 'customer':
        return '👤';
      case 'staff':
        return '👷';
      default:
        return '🔔';
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">Notifications</h4>
          {notifications.length > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              {unreadCount > 0 ? 'Mark all read' : 'Clear all'}
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 15).map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                    !notification.is_read ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg mt-0.5">{getTypeIcon(notification.type)}</span>
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    )}
                    <div className={!notification.is_read ? '' : 'ml-4'}>
                      <p className="font-medium text-sm">{notification.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(notification.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
