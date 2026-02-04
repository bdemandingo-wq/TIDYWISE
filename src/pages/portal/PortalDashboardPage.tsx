import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { 
  CalendarDays, 
  Clock, 
  LogOut, 
  MapPin, 
  Star, 
  Trophy,
  Calendar,
  Plus,
  Bell,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings,
  User,
  Trash2
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Seo } from "@/components/Seo";
import { useClientPortal } from "@/contexts/ClientPortalContext";
import { supabase } from "@/lib/supabase";
import { PortalSettingsTab } from "@/components/portal/PortalSettingsTab";
import { PortalProfileTab } from "@/components/portal/PortalProfileTab";

interface Booking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  status: string;
  total_amount: number;
  address: string | null;
  service: { name: string } | null;
}

interface BookingRequest {
  id: string;
  requested_date: string;
  status: string;
  notes: string | null;
  admin_response_note: string | null;
  created_at: string;
  service_name: string | null;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function PortalDashboardPage() {
  const navigate = useNavigate();
  const { user, customer, loyalty, signOut, loading } = useClientPortal();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/portal", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoadingData(true);

      // Fetch bookings using the secure RPC function
      const { data: bookingsData } = await supabase
        .rpc("get_client_portal_bookings", { p_customer_id: user.customer_id });

      // Transform data to match expected interface
      const transformedBookings = (bookingsData || []).map((b: any) => ({
        id: b.id,
        booking_number: b.booking_number,
        scheduled_at: b.scheduled_at,
        status: b.status,
        total_amount: b.total_amount,
        address: b.address,
        service: b.service_name ? { name: b.service_name } : null,
      }));

      setBookings(transformedBookings);

      // Fetch booking requests using secure RPC
      const { data: requestsData } = await supabase
        .rpc("get_client_portal_requests", { p_client_user_id: user.id });

      setRequests((requestsData || []) as BookingRequest[]);

      // Fetch notifications using secure RPC
      const { data: notificationsData } = await supabase
        .rpc("get_client_portal_notifications", { p_client_user_id: user.id });

      setNotifications((notificationsData || []) as Notification[]);

      setLoadingData(false);
    };

    fetchData();
  }, [user]);

  const handleSignOut = () => {
    signOut();
    navigate("/portal", { replace: true });
  };

  const markNotificationRead = async (id: string) => {
    if (!user) return;

    await supabase.rpc("mark_client_notification_read", {
      p_notification_id: id,
      p_client_user_id: user.id,
    });

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const deleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    const { data } = await supabase.rpc("delete_client_portal_notification", {
      p_notification_id: id,
      p_client_user_id: user.id,
    });

    if (data) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success("Notification deleted");
    }
  };

  if (loading || !user || !customer) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const upcomingBookings = bookings.filter(
    (b) => new Date(b.scheduled_at) >= new Date() && b.status !== "cancelled"
  );
  const pastBookings = bookings.filter(
    (b) => new Date(b.scheduled_at) < new Date() || b.status === "cancelled"
  );

  // Show loyalty with default 0 points if no record exists yet
  const displayLoyalty = loyalty || { points: 0, lifetime_points: 0, tier: "bronze" };

  const getTierColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case "platinum":
        return "bg-purple-500";
      case "gold":
        return "bg-yellow-500";
      case "silver":
        return "bg-gray-400";
      default:
        return "bg-amber-700";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "approved":
        return <Badge variant="default" className="bg-primary">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "confirmed":
        return <Badge variant="default">Confirmed</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-primary">Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Seo
        title="My Dashboard | Client Portal"
        description="View your bookings, loyalty status, and manage appointments."
        canonicalPath="/portal/dashboard"
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">
              Welcome, {customer.first_name}!
            </h1>
            <p className="text-sm text-muted-foreground">Client Portal</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => {}}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-xs text-destructive-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Loyalty Card - Always show, with 0 points default */}
        <Card className="overflow-hidden">
          <div className={`h-2 ${getTierColor(displayLoyalty.tier)}`} />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg capitalize">
                  {displayLoyalty.tier} Member
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-lg px-3 py-1">
                {displayLoyalty.points} pts
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Lifetime points: {displayLoyalty.lifetime_points}
            </p>
          </CardContent>
        </Card>

        {/* Request Booking Button */}
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={() => navigate("/portal/request")}
        >
          <Plus className="h-5 w-5" />
          Request a Booking
        </Button>

        {/* Tabs */}
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="notifications" className="relative">
              Alerts
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="profile">
              <User className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Bookings */}
          <TabsContent value="upcoming" className="space-y-3 mt-4">
            {loadingData ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : upcomingBookings.length === 0 ? (
              <Card className="p-8 text-center">
                <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No upcoming bookings</p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => navigate("/portal/request")}
                >
                  Request a booking
                </Button>
              </Card>
            ) : (
              upcomingBookings.map((booking) => (
                <Card key={booking.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {booking.service?.name || "Service"}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(booking.scheduled_at), "MMM d, yyyy")}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {format(new Date(booking.scheduled_at), "h:mm a")}
                      </div>
                      {booking.address && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {booking.address}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      {getStatusBadge(booking.status)}
                      <p className="text-lg font-semibold mt-2">
                        ${booking.total_amount}
                      </p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Booking Requests */}
          <TabsContent value="requests" className="space-y-3 mt-4">
            {loadingData ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : requests.length === 0 ? (
              <Card className="p-8 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No booking requests yet</p>
              </Card>
            ) : (
              requests.map((request) => (
                <Card key={request.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {request.service_name || "Service Request"}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Requested: {format(new Date(request.requested_date), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                      {request.notes && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {request.notes}
                        </p>
                      )}
                      {request.admin_response_note && (
                        <p className="text-sm text-primary mt-1">
                          Response: {request.admin_response_note}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getStatusBadge(request.status)}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(request.created_at), "MMM d")}
                      </span>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="space-y-3 mt-4">
            {loadingData ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pastBookings.length === 0 ? (
              <Card className="p-8 text-center">
                <Star className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No booking history yet</p>
              </Card>
            ) : (
              pastBookings.map((booking) => (
                <Card key={booking.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {booking.service?.name || "Service"}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(booking.scheduled_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(booking.status)}
                      <p className="text-lg font-semibold mt-2">
                        ${booking.total_amount}
                      </p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="space-y-3 mt-4">
            {loadingData ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <Card className="p-8 text-center">
                <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No notifications yet</p>
              </Card>
            ) : (
              notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`p-4 cursor-pointer transition-colors ${
                    !notification.is_read ? "bg-primary/5 border-primary/20" : ""
                  }`}
                  onClick={() => markNotificationRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    {notification.type === "approved" ? (
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    ) : notification.type === "rejected" ? (
                      <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                    ) : (
                      <Bell className="h-5 w-5 text-primary mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{notification.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(notification.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!notification.is_read && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                      <button
                        onClick={(e) => deleteNotification(notification.id, e)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label="Delete notification"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <PortalProfileTab />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <PortalSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
