import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { resolveCleanerPay } from '@/lib/wageCalculation';
import { extrasToLabels } from '@/lib/bookingExtras';
import { useOrgExtrasCatalogue } from '@/hooks/useOrgExtrasCatalogue';
import { JobDetailView, type JobDetailMode } from '@/components/portal-v2';

/**
 * Screen 3a wired to real data — a cleaner's job detail.
 *
 * ADDITIVE. This is a new route; MyJobCard and the my-jobs list are untouched.
 * There was no per-job screen before: /staff is a single route, my-jobs is a
 * tab, and MyJobCard is the detail rendered inline. Porting its GPS,
 * on-the-way SMS, checklist and photo behaviour is a separate change.
 *
 * All presentation lives in JobDetailView so its states can be rendered from
 * fixtures at /dashboard/preview/job-detail-states — three of them do not
 * occur on demand in live data and one would mean deactivating a real person.
 */
export default function StaffJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  /* A cleaner can have MORE THAN ONE staff row — they may work for two
     businesses. The first version of this used .maybeSingle() on
     .eq('user_id', ...) and failed with PGRST116 for exactly that case, which
     is how a real dual-org cleaner found it. useMyStaffOrgs has the same
     shape for the same reason.

     No is_active filter here on purpose: filtering would collapse "you are
     deactivated" into "you have no staff record", and those need different
     copy (§5.1). The rows are readable either way — the staff policy is
     USING (user_id = auth.uid()) with no is_active clause. */
  const rowsQ = useQuery({
    queryKey: ['staff-rows'],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from('staff')
        .select('id, organization_id, is_active')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = rowsQ.data;
  const anyActive = !!rows?.some((r) => r.is_active);

  const jobQ = useQuery({
    queryKey: ['staff-job', id],
    enabled: !!id && !!rows && anyActive,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, organization_id, staff_id, booking_number, scheduled_at, duration, status,
          address, city, state, zip_code, extras, notes, customer_notes,
          total_amount, subtotal, discount_amount,
          cleaner_wage, cleaner_wage_type, cleaner_actual_payment, cleaner_pay_expected,
          cleaner_override_hours, cleaner_checkin_at, cleaner_checkout_at,
          customer:customers(first_name, last_name),
          service:services(name)
        `)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const job = jobQ.data;

  /* Match the staff row to the BOOKING's org, not just "the first active one".
     A dual-org cleaner has a different wage in each business, so resolving
     against the wrong row would show a number payroll would not pay. */
  const staffRow = useMemo(() => {
    if (!rows?.length) return null;
    const active = rows.filter((r) => r.is_active);
    if (job?.organization_id) {
      const match = active.find((r) => r.organization_id === job.organization_id);
      if (match) return match;
    }
    return active[0] ?? null;
  }, [rows, job?.organization_id]);

  /* The sanctioned read for a staff profile — the base table does not expose
     wage columns to a cleaner. Same RPC StaffPortal uses, same org argument. */
  const profileQ = useQuery({
    queryKey: ['staff-profile', staffRow?.organization_id],
    enabled: !!staffRow?.organization_id,
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        rpc: (n: string, a: Record<string, unknown>) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      })
        .rpc('get_my_staff_profile', { p_organization_id: staffRow!.organization_id })
        .maybeSingle();
      if (error) throw error;
      return data as { base_wage: number | null; hourly_rate: number | null; default_hours: number | null } | null;
    },
  });

  const teamQ = useQuery({
    queryKey: ['staff-job-team', id, staffRow?.id],
    enabled: !!id && !!staffRow?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('pay_share, is_primary')
        .eq('booking_id', id!)
        .eq('staff_id', staffRow!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const orgTz = useOrgTimezone(staffRow?.organization_id ?? null);
  /* extras are slugs; labels are per-org. Same resolver MyJobCard uses. */
  const { data: orgExtras = [] } = useOrgExtrasCatalogue(staffRow?.organization_id ?? null);
  /* resolveCleanerPay mirrors the payout engine deliberately, so this screen
     cannot promise money payroll would not pay. Team share is priority 1. */
  const pay = useMemo(() => {
    if (!job || !profileQ.data) return null;
    return resolveCleanerPay(job as never, profileQ.data as never, teamQ.data?.pay_share ?? null);
  }, [job, profileQ.data, teamQ.data]);

  const mode: JobDetailMode =
    rowsQ.error || jobQ.error || teamQ.error || profileQ.error
      ? 'error'
      : rowsQ.isLoading
        ? 'loading'
        : !rows?.length
          ? 'noStaff'
          : !anyActive
            ? 'deactivated'
            : jobQ.isLoading || teamQ.isLoading || profileQ.isLoading
              ? 'loading'
              : !job
                ? 'notFound'
                : 'ready';

  return (
    <JobDetailView
      mode={mode}
      job={job ? ({ ...job, extraLabels: extrasToLabels(job.extras, orgExtras) } as never) : null}
      pay={pay}
      team={teamQ.data ?? null}
      orgTz={orgTz}
      onBack={() => navigate('/staff')}
      onRetry={() => {
        rowsQ.refetch();
        jobQ.refetch();
        teamQ.refetch();
        profileQ.refetch();
      }}
    />
  );
}
