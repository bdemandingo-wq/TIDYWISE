import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, isPast, isFuture, isToday, isTomorrow } from "date-fns";
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
  Trash2,
  X,
  RotateCcw,
  CalendarClock,
  ChevronRight
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Seo } from "@/components/Seo";
import { useClientPortal } from "@/contexts/ClientPortalContext";
import { supabase } from "@/lib/supabase";
import { PortalSettingsTab } from "@/components/portal/PortalSettingsTab";
import { PortalProfileTab } from "@/components/portal/PortalProfileTab";
import { usePlatform } from "@/hooks/usePlatform";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Booking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  status: string;
  total_amount: number;
  address: string | null;
  service: { name: string } | null;
  service_id: string | null;
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
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { isNative } = usePlatform();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/portal", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoadingData(true);

      const { data: bookingsData } = await supabase
        .rpc("get_client_portal_bookings", { p_customer_id: user.customer_id });

      const transformedBookings = (bookingsData || []).map((b: any) => ({
        id: b.id,
        booking_number: b.booking_number,
        scheduled_at: b.scheduled_at,
        status: b.status,
        total_amount: b.total_amount,
        address: b.address,
        service: b.service_name ? { name: b.service_name } : null,
        service_id: b.service_id || null,
      }));

      setBookings(transformedBookings);

      const { data: requestsData } = await supabase
        .rpc("get_client_portal_requests", { p_client_user_id: user.id });

      setRequests((requestsData || []) as BookingRequest[]);

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

  const deleteRequest = async (id: string) => {
    if (!user) return;
    const { data } = await supabase.rpc("delete_client_booking_request", {
      p_request_id: id,
      p_client_user_id: user.id,
    });
    if (data) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success("Request deleted");
    }
  };

  const handleCancelClick = (booking: Booking) => {
    setBookingToCancel(booking);
    setCancelDialogOpen(true);
  };

  const confirmCancelBooking = async () => {
    if (!user || !bookingToCancel) return;
    setCancelling(true);
    try {
      const { data, error } = await supabase.rpc("client_cancel_booking" as any, {
        p_booking_id: bookingToCancel.id,
        p_customer_id: user.customer_id,
      });
      if (error) {
        toast.error("Failed to cancel booking");
        return;
      }
      const result = data as { success: boolean; error?: string; within_48_hours?: boolean } | null;
      if (!result?.success) {
        if (result?.within_48_hours) {
          toast.error(result.error || "Same day or next day cancellations may incur a fee. Please contact us directly.", { duration: 6000 });
        } else {
          toast.error(result?.error || "Unable to cancel booking");
        }
        return;
      }
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingToCancel.id ? { ...b, status: "cancelled" } : b
        )
      );
      toast.success("Booking cancelled successfully");
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setCancelling(false);
      setCancelDialogOpen(false);
      setBookingToCancel(null);
    }
  };

  const handleRebook = (booking: Booking) => {
    const params = new URLSearchParams();
    if (booking.service_id) params.set("service", booking.service_id);
    if (booking.address) params.set("notes", `Same address: ${booking.address}`);
    navigate(`/portal/request?${params.toString()}`);
  };

  const handleReschedule = (booking: Booking) => {
    const params = new URLSearchParams();
    if (booking.service_id) params.set("service", booking.service_id);
    params.set("notes", `Reschedule of booking #${booking.booking_number}${booking.address ? ` at ${booking.address}` : ""}`);
    params.set("reschedule", "true");
    navigate(`/portal/request?${params.toString()}`);
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

  const displayLoyalty = loyalty || { points: 0, lifetime_points: 0, tier: "bronze" };

  const getTierColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case "platinum": return "bg-purple-500";
      case "gold": return "bg-yellow-500";
      case "silver": return "bg-gray-400";
      default: return "bg-amber-700";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="secondary">Pending</Badge>;
      case "approved": return <Badge variant="default" className="bg-primary">Approved</Badge>;
      case "rejected": return <Badge variant="destructive">Rejected</Badge>;
      case "confirmed": return <Badge variant="default">Confirmed</Badge>;
      case "completed": return <Badge variant="default" className="bg-primary">Completed</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEE, MMM d");
  };

  const nextBooking = upcomingBookings.length > 0
    ? upcomingBookings.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]
    : null;

  // Tier progress percentage (rough estimate for visual)
  const tierProgressMap: Record<string, number> = { bronze: 25, silver: 50, gold: 75, platinum: 100 };
  const tierProgress = tierProgressMap[displayLoyalty.tier?.toLowerCase()] ?? 25;

  // ─── NATIVE PORTAL LAYOUT ───
  if (isNative) {
    return (
      <main className="min-h-screen bg-background">
        <Seo
          title="My Dashboard | Client Portal"
          description="View your bookings, loyalty status, and manage appointments."
          canonicalPath="/portal/dashboard"
        />

        {/* Native header */}
        <div className="px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            Hey {customer.first_name} 👋
          </h1>
          <Sheet>
            <SheetTrigger asChild>
              <button className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <Settings className="h-5 w-5 text-muted-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Settings</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-6">
                <PortalProfileTab />
                <PortalSettingsTab />
                <Button variant="outline" className="w-full gap-2 h-12 rounded-xl" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="px-4 pb-28 space-y-4">
          {/* Loyalty card */}
          <Card className="rounded-2xl overflow-hidden shadow-sm">
            <div className={`h-1.5 ${getTierColor(displayLoyalty.tier)}`} />
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <span className="font-semibold capitalize">{displayLoyalty.tier} Member</span>
                </div>
                <Badge variant="outline" className="text-sm px-2.5 py-0.5">
                  {displayLoyalty.points} pts
                </Badge>
              </div>
              <Progress value={tierProgress} className="h-2" />
            </CardContent>
          </Card>

          {/* Upcoming booking card */}
          {nextBooking ? (
            <Card className="rounded-2xl overflow-hidden border-primary/20 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Next Appointment</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-lg">{nextBooking.service?.name || "Service"}</p>
                    {getStatusBadge(nextBooking.status)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{getDateLabel(nextBooking.scheduled_at)}</span>
                    <span>at {format(new Date(nextBooking.scheduled_at), "h:mm a")}</span>
                  </div>
                  {nextBooking.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {nextBooking.address}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1 gap-1 h-12 rounded-xl text-base"
                      onClick={() => handleReschedule(nextBooking)}
                    >
                      <CalendarClock className="h-4 w-4" />
                      Manage
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl p-6 text-center shadow-sm">
              <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No upcoming bookings</p>
            </Card>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="rounded-2xl h-14 text-base font-semibold gap-2"
              onClick={() => navigate("/portal/request")}
            >
              <Plus className="h-5 w-5" />
              Book Again
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl h-14 text-base font-semibold gap-2"
              onClick={() => {/* scroll to past bookings below */}}
            >
              <CalendarDays className="h-5 w-5" />
              All Bookings
            </Button>
          </div>

          {/* Past bookings */}
          {pastBookings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Past Bookings</h2>
              {pastBookings.map((booking) => (
                <Card key={booking.id} className="rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{booking.service?.name || "Service"}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(booking.scheduled_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      {getStatusBadge(booking.status)}
                      <p className="text-lg font-semibold">${booking.total_amount}</p>
                      {booking.status === "completed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1 h-8 rounded-lg"
                          onClick={() => handleRebook(booking)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Rebook
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Cancel Booking Dialog */}
        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
              <AlertDialogDescription>
                {bookingToCancel && (
                  <>
                    Are you sure you want to cancel your{" "}
                    <strong>{bookingToCancel.service?.name || "cleaning"}</strong> scheduled for{" "}
                    <strong>{format(new Date(bookingToCancel.scheduled_at), "MMM d, yyyy 'at' h:mm a")}</strong>?
                    <br /><br />
                    <span className="text-muted-foreground text-sm">
                      Note: Same day or next day cancellations (within 48 hours) may incur a fee unless you are a Platinum member.
                    </span>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>Keep Booking</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmCancelBooking}
                disabled={cancelling}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  "Yes, Cancel"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    );
  }

  // ─── WEB / DESKTOP LAYOUT (unchanged) ───
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
            <Button variant="ghost" size="icon" className="relative" onClick={() => {}}>
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
        {/* Next Booking Hero Card */}
        {nextBooking && (
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Next Appointment</p>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-semibold text-lg">{nextBooking.service?.name || "Service"}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{getDateLabel(nextBooking.scheduled_at)}</span>
                    <span>at {format(new Date(nextBooking.scheduled_at), "h:mm a")}</span>
                  </div>
                  {nextBooking.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {nextBooking.address}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={() => handleReschedule(nextBooking)}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Reschedule
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loyalty + Request Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="overflow-hidden">
            <div className={`h-1.5 ${getTierColor(displayLoyalty.tier)}`} />
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <span className="font-semibold capitalize">{displayLoyalty.tier}</span>
                </div>
                <Badge variant="outline" className="text-sm px-2.5 py-0.5">
                  {displayLoyalty.points} pts
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2 h-auto py-4"
            size="lg"
            onClick={() => navigate("/portal/request")}
          >
            <Plus className="h-5 w-5" />
            Request a Booking
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="w-full overflow-x-auto flex justify-start gap-1 h-auto p-1">
            <TabsTrigger value="upcoming" className="text-xs sm:text-sm shrink-0">Upcoming</TabsTrigger>
            <TabsTrigger value="requests" className="text-xs sm:text-sm shrink-0">Requests</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm shrink-0">History</TabsTrigger>
            <TabsTrigger value="notifications" className="relative text-xs sm:text-sm shrink-0">
              Alerts
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="profile" className="text-xs sm:text-sm shrink-0">
              <User className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm shrink-0">
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
                <Button variant="link" className="mt-2" onClick={() => navigate("/portal/request")}>
                  Request a booking
                </Button>
              </Card>
            ) : (
              upcomingBookings.map((booking) => (
                <Card key={booking.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{booking.service?.name || "Service"}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {getDateLabel(booking.scheduled_at)}
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
                    <div className="text-right flex flex-col items-end gap-2">
                      {getStatusBadge(booking.status)}
                      <p className="text-lg font-semibold">${booking.total_amount}</p>
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1 h-7"
                          onClick={() => handleReschedule(booking)}
                        >
                          <CalendarClock className="h-3 w-3" />
                          Reschedule
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7"
                          onClick={() => handleCancelClick(booking)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
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
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="font-medium">{request.service_name || "Service Request"}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Requested: {format(new Date(request.requested_date), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                      {request.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{request.notes}</p>
                      )}
                      {request.admin_response_note && (
                        <p className="text-sm text-primary mt-1">Response: {request.admin_response_note}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(request.status)}
                        <button
                          onClick={() => deleteRequest(request.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="Delete request"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
                      <p className="font-medium">{booking.service?.name || "Service"}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(booking.scheduled_at), "MMM d, yyyy")}
                      </div>
                      {booking.address && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {booking.address}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      {getStatusBadge(booking.status)}
                      <p className="text-lg font-semibold">${booking.total_amount}</p>
                      {booking.status === "completed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1 h-7"
                          onClick={() => handleRebook(booking)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Rebook
                        </Button>
                      )}
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
                      <p className="text-sm text-muted-foreground">{notification.message}</p>
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

      {/* Cancel Booking Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {bookingToCancel && (
                <>
                  Are you sure you want to cancel your{" "}
                  <strong>{bookingToCancel.service?.name || "cleaning"}</strong> scheduled for{" "}
                  <strong>{format(new Date(bookingToCancel.scheduled_at), "MMM d, yyyy 'at' h:mm a")}</strong>?
                  <br /><br />
                  <span className="text-muted-foreground text-sm">
                    Note: Same day or next day cancellations (within 48 hours) may incur a fee unless you are a Platinum member.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelBooking}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Yes, Cancel"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
