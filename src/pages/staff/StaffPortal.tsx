import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { WageBooking } from '@/lib/wageCalculation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { LogOut, Briefcase, CalendarCheck, Clock, DollarSign, Bell, History, Sparkles, Calendar, User, Star, FileText, PenLine, Banknote, Camera, AlertCircle, Loader2 } from 'lucide-react';
import { PayoutRequirementsBanner } from '@/components/staff/PayoutRequirementsBanner';
import { useCleanerPayoutSetupRequired } from '@/hooks/useCleanerPayoutSetupRequired';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MyJobCard } from '@/components/staff/MyJobCard';
import { AvailableJobCard } from '@/components/staff/AvailableJobCard';
import { NotificationBell } from '@/components/staff/NotificationBell';
import { OnboardingProgress } from '@/components/staff/OnboardingProgress';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Capacitor } from '@capacitor/core';
import { PullToRefreshIndicator } from '@/components/admin/PullToRefreshIndicator';
import { SEOHead } from '@/components/SEOHead';
import { StaffLocationPrompt } from '@/components/staff/StaffLocationPrompt';
import { TimeOffRequests } from '@/components/staff/TimeOffRequests';


// Lazy-load heavy tab components to speed up initial render
const CleanerAvailabilityManager = lazy(() => import('@/components/staff/CleanerAvailabilityManager').then(m => ({ default: m.CleanerAvailabilityManager })));
const CleanerEarnings = lazy(() => import('@/components/staff/CleanerEarnings').then(m => ({ default: m.CleanerEarnings })));
const CleanerProfile = lazy(() => import('@/components/staff/CleanerProfile').then(m => ({ default: m.CleanerProfile })));
const CleanerCalendar = lazy(() => import('@/components/staff/CleanerCalendar').then(m => ({ default: m.CleanerCalendar })));
const CleanerReviews = lazy(() => import('@/components/staff/CleanerReviews').then(m => ({ default: m.CleanerReviews })));
const StaffDocumentUpload = lazy(() => import('@/components/staff/StaffDocumentUpload').then(m => ({ default: m.StaffDocumentUpload })));
const StaffSignatureManager = lazy(() => import('@/components/staff/StaffSignatureManager').then(m => ({ default: m.StaffSignatureManager })));
const StaffPayoutSetup = lazy(() => import('@/components/staff/StaffPayoutSetup').then(m => ({ default: m.StaffPayoutSetup })));
const StaffPhotosTab = lazy(() => import('@/components/staff/StaffPhotosTab').then(m => ({ default: m.StaffPhotosTab })));
const JobHistoryCard = lazy(() => import('@/components/staff/JobHistoryCard').then(m => ({ default: m.JobHistoryCard })));

const TabFallback = () => (
  <div className="space-y-4 py-4">
    <div className="h-6 w-48 bg-muted animate-pulse rounded" />
    <div className="h-4 w-64 bg-muted animate-pulse rounded" />
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
      ))}
    </div>
  </div>
);

interface Booking extends WageBooking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  square_footage?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  team_pay_share?: number | null;
  notes?: string | null;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  service: {
    name: string;
  } | null;
}

interface StaffInfo {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  hourly_rate: number | null;
  base_wage: number | null;
  percentage_rate: number | null;
  tax_classification: string | null;
  default_hours: number | null;
  home_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  organization_id: string | null;
}

