import { useEffect, useRef, useState } from "react";
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
  ChevronRight,
  AlertTriangle,
  Package,
  BarChart2,
  ImageIcon,
  Send,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { SEOHead } from '@/components/SEOHead';
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

interface InspectionReport {
  id: string;
  photo_url: string;
  inspection_note: string | null;
  issue_category: 'broken' | 'missing' | 'low_inventory' | 'general' | null;
  created_at: string | null;
  booking: {
    booking_number: number;
    scheduled_at: string;
  } | null;
}

const INSPECTION_CATEGORY_CONFIG = {
  broken: { label: 'Broken', icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
  missing: { label: 'Missing', icon: Package, color: 'bg-orange-100 text-orange-700' },
  low_inventory: { label: 'Low Inventory', icon: BarChart2, color: 'bg-yellow-100 text-yellow-700' },
  general: { label: 'General Note', icon: ImageIcon, color: 'bg-blue-100 text-blue-700' },
} as const;

function LoyaltyRedeemButton({ customerId, organizationId, points, onRedeemed }: {
  customerId: string; organizationId: string; points: number; onRedeemed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [redeemed, setRedeemed] = useState(false);

  const handleRedeem = async () => {
    if (!customerId || !organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('redeem-loyalty-points', {
        body: { customerId, organizationId, pointsToRedeem: 100 },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`$${data.creditAmount.toFixed(2)} credit added to your account!`);
      setRedeemed(true);
      onRedeemed();
    } catch (e: any) {
      toast.error(e.message || 'Redemption failed');
    } finally {
      setLoading(false);
    }
  };

  if (redeemed) return <p className="text-xs text-emerald-600 font-medium text-center">Credit applied to your account!</p>;

  return (
    <button
      onClick={handleRedeem}
      disabled={loading}
      className="w-full text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5 fill-current" />}
      Redeem 100 pts for $10 credit
    </button>
  );
}

function InspectionPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const fetchUrl = () => {
    setError(false);
    supabase.storage.from('booking-photos').createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  };

  useEffect(() => { fetchUrl(); }, [path]);

  if (error) return (
    <div className="w-full h-40 bg-muted rounded-lg flex flex-col items-center justify-center gap-2">
      <ImageIcon className="w-6 h-6 text-muted-foreground" />
      <button onClick={fetchUrl} className="text-xs text-primary underline">Reload</button>
    </div>
  );
  if (!url) return <div className="w-full h-40 bg-muted rounded-lg flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  return <img src={url} alt="Inspection" className="w-full h-40 object-cover rounded-lg" onError={fetchUrl} />;
}

export default function PortalDashboardPage() {
  const navigate = useNavigate();
  const { user, customer, loyalty, signOut, loading, refreshData } = useClientPortal();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [inspectionReports, setInspectionReports] = useState<InspectionReport[]>([]);
  const [referrals, setReferrals] = useState<{id:string;referred_email:string;status:string;credit_amount:number;credit_awarded:boolean;created_at:string}[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { isNative } = usePlatform();
  const pastBookingsRef = useRef<HTMLDivElement | null>(null);

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

      // Fetch inspection reports for this customer's bookings
      const bookingIds = (bookingsData || []).map((b: any) => b.id);
      if (bookingIds.length > 0) {
        const { data: inspectionData } = await supabase
          .from('booking_photos')
          .select(`
            id, photo_url, inspection_note, issue_category, created_at,
            booking:bookings!booking_photos_booking_id_fkey(booking_number, scheduled_at)
          `)
          .in('booking_id', bookingIds)
          .eq('photo_type', 'inspection')
          .order('created_at', { ascending: false });

        setInspectionReports((inspectionData || []) as InspectionReport[]);
      }

      // Fetch referrals and the customer's personal referral code
      if (user.customer_id) {
        // Read the referral code directly from the customers table (set by migration 20260413150000).
        // This means every customer has a code even before they've referred anyone.
        const { data: customerCodeData } = await supabase
          .from('customers')
          .select('referral_code' as any)
          .eq('id', user.customer_id)
          .single();
        if ((customerCodeData as any)?.referral_code) {
          setReferralCode((customerCodeData as any).referral_code);
        }

        const { data: referralData } = await supabase
          .from('referrals')
          .select('id, referred_email, status, credit_amount, credit_awarded, created_at, referral_code')
          .eq('referrer_customer_id', user.customer_id)
          .order('created_at', { ascending: false });

        if (referralData?.length) {
          setReferrals(referralData);
        }
      }

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
    // Mark as read first so the unread count is correct regardless of DB delete outcome
    await supabase.rpc("mark_client_notification_read", {
      p_notification_id: id,
      p_client_user_id: user.id,
    });
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

  const sendInvite = async () => {
    if (!user || !inviteEmail.trim()) return;
    setSendingInvite(true);
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'create_client_portal_referral' as any,
        {
          p_portal_user_id: user.id,
          p_referred_email: inviteEmail.trim(),
          p_referred_name: inviteName.trim() || null,
        }
      );
      if (rpcError) throw new Error(rpcError.message);
      const result = rpcResult as { error?: string; referral_id?: string };
      if (result?.error) throw new Error(result.error);

      // Send the invite email via edge function
      const { error: fnError } = await supabase.functions.invoke('send-referral-invite', {
        body: { referralId: result.referral_id },
      });
      if (fnError) throw new Error(fnError.message);

      toast.success(`Invite sent to ${inviteEmail}!`);
      setInviteEmail('');
      setInviteName('');

      // Refresh the referrals list
      if (user.customer_id) {
        const { data: referralData } = await supabase
          .from('referrals')
          .select('id, referred_email, status, credit_amount, credit_awarded, created_at')
          .eq('referrer_customer_id', user.customer_id)
          .order('created_at', { ascending: false });
        if (referralData) setReferrals(referralData);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSendingInvite(false);
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
        <SEOHead
          title="My Dashboard | Client Portal"
          description="View your bookings, loyalty status, and manage appointments."
          canonical="/portal/dashboard"
        />

        {/* Native header */}
        <div className="px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">
            Hey {customer.first_name} 👋
          </h1>
          <Sheet>
            <SheetTrigger asChild>
              <button className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Settings</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-6">
                <PortalProfileTab />
                <PortalSettingsTab />
                <Button variant="outline" className="w-full gap-2 h-11 rounded-xl text-sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="px-4 pb-28 space-y-3">
          {/* Loyalty card */}
          <Card className="rounded-2xl overflow-hidden shadow-none border-border/40">
            <div className={`h-1 ${getTierColor(displayLoyalty.tier)}`} />
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold capitalize">{displayLoyalty.tier} Member</span>
                </div>
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  {displayLoyalty.points} pts
                </Badge>
              </div>
              <Progress value={tierProgress} className="h-2" />
            </CardContent>
          </Card>

          {/* Upcoming booking card */}
          {nextBooking ? (
            <Card className="rounded-2xl overflow-hidden shadow-none border-border/40">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Next Appointment</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{nextBooking.service?.name || "Service"}</p>
                    {getStatusBadge(nextBooking.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{getDateLabel(nextBooking.scheduled_at)}</span>
                    <span>at {format(new Date(nextBooking.scheduled_at), "h:mm a")}</span>
                  </div>
                  {nextBooking.address && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {nextBooking.address}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1 gap-1 h-11 rounded-xl text-sm font-semibold"
                      onClick={() => handleReschedule(nextBooking)}
                    >
                      <CalendarClock className="h-4 w-4" />
                      Manage
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-1 h-11 rounded-xl text-sm font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleCancelClick(nextBooking)}
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl text-center shadow-none border-border/40 py-12">
              <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No upcoming bookings</p>
            </Card>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="rounded-xl h-11 text-sm font-semibold gap-2"
              onClick={() => navigate("/portal/request")}
            >
              <Plus className="h-4 w-4" />
              Book Again
            </Button>
            <Button
              variant="outline"
              className="rounded-xl h-11 text-sm font-semibold gap-2 border-border"
              onClick={() => pastBookingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <CalendarDays className="h-4 w-4" />
              All Bookings
            </Button>
          </div>

          {/* Past bookings */}
          {pastBookings.length > 0 && (
            <div ref={pastBookingsRef} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Past Bookings</h2>
              {pastBookings.map((booking) => (
                <Card key={booking.id} className="rounded-2xl p-4 shadow-none border-border/40">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{booking.service?.name || "Service"}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(booking.scheduled_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      {getStatusBadge(booking.status)}
                      <p className="text-sm font-semibold">${booking.total_amount}</p>
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
      <SEOHead
        title="My Dashboard | Client Portal"
        description="View your bookings, loyalty status, and manage appointments."
        canonical="/portal/dashboard"
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
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-xs text-destructive-foreground flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Notifications</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-3">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No notifications yet</p>
                  ) : (
                    notifications.map((notification) => (
                      <Card
                        key={notification.id}
                        className={`p-3 cursor-pointer transition-colors ${!notification.is_read ? "bg-primary/5 border-primary/20" : ""}`}
                        onClick={() => markNotificationRead(notification.id)}
                      >
                        <div className="flex items-start gap-3">
                          {notification.type === "approved" ? (
                            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                          ) : notification.type === "rejected" ? (
                            <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                          ) : (
                            <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{notification.title}</p>
                            <p className="text-xs text-muted-foreground">{notification.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(notification.created_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                          {!notification.is_read && (
                            <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                          )}
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </SheetContent>
            </Sheet>
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
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs min-h-[44px] min-w-[44px]"
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
              {displayLoyalty.points >= 100 && (
                <div className="mt-3 pt-3 border-t">
                  <LoyaltyRedeemButton
                    customerId={user?.customer_id || ''}
                    organizationId={user?.organization_id || ''}
                    points={displayLoyalty.points}
                    onRedeemed={refreshData}
                  />
                </div>
              )}
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
          <TabsList className="w-full overflow-x-auto flex justify-start gap-1 h-auto p-1 no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
            <TabsTrigger value="upcoming" className="text-xs sm:text-sm shrink-0 min-h-[44px]">Upcoming</TabsTrigger>
            <TabsTrigger value="requests" className="text-xs sm:text-sm shrink-0 min-h-[44px]">Requests</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm shrink-0 min-h-[44px]">History</TabsTrigger>
            <TabsTrigger value="notifications" className="relative text-xs sm:text-sm shrink-0 min-h-[44px]">
              Alerts
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs sm:text-sm shrink-0 min-h-[44px]">Referrals</TabsTrigger>
            <TabsTrigger value="reports" className="relative text-xs sm:text-sm shrink-0 min-h-[44px]">
              Reports
              {inspectionReports.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-orange-500 text-[10px] text-white flex items-center justify-center">
                  {inspectionReports.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="profile" className="text-xs sm:text-sm shrink-0 min-h-[44px]">
              <User className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm shrink-0 min-h-[44px]">
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
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <p className="font-medium">{booking.service?.name || "Service"}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 shrink-0" />
                        {getDateLabel(booking.scheduled_at)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4 shrink-0" />
                        {format(new Date(booking.scheduled_at), "h:mm a")}
                      </div>
                      {booking.address && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{booking.address}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(booking.status)}
                        <p className="text-lg font-semibold">${booking.total_amount}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1 min-h-[44px] px-3"
                          onClick={() => handleReschedule(booking)}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          Reschedule
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[44px] min-w-[44px]"
                          onClick={() => handleCancelClick(booking)}
                        >
                          <X className="h-4 w-4" />
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
                          className="p-2.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                          className="text-xs gap-1 min-h-[44px] px-3"
                          onClick={() => handleRebook(booking)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
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
                        className="p-2.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
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

          {/* Referrals Tab */}
          <TabsContent value="referrals" className="space-y-4 mt-4">
            <div>
              <h2 className="font-semibold text-base mb-1">Refer a Friend</h2>
              <p className="text-sm text-muted-foreground">Earn ${referrals[0]?.credit_amount ?? 25} credit for every friend who books a cleaning.</p>
            </div>
            {referralCode ? (
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Your referral code</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-sm font-mono font-bold tracking-wider">{referralCode}</code>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(referralCode); toast.success('Copied!'); }}>Copy</Button>
                </div>
              </Card>
            ) : (
              <Card className="p-4 text-center text-sm text-muted-foreground">
                Your referral code is being set up. Please check back shortly or contact us if it doesn't appear.
              </Card>
            )}

            {/* Invite a friend form */}
            <Card className="p-4">
              <p className="text-sm font-medium mb-3">Send an email invite</p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="invite-email" className="text-xs">Friend's email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="friend@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="invite-name" className="text-xs">Friend's name (optional)</Label>
                  <Input
                    id="invite-name"
                    type="text"
                    placeholder="Jane"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={sendInvite}
                  disabled={sendingInvite || !inviteEmail.trim()}
                >
                  {sendingInvite
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />}
                  Send Invite
                </Button>
              </div>
            </Card>

            {referrals.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Your referrals ({referrals.length})</p>
                <div className="space-y-2">
                  {referrals.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                      <div>
                        <p className="font-medium">{r.referred_email}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'MMM d, yyyy')}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={r.status === 'completed' ? 'default' : 'secondary'} className="text-xs mb-1">
                          {r.status}
                        </Badge>
                        {r.credit_awarded && <p className="text-xs text-emerald-600 font-medium">${r.credit_amount} earned</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Inspection Reports Tab */}
          <TabsContent value="reports" className="space-y-3 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <h2 className="font-semibold text-base">Property Reports</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Your cleaner flagged the following items during their visit.
            </p>
            {loadingData ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : inspectionReports.length === 0 ? (
              <Card className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
                <p className="font-medium">All good!</p>
                <p className="text-sm text-muted-foreground mt-1">No property issues have been reported.</p>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {inspectionReports.map((report) => {
                  const cat = report.issue_category || 'general';
                  const config = INSPECTION_CATEGORY_CONFIG[cat as keyof typeof INSPECTION_CATEGORY_CONFIG] || INSPECTION_CATEGORY_CONFIG.general;
                  const Icon = config.icon;
                  return (
                    <Card key={report.id} className="overflow-hidden">
                      <InspectionPhoto path={report.photo_url} />
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </span>
                        </div>
                        {report.inspection_note && (
                          <p className="text-sm text-foreground">{report.inspection_note}</p>
                        )}
                        {report.booking && (
                          <p className="text-xs text-muted-foreground">
                            Booking #{report.booking.booking_number} &middot; {format(new Date(report.booking.scheduled_at), 'MMM d, yyyy')}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
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