export default function StaffPortal() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { refreshing, pullDistance, handlers: pullHandlers } = usePullToRefresh(async () => {
    await queryClient.invalidateQueries();
  });

  // Get staff record for current user.
  //
  // A react-query query, not useState + useEffect: CleanerProfile invalidates
  // ['staff-profile'] after a save, and with the old useState that key matched
  // nothing, so the invalidation was a silent no-op. The cleaner's own screen
  // kept showing the values loaded at mount — the form looked saved while the
  // surrounding UI (e.g. "Location verified: lat, lng") stayed stale until they
  // left and re-entered the portal.
  const { data: staffInfo = null } = useQuery({
    queryKey: ['staff-profile', user?.id],
    queryFn: async (): Promise<StaffInfo | null> => {
      const { data, error } = await (supabase as any)
        .rpc('get_my_staff_profile')
        .maybeSingle();
      if (error) {
        console.error('Error fetching staff record:', error);
        toast.error('Could not find your staff profile');
        return null;
      }
      // Returns null for a user with no staff record (e.g. an owner/admin who
      // isn't also staff) — callers must keep tolerating null.
      return (data as StaffInfo | null) ?? null;
    },
    enabled: !!user,
  });

  // Availability check depends on the resolved staff id, so it hangs off the
  // query rather than living inside the fetch it used to share.
  useEffect(() => {
    if (!staffInfo?.id) return;
    let cancelled = false;
    (async () => {
      const client: any = supabase;
      const { data: hours } = await client
        .from('working_hours')
        .select('id')
        .eq('staff_id', staffInfo.id)
        .limit(1);
      if (!cancelled) setHasSetAvailability(hours && hours.length > 0);
    })();
    return () => { cancelled = true; };
  }, [staffInfo?.id]);

  // Push notifications: register this cleaner's device so job alerts can
  // ring even when the app is closed. Prompt once per install after login.
  const { isSupported: pushSupported, isRegistered: pushRegistered, requestPermission: requestPushPermission } = usePushNotifications(staffInfo?.id);
  const pushPromptedRef = useRef(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!staffInfo?.id || !pushSupported || pushRegistered || pushPromptedRef.current) return;
    pushPromptedRef.current = true;
    // Small delay so the permission prompt doesn't collide with login/location prompts
    const t = setTimeout(() => { void requestPushPermission(); }, 3000);
    return () => clearTimeout(t);
  }, [staffInfo?.id, pushSupported, pushRegistered, requestPushPermission]);
  const payoutSetupRequired = useCleanerPayoutSetupRequired(staffInfo?.organization_id);
  const [newJobAlert, setNewJobAlert] = useState(false);
  const [claimingBookingId, setClaimingBookingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [hasSetAvailability, setHasSetAvailability] = useState<boolean | null>(null);

  // Handle URL params for Stripe return
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const setupParam = searchParams.get('setup');
    const payoutParam = searchParams.get('payout');

    if (tabParam) {
      setActiveTab(tabParam);
    }
    if (payoutParam === 'success' || setupParam === 'complete') {
      setActiveTab('payouts');
      // Refresh payout status immediately
      queryClient.invalidateQueries({ queryKey: ['staff-payout-status'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-payout'] });
      toast.success('Payout setup updated! Checking status...');
      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
    if (payoutParam === 'refresh') {
      setActiveTab('payouts');
      toast.info('Please complete your payout setup to start receiving payments.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);


  // Real-time subscription for new unassigned bookings
  useEffect(() => {
    if (!staffInfo?.id) return;

    const channel = supabase
      .channel('staff-bookings-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          const newBooking = payload.new as { staff_id: string | null; status: string };
          // Only notify if booking is unassigned and upcoming
          if (!newBooking.staff_id && ['pending', 'confirmed'].includes(newBooking.status)) {
            setNewJobAlert(true);
            toast.success('New job available!', {
              description: 'A new cleaning job is waiting to be claimed.',
              duration: 5000,
              icon: <Sparkles className="w-4 h-4 text-green-500" />,
            });
            queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'unassigned'] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          const updatedBooking = payload.new as { staff_id: string | null; status: string };
          const oldBooking = payload.old as { staff_id: string | null };
          
          // Booking became unassigned
          if (oldBooking.staff_id && !updatedBooking.staff_id) {
            setNewJobAlert(true);
            toast.success('Job now available!', {
              description: 'A cleaning job was unassigned and is now open.',
              duration: 5000,
              icon: <Sparkles className="w-4 h-4 text-green-500" />,
            });
            queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'unassigned'] });
          }
          
          // Always invalidate to keep data fresh
          queryClient.invalidateQueries({ queryKey: ['staff-bookings'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffInfo?.id, queryClient]);

  // Fetch assigned bookings (including team assignments)
  const { data: assignedBookings = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ['staff-bookings', 'assigned', staffInfo?.id],
    queryFn: async () => {
      if (!staffInfo?.id) return [];

      // First get directly assigned bookings
      const { data: directBookings, error: directError } = await supabase
        .from('bookings')
        .select(`
          id, organization_id, staff_id, customer_id, booking_number, scheduled_at, duration, status, address, city, state, zip_code,
          total_amount, subtotal, discount_amount, cleaner_wage, cleaner_wage_type,
          cleaner_actual_payment, cleaner_pay_expected, cleaner_override_hours,
          cleaner_checkin_at, cleaner_checkout_at, notes,
          customer:customers(first_name, last_name, phone),
          service:services(name)
        `)
        .eq('staff_id', staffInfo.id)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .or('is_draft.is.null,is_draft.eq.false')
        .order('scheduled_at', { ascending: true });

      if (directError) throw directError;

      // Then get team assignment bookings
      const { data: teamAssignments, error: teamError } = await supabase
        .from('booking_team_assignments')
        .select(`
          pay_share,
          is_primary,
          booking:bookings(
            id, organization_id, staff_id, customer_id, booking_number, scheduled_at, duration, status, address, city, state, zip_code,
            total_amount, subtotal, discount_amount, cleaner_wage, cleaner_wage_type,
            cleaner_actual_payment, cleaner_pay_expected, cleaner_override_hours,
            cleaner_checkin_at, cleaner_checkout_at, notes,
            customer:customers(first_name, last_name, phone),
            service:services(name)
          )
        `)
        .eq('staff_id', staffInfo.id);

      if (teamError) throw teamError;

      // Process team bookings - filter to upcoming active ones and add pay_share
      const teamBookings = teamAssignments
        ?.filter(ta => {
          const booking = ta.booking as any;
          return booking && 
            ['pending', 'confirmed', 'in_progress'].includes(booking.status);
        })
        .map(ta => ({
          ...(ta.booking as any),
          team_pay_share: ta.pay_share,
        })) || [];

      // Merge and deduplicate (prefer team booking with pay_share if exists)
      const bookingMap = new Map<string, Booking>();
      
      for (const b of directBookings || []) {
        bookingMap.set(b.id, b as Booking);
      }
      
      for (const b of teamBookings) {
        // Team assignment overrides or adds
        bookingMap.set(b.id, b as Booking);
      }

      const allBookings = Array.from(bookingMap.values()).sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );

      // Fetch team members for all bookings
      const bookingIds = allBookings.map(b => b.id);
      if (bookingIds.length > 0) {
        const { data: allTeamMembers } = await supabase
          .from('booking_team_assignments')
          .select('booking_id, staff:staff(id, name)')
          .in('booking_id', bookingIds);

        // Also get primary staff names for bookings
        const staffIds = [...new Set(allBookings.map(b => (b as any).staff_id).filter(Boolean))];
        const { data: primaryStaffData } = staffIds.length > 0
          ? await supabase.from('staff').select('id, name').in('id', staffIds)
          : { data: [] as { id: string; name: string }[] };

        const primaryStaffMap = new Map((primaryStaffData || []).map(s => [s.id, s.name]));

        for (const booking of allBookings) {
          const members = (allTeamMembers || [])
            .filter(tm => tm.booking_id === booking.id)
            .map(tm => (tm.staff as any)?.name)
            .filter(Boolean);
          
          const primaryName = primaryStaffMap.get((booking as any).staff_id);
          if (primaryName && !members.includes(primaryName)) {
            members.unshift(primaryName);
          }

          (booking as any).team_members = members.length > 1 ? members : [];
        }
      }

      return allBookings;
    },
    enabled: !!staffInfo?.id,
  });

  // Batched per-card data for the My Jobs tab. Each MyJobCard used to fire its
  // own business_settings / booking_photos / property_notes / booking_reminder_log
  // queries on mount — an N+1 that scaled with the number of assigned jobs.
  // Fetch them once here (one settings read + three in-list batches) and pass
  // the results down as props.
  const assignedIds = assignedBookings.map((b) => b.id);
  const assignedCustomerIds = [
    ...new Set(assignedBookings.map((b) => (b as any).customer_id).filter(Boolean)),
  ] as string[];
  const { data: cardData } = useQuery({
    queryKey: ['staff-myjob-carddata', staffInfo?.id, assignedIds.join(',')],
    enabled: !!staffInfo?.id && !!staffInfo?.organization_id && assignedIds.length > 0,
    queryFn: async () => {
      const orgId = staffInfo!.organization_id;
      const [bizRes, photoRes, notesRes, reminderRes] = await Promise.all([
        supabase.from('business_settings' as any).select('require_clockout_photos, min_clockout_photos').eq('organization_id', orgId).maybeSingle(),
        supabase.from('booking_photos').select('booking_id').in('booking_id', assignedIds),
        assignedCustomerIds.length
          ? supabase.from('property_notes' as any).select('customer_id, notes, access_instructions, gate_code, alarm_code, has_pets, pet_notes, parking_notes').eq('organization_id', orgId).in('customer_id', assignedCustomerIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('booking_reminder_log').select('booking_id').in('booking_id', assignedIds).eq('reminder_type', `on_the_way:${staffInfo!.id}`),
      ]);
      const photoCountByBooking: Record<string, number> = {};
      for (const row of ((photoRes as any).data as any[]) || []) {
        photoCountByBooking[row.booking_id] = (photoCountByBooking[row.booking_id] ?? 0) + 1;
      }
      const propertyNoteByCustomer: Record<string, any> = {};
      for (const row of ((notesRes as any).data as any[]) || []) {
        propertyNoteByCustomer[row.customer_id] = row;
      }
      const onTheWaySent = new Set<string>(
        (((reminderRes as any).data as any[]) || []).map((r) => r.booking_id),
      );
      return {
        photoReqs: {
          required: ((bizRes as any).data as any)?.require_clockout_photos ?? true,
          min: ((bizRes as any).data as any)?.min_clockout_photos ?? 2,
        },
        photoCountByBooking,
        propertyNoteByCustomer,
        onTheWaySent,
      };
    },
  });
  const cardPhotoReqs = cardData?.photoReqs ?? { required: true, min: 2 };

  // Fetch unassigned bookings - scoped to staff's organization
  const { data: unassignedBookings = [], isLoading: loadingUnassigned } = useQuery({
    queryKey: ['staff-bookings', 'unassigned', staffInfo?.organization_id],
    queryFn: async () => {
      if (!staffInfo?.organization_id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state, zip_code,
          total_amount, subtotal, discount_amount, cleaner_wage, cleaner_wage_type,
          cleaner_actual_payment, cleaner_pay_expected, cleaner_override_hours,
          cleaner_checkin_at, cleaner_checkout_at,
          square_footage, bedrooms, bathrooms, notes,
          customer:customers(first_name, last_name, phone),
          service:services(name)
        `)
        .eq('organization_id', staffInfo.organization_id)
        .is('staff_id', null)
        .in('status', ['pending', 'confirmed'])
        .or('is_draft.is.null,is_draft.eq.false')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      setNewJobAlert(false);
      return data as Booking[];
    },
    enabled: !!staffInfo?.id && !!staffInfo?.organization_id,
  });

  const currentTab = activeTab || (hasSetAvailability === false ? 'availability' : 'my-jobs');

  // Fetch job history (completed, cancelled, no_show) - only when history tab is active
  const { data: jobHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['staff-bookings', 'history', staffInfo?.id],
    queryFn: async () => {
      if (!staffInfo?.id) return [];

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state, zip_code,
          total_amount, subtotal, discount_amount, cleaner_wage, cleaner_wage_type,
          cleaner_actual_payment, cleaner_pay_expected, cleaner_override_hours,
          cleaner_checkin_at, cleaner_checkout_at,
          customer:customers(first_name, last_name),
          service:services(name)
        `)
        .eq('staff_id', staffInfo.id)
        .in('status', ['completed', 'cancelled', 'no_show'])
        .order('scheduled_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!staffInfo?.id && currentTab === 'history',
  });

  // Self-assign mutation
  const assignToSelf = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!staffInfo?.id) throw new Error('Staff ID not found');
      if (!hasSetAvailability) {
        throw new Error('Set your working hours before claiming jobs');
      }
      setClaimingBookingId(bookingId);

      const { data, error } = await supabase
        .from('bookings')
        .update({ staff_id: staffInfo.id })
        .eq('id', bookingId)
        .is('staff_id', null) // Only claim if still unassigned
        .select(`
          booking_number,
          scheduled_at,
          service:services(name),
          customer:customers(first_name, last_name)
        `);

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Job was already claimed by someone else');
      }
      return data[0];
    },
    onSuccess: (data) => {
      setClaimingBookingId(null);
      // Invalidate both assigned and unassigned queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'assigned'] });
      queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'unassigned'] });
      
      const serviceName = (data.service as { name: string } | null)?.name || 'Job';
      const customer = data.customer as { first_name: string; last_name: string } | null;
      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : '';
      const scheduledDate = data.scheduled_at ? format(new Date(data.scheduled_at), 'EEE, MMM d') : '';
      
      toast.success(`Job #${data.booking_number} Claimed!`, {
        description: `${serviceName}${customerName ? ` for ${customerName}` : ''}${scheduledDate ? ` on ${scheduledDate}` : ''}`,
        duration: 5000,
      });
    },
    onError: (error: Error) => {
      setClaimingBookingId(null);
      if (error.message === 'Job was already claimed by someone else') {
        toast.error('This job was already claimed by another cleaner');
        queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'unassigned'] });
      } else {
        toast.error('Failed to claim job');
      }
      console.error(error);
    },
  });

  // ── Photo stage nudge ────────────────────────────────────────────────────
  // Fires AFTER completion, never before. The completion write (checkout,
  // actual_hours_worked, hours_basis, cleaner_pay_expected, hours_capped_at)
  // all happens inside mutationFn and is awaited, so onSuccess only runs once
  // it has landed. That ordering is deliberate: a prompt that gated the write
  // would lose the hours if the cleaner dismissed the app mid-prompt. This is
  // a correction, structurally incapable of delaying or partially applying it.
  const [photoNudge, setPhotoNudge] = useState<{
    bookingId: string;
    photos: { id: string; created_at: string | null }[];
    currentType: 'before' | 'after';
    moveCount: number;
  } | null>(null);
  const [applyingNudge, setApplyingNudge] = useState(false);

  /** Photos are ordered oldest-first. Proposes how many trailing photos belong
   *  to the other stage: the largest inter-photo gap when one is big enough to
   *  be the cleaning itself, otherwise the midpoint. The midpoint fallback
   *  carries the common case — cleaners who upload everything in one batch at
   *  the end have no meaningful timestamp spread. */
  const proposeSplit = (photos: { created_at: string | null }[]): number => {
    const MEANINGFUL_GAP_MS = 20 * 60 * 1000;
    const times = photos.map((p) => (p.created_at ? new Date(p.created_at).getTime() : NaN));
    let bestIdx = -1;
    let bestGap = 0;
    for (let i = 1; i < times.length; i++) {
      if (!Number.isFinite(times[i]) || !Number.isFinite(times[i - 1])) continue;
      const gap = times[i] - times[i - 1];
      if (gap > bestGap) { bestGap = gap; bestIdx = i; }
    }
    if (bestIdx > 0 && bestGap >= MEANINGFUL_GAP_MS) return photos.length - bestIdx;
    return Math.floor(photos.length / 2);
  };

  const maybePromptPhotoStages = async (bookingId: string) => {
    try {
      const { data, error } = await supabase
        .from('booking_photos')
        .select('id, photo_type, created_at')
        .eq('booking_id', bookingId)
        .in('photo_type', ['before', 'after'])
        .order('created_at', { ascending: true });
      // A failed lookup must never surface on a job that completed fine.
      if (error || !data) return;

      const rows = data as { id: string; photo_type: string | null; created_at: string | null }[];
      if (rows.length < 2) return;                       // nothing ambiguous
      const types = new Set(rows.map((r) => r.photo_type));
      if (types.size !== 1) return;                      // already in both columns

      const currentType = rows[0].photo_type as 'before' | 'after';
      const photos = rows.map((r) => ({ id: r.id, created_at: r.created_at }));
      setPhotoNudge({ bookingId, photos, currentType, moveCount: proposeSplit(photos) });
    } catch {
      // Same rule — swallow. The job is already complete.
    }
  };

  const applyPhotoNudge = async () => {
    if (!photoNudge) return;
    const target = photoNudge.currentType === 'before' ? 'after' : 'before';
    const ids = photoNudge.photos.slice(photoNudge.photos.length - photoNudge.moveCount).map((p) => p.id);
    if (ids.length === 0) { setPhotoNudge(null); return; }
    setApplyingNudge(true);
    try {
      const { error } = await supabase
        .from('booking_photos')
        .update({ photo_type: target })
        .in('id', ids);
      if (error) throw error;
      toast.success(`Moved ${ids.length} to ${target}`);
      setPhotoNudge(null);
    } catch (err) {
      console.error(err);
      toast.error('Could not move those photos');
    } finally {
      setApplyingNudge(false);
    }
  };

  // Update booking status mutation with timesheet tracking
  const updateStatus = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' }) => {
      const now = new Date().toISOString();
      
      // Build the update object based on status
      let updateData: Record<string, unknown> = { status };
      
      // TIMESHEET: When starting a job, record check-in time
      if (status === 'in_progress') {
        updateData.cleaner_checkin_at = now;
      }
      
      // TIMESHEET: When completing a job, record check-out time and calculate pay
      if (status === 'completed') {
        updateData.cleaner_checkout_at = now;
        
        // Get booking details to calculate actual payment
        const { data: bookingData } = await supabase
          .from('bookings')
          .select(`
            id, organization_id, cleaner_checkin_at, cleaner_wage, cleaner_wage_type, 
            total_amount, duration, staff_id, service_id,
            customer:customers(id, email, first_name, last_name),
            service:services(name, duration)
          `)
          .eq('id', bookingId)
          .single();

        // Wage rates for this staff member fetched via a security-definer RPC
        // so non-admin members can't read peers' pay through a join.
        const { data: wageRow } = await (supabase as any)
          .rpc('get_my_wage_rates_for_booking', { _booking_id: bookingId })
          .maybeSingle();

        if (bookingData) {
          // ── Hours, not a pay decision ────────────────────────────────────
          // This used to compute a payment and write cleaner_actual_payment,
          // which cleaner_pay_expected shadows at priority 1 in BOTH engines
          // (wageCalculation.ts and payroll-period-process.ts). That write
          // never reached a payout — the app told the cleaner one number and
          // payroll paid another. It now persists hours and reconciles
          // cleaner_pay_expected, which payroll actually reads.
          const scheduledHours = Number(bookingData.duration || 0) / 60;

          // bookings.duration is BookingStepper's `selectedService?.duration
          // || 60`. Both duration columns are NOT NULL, so that default only
          // fires when there is no service (re-cleans write service_id: null)
          // or the service's duration is 0. In those cases no overage ratio
          // against scheduled means anything — a real 3h re-clean would read
          // as 200% over.
          const svc = bookingData.service as { duration?: number | null } | null;
          const durationIsTrustworthy =
            !!bookingData.service_id && Number(svc?.duration ?? 0) > 0;

          let actualHours: number | null = null;
          let hoursBasis: 'clock' | 'unknown' | 'absent' = 'absent';

          if (bookingData.cleaner_checkin_at) {
            const checkinTime = new Date(bookingData.cleaner_checkin_at).getTime();
            const checkoutTime = new Date(now).getTime();
            // Same guard as wageCalculation.ts:89 — reject unparseable dates
            // and reversed pairs. Without it a check-in that was never closed
            // out computes as days and pays them.
            if (
              Number.isFinite(checkinTime) &&
              Number.isFinite(checkoutTime) &&
              checkoutTime > checkinTime
            ) {
              actualHours = (checkoutTime - checkinTime) / (1000 * 60 * 60);
              hoursBasis = durationIsTrustworthy ? 'clock' : 'unknown';
            } else {
              console.warn(
                `[StaffPortal] Invalid check-in/out pair for booking ${bookingId} ` +
                `(checkin=${bookingData.cleaner_checkin_at}). Falling back to scheduled hours.`
              );
            }
          }

          updateData.actual_hours_worked = actualHours;
          updateData.hours_basis = hoursBasis;

          // ── Reconcile pay — hourly only ──────────────────────────────────
          // Percentage and flat do not vary with hours by design, so capping
          // them by hours would be wrong. An absent wage type counts as
          // hourly, matching getActualHours.
          const wageType = (bookingData.cleaner_wage_type || 'hourly').toLowerCase();
          const staff = wageRow as { hourly_rate: number | null; percentage_rate: number | null; base_wage: number | null } | null;
          const hourlyRate = Number(
            bookingData.cleaner_wage ?? staff?.base_wage ?? staff?.hourly_rate ?? 0
          );

          if (actualHours !== null && wageType === 'hourly' && hourlyRate > 0) {
            // Thresholds are operator-tunable. Defaults match the migration so
            // this still behaves correctly if it ships before the columns do.
            const { data: payrollSettings } = await supabase
              .from('payroll_settings')
              .select('hours_overage_cap_ratio, hours_absolute_ceiling')
              .eq('organization_id', bookingData.organization_id)
              .maybeSingle();
            const capRatio = Number((payrollSettings as any)?.hours_overage_cap_ratio ?? 1.25);
            const ceiling = Number((payrollSettings as any)?.hours_absolute_ceiling ?? 12);

            // The ceiling applies even inside the 'clock' branch: scheduled x
            // 1.25 on a 10h job would otherwise allow 12.5h. It is the safety
            // net against clock data that is wrong rather than long.
            const payableHours = hoursBasis === 'clock'
              ? Math.min(actualHours, scheduledHours * capRatio, ceiling)
              : Math.min(actualHours, ceiling);

            updateData.cleaner_pay_expected = Math.round(hourlyRate * payableHours * 100) / 100;
            updateData.hours_capped_at =
              payableHours < actualHours ? Math.round(payableHours * 1000) / 1000 : null;
          }
        }
      }
      
      const { error } = await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', bookingId);

      if (error) throw error;

      // Auto-send review request when job is completed
      if (status === 'completed') {
        // Notify admin that the job was completed by staff (persists in admin bell)
        try {
          const { data: completedBooking } = await supabase
            .from('bookings')
            .select('id, booking_number, organization_id, customer:customers(first_name, last_name)')
            .eq('id', bookingId)
            .single();
          if (completedBooking?.organization_id) {
            const c: any = completedBooking.customer;
            const who = c ? `${c.first_name} ${c.last_name}` : 'Customer';
            await supabase.from('admin_system_notifications').insert({
              organization_id: completedBooking.organization_id,
              type: 'job_completed',
              title: '✅ Job marked complete by staff',
              message: `Booking #${completedBooking.booking_number || bookingId.slice(0, 8)} for ${who} was completed.`,
              link: `/admin/bookings`,
              metadata: { booking_id: bookingId },
            });
          }
        } catch (notifyErr) {
          console.warn('Admin completion notification failed:', notifyErr);
        }

        try {
          // Get booking details for review request
          const { data: bookingData } = await supabase
            .from('bookings')
            .select(`
              id,
              organization_id,
              customer:customers(id, email, first_name, last_name),
              service:services(name)
            `)
            .eq('id', bookingId)
            .single();

          if (bookingData?.customer?.email && bookingData?.organization_id) {
            const reviewResult = await supabase.functions.invoke('send-review-request', {
              body: {
                bookingId: bookingData.id,
                customerId: bookingData.customer.id,
                customerEmail: bookingData.customer.email,
                customerName: `${bookingData.customer.first_name} ${bookingData.customer.last_name}`,
                serviceName: bookingData.service?.name || 'Cleaning',
                organizationId: bookingData.organization_id,
              },
            });
            
            if (reviewResult.error) {
              console.error('Review request failed:', reviewResult.error);
              toast.error('Job completed, but review request failed to send');
              return { status, reviewSent: false };
            }
          } else {
            console.warn('Missing customer email or organization ID for review request');
          }
        } catch (reviewError) {
          console.error('Failed to send review request:', reviewError);
          toast.error('Job completed, but review request failed');
          return { status, reviewSent: false };
        }
      }

      return { status, reviewSent: status === 'completed' };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['staff-bookings'] });
      const statusMessages: Record<string, string> = {
        in_progress: 'Job started! Clock-in time recorded.',
        completed: result.reviewSent !== false 
          ? 'Job completed! Review request sent to customer.' 
          : 'Job completed!',
      };
      toast.success(statusMessages[variables.status] || 'Status updated');
      if (variables.status === 'completed') {
        void maybePromptPhotoStages(variables.bookingId);
      }
    },
    onError: (error) => {
      toast.error('Failed to update status');
      console.error(error);
    },
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (!user) {
    navigate('/staff/login');
    return null;
  }

  return (
    <>
      <SEOHead title="Staff Portal | TidyWise" description="Manage your jobs, availability, and earnings." noIndex />
      {staffInfo?.id && (
        <StaffLocationPrompt staffId={staffInfo.id} onResolved={() => { /* unmounts itself */ }} />
      )}
      <div className="portal-v2 min-h-screen" {...pullHandlers}>
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />
      {/* Header — sticky glass */}
      <header
        className="sticky top-0 z-10 portal-v2-header-safe"
        style={{
          background: 'hsl(var(--pv-surface) / 0.72)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          backdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '1px solid hsl(var(--pv-border))',
        }}
      >
        <div className="container mx-auto px-3 sm:px-6 pb-3 pt-2 flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="pv-eyebrow">Cleaner Portal</p>
            <h1 className="pv-display text-[22px] sm:text-[30px] truncate mt-0.5">
              {staffInfo?.name ? `Hi, ${staffInfo.name.split(' ')[0]}` : 'Welcome'}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {staffInfo && (
              <>
              <NotificationBell 
                  staffId={staffInfo.id} 
                  onViewJob={(bookingId) => {
                    if (bookingId === '__payouts__') {
                      setActiveTab('payouts');
                    } else {
                      const availableTab = document.querySelector('[value="available"]') as HTMLButtonElement;
                      if (availableTab) availableTab.click();
                    }
                  }}
                />
                <Badge variant="outline" className="hidden md:flex pv-chip-neutral">
                  {staffInfo.tax_classification === 'w2' ? 'W-2 Employee' : '1099 Contractor'}
                </Badge>
              </>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2 min-h-[44px] px-2.5 sm:px-3">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>

      </header>

      {/* Main Content */}
      <main className="portal-v2-scroll container mx-auto px-3 sm:px-6 py-5 sm:py-6">
        {/* Onboarding Progress Tracker */}
        {staffInfo?.id && staffInfo?.organization_id && (
          <OnboardingProgress
            staffId={staffInfo.id}
            organizationId={staffInfo.organization_id}
            taxClassification={staffInfo.tax_classification}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {/* Payout Requirements Banner — hidden when the org pays cleaners externally */}
        {payoutSetupRequired && staffInfo?.id && staffInfo?.organization_id && (
          <PayoutRequirementsBanner
            staffId={staffInfo.id}
            organizationId={staffInfo.organization_id}
            onNavigateToPayouts={() => setActiveTab('payouts')}
          />
        )}

        {hasSetAvailability === false && (
          <div className="mb-6 rounded-2xl border p-4" style={{ background: 'hsl(var(--pv-warn-soft))', borderColor: 'hsl(var(--pv-warn) / 0.25)' }}>
            <p className="font-semibold" style={{ color: 'hsl(var(--pv-warn))' }}>Set your availability first</p>
            <p className="text-sm pv-meta mt-0.5">You must set your working hours before you can view or claim jobs.</p>
          </div>
        )}

        <Tabs value={currentTab} onValueChange={(val) => setActiveTab(val)} className="space-y-4">
          <div className="relative">
            <TabsList className="flex overflow-x-auto no-scrollbar h-auto p-1 w-full justify-start gap-1" style={{ flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch' }}>
              <TabsTrigger value="my-jobs" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <Briefcase className="w-4 h-4" />
                My Jobs
                {assignedBookings.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{assignedBookings.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="photos" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <Camera className="w-4 h-4" />
                Photos
              </TabsTrigger>
              <TabsTrigger value="available" className="gap-1.5 min-h-[44px] shrink-0 px-3 relative">
                <Bell className="w-4 h-4" />
                Available
                {unassignedBookings.length > 0 && (
                  <Badge variant="default" className={`ml-1 ${newJobAlert ? 'bg-green-500 animate-pulse' : 'bg-green-600'}`}>
                    {unassignedBookings.length}
                  </Badge>
                )}
                {newJobAlert && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
                )}
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <Calendar className="w-4 h-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <History className="w-4 h-4" />
                History
              </TabsTrigger>
              <TabsTrigger value="availability" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <Clock className="w-4 h-4" />
                Hours
              </TabsTrigger>
              <TabsTrigger value="earnings" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <DollarSign className="w-4 h-4" />
                Earnings
              </TabsTrigger>
              <TabsTrigger value="reviews" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <Star className="w-4 h-4" />
                Reviews
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <User className="w-4 h-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <FileText className="w-4 h-4" />
                Docs
              </TabsTrigger>
              <TabsTrigger value="signatures" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <PenLine className="w-4 h-4" />
                Sign
              </TabsTrigger>
              <TabsTrigger value="payouts" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <Banknote className="w-4 h-4" />
                Payouts
              </TabsTrigger>
              <TabsTrigger value="time-off" className="gap-1.5 min-h-[44px] shrink-0 px-3">
                <Calendar className="w-4 h-4" />
                Time Off
              </TabsTrigger>

            </TabsList>
            {/* Scroll fade indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
          </div>

          {/* My Jobs Tab */}
          <TabsContent value="my-jobs" className="space-y-4">
            <div>
              <h2 className="pv-display text-2xl">Your upcoming jobs</h2>
              <p className="pv-meta mt-1">Jobs assigned to you that are coming up.</p>
            </div>
            {loadingAssigned ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : assignedBookings.length === 0 ? (
              <div className="text-center py-16">
                <CalendarCheck className="w-10 h-10 mx-auto mb-4" style={{ color: 'hsl(var(--pv-ink-4))' }} />
                <p className="pv-display text-xl">No upcoming jobs</p>
                <p className="pv-meta mt-1">Check the Available tab to claim new jobs.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {assignedBookings.map((booking) => (
                  <MyJobCard
                    key={booking.id}
                    booking={booking}
                    staffInfo={{
                      id: staffInfo?.id,
                      hourly_rate: staffInfo?.hourly_rate || null,
                      base_wage: staffInfo?.base_wage || null,
                      default_hours: staffInfo?.default_hours || null,
                    }}
                    photoReqs={cardPhotoReqs}
                    photoCount={cardData?.photoCountByBooking[booking.id] ?? 0}
                    propertyNote={cardData?.propertyNoteByCustomer[(booking as any).customer_id] ?? null}
                    onTheWaySent={cardData?.onTheWaySent.has(booking.id) ?? false}
                    onUpdateStatus={(id, status) => updateStatus.mutate({ bookingId: id, status })}
                    isUpdating={updateStatus.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {staffInfo?.id && staffInfo?.organization_id ? (
                <StaffPhotosTab staffId={staffInfo.id} organizationId={staffInfo.organization_id} />
              ) : (
                <TabFallback />
              )}
            </Suspense>
          </TabsContent>

          {/* Available Jobs Tab */}
          <TabsContent value="available" className="space-y-4">
            <div>
              <h2 className="pv-display text-2xl">Available jobs</h2>
              <p className="pv-meta mt-1">Open jobs waiting to be claimed. See your potential earnings below.</p>
            </div>
            {loadingUnassigned ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : unassignedBookings.length === 0 ? (
              <div className="text-center py-16">
                <Briefcase className="w-10 h-10 mx-auto mb-4" style={{ color: 'hsl(var(--pv-ink-4))' }} />
                <p className="pv-display text-xl">No open jobs right now</p>
                <p className="pv-meta mt-1">Check back later for new opportunities.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {unassignedBookings.map((booking) => (
                  <AvailableJobCard
                    key={booking.id}
                    booking={booking}
                    staffInfo={{
                      hourly_rate: staffInfo?.hourly_rate || null,
                      base_wage: staffInfo?.base_wage || null,
                      default_hours: staffInfo?.default_hours || null,
                    }}
                    onAssign={(id) => assignToSelf.mutate(id)}
                    isAssigning={assignToSelf.isPending}
                    claimingBookingId={claimingBookingId}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Job History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              <div>
                <h2 className="pv-display text-2xl">Job history</h2>
                <p className="pv-meta mt-1">Your completed and past jobs.</p>
              </div>
              {loadingHistory ? (
                <TabFallback />
              ) : jobHistory.length === 0 ? (
                <div className="text-center py-16">
                  <History className="w-10 h-10 mx-auto mb-4" style={{ color: 'hsl(var(--pv-ink-4))' }} />
                  <p className="pv-display text-xl">No job history yet</p>
                  <p className="pv-meta mt-1">Completed jobs will appear here.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {jobHistory.map((booking) => (
                    <JobHistoryCard key={booking.id} booking={booking} />
                  ))}
                </div>
              )}
            </Suspense>
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {staffInfo?.id ? (
                <CleanerAvailabilityManager
                  staffId={staffInfo.id}
                  onSaved={() => setHasSetAvailability(true)}
                />
              ) : (
                <TabFallback />
              )}
            </Suspense>
          </TabsContent>

          {/* Earnings Tab */}
          <TabsContent value="earnings" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {staffInfo?.id ? (
                <CleanerEarnings staffId={staffInfo.id} staffName={staffInfo.name} />
              ) : (
                <TabFallback />
              )}
            </Suspense>
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {staffInfo?.id ? (
                <CleanerCalendar staffId={staffInfo.id} />
              ) : (
                <TabFallback />
              )}
            </Suspense>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {staffInfo?.id ? (
                <CleanerReviews staffId={staffInfo.id} />
              ) : (
                <TabFallback />
              )}
            </Suspense>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {staffInfo && user ? (
                <CleanerProfile staffInfo={staffInfo} userId={user.id} />
              ) : (
                <TabFallback />
              )}
            </Suspense>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {staffInfo?.id && staffInfo?.organization_id ? (
                <StaffDocumentUpload staffId={staffInfo.id} organizationId={staffInfo.organization_id} taxClassification={staffInfo.tax_classification} />
              ) : (
                <TabFallback />
              )}
            </Suspense>
          </TabsContent>

          {/* Signatures Tab */}
          <TabsContent value="signatures" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {staffInfo?.id && staffInfo?.organization_id ? (
                <StaffSignatureManager staffId={staffInfo.id} organizationId={staffInfo.organization_id} />
              ) : (
                <TabFallback />
              )}
            </Suspense>
          </TabsContent>

          {/* Payouts Tab */}
          <TabsContent value="payouts" className="space-y-4">
            <Suspense fallback={<TabFallback />}>
              {!payoutSetupRequired ? (
                <div className="text-center py-10 space-y-2">
                  <p className="font-medium">No payout setup needed</p>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Your employer pays you directly (cash, Zelle, Venmo, or check) —
                    there's nothing to set up here.
                  </p>
                </div>
              ) : staffInfo?.id && staffInfo?.organization_id ? (
                <StaffPayoutSetup staffId={staffInfo.id} organizationId={staffInfo.organization_id} />
              ) : (
                <div className="text-center py-8 space-y-2">
                  <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">Unable to load payout setup.</p>
                  <p className="text-sm text-muted-foreground">Please sign out and sign back in.</p>
                </div>
              )}
            </Suspense>
          </TabsContent>

          <TabsContent value="time-off" className="space-y-4">
            {staffInfo?.id && staffInfo?.organization_id ? (
              <TimeOffRequests staffId={staffInfo.id} organizationId={staffInfo.organization_id} />
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </TabsContent>
        </Tabs>

      </main>
    </div>

    {/* Post-completion only. Dismissing, or killing the app, leaves the job
        complete and the hours written — this can only change photo_type. */}
    <Dialog open={!!photoNudge} onOpenChange={(open) => { if (!open) setPhotoNudge(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Check your photo stages</DialogTitle>
          <DialogDescription>
            All {photoNudge?.photos.length} photos on this job are marked{' '}
            <span className="font-medium capitalize">{photoNudge?.currentType}</span>. If some were
            taken {photoNudge?.currentType === 'before' ? 'after' : 'before'} the clean, move them
            across — otherwise just keep them as they are.
          </DialogDescription>
        </DialogHeader>

        {photoNudge && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                aria-label="Move fewer photos"
                disabled={photoNudge.moveCount <= 0}
                onClick={() => setPhotoNudge((n) => (n ? { ...n, moveCount: Math.max(0, n.moveCount - 1) } : n))}
              >
                −
              </Button>
              <div className="text-center">
                <div className="text-2xl font-bold">{photoNudge.moveCount}</div>
                <div className="text-xs text-muted-foreground">
                  most recent {photoNudge.moveCount === 1 ? 'photo' : 'photos'}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                aria-label="Move more photos"
                disabled={photoNudge.moveCount >= photoNudge.photos.length}
                onClick={() => setPhotoNudge((n) => (n ? { ...n, moveCount: Math.min(n.photos.length, n.moveCount + 1) } : n))}
              >
                +
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="min-h-[44px]"
                disabled={applyingNudge || photoNudge.moveCount === 0}
                onClick={applyPhotoNudge}
              >
                {applyingNudge && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Move {photoNudge.moveCount} to {photoNudge.currentType === 'before' ? 'After' : 'Before'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-[44px]"
                disabled={applyingNudge}
                onClick={() => setPhotoNudge(null)}
              >
                Keep as is
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
