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

  /* The staff row is readable even when deactivated — "Staff can view own
     record" is USING (user_id = auth.uid()) with no is_active clause. Every
     staff policy on bookings DOES require is_active, so a deactivated cleaner
     gets zero rows there. Reading this first is what lets us tell "you lost
     access" apart from "this job does not exist". */
  const staffQ = useQuery({
    queryKey: ['staff-self'],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, is_active, organization_id, base_wage, hourly_rate, default_hours')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const staff = staffQ.data;
  const active = staff?.is_active === true;

  const jobQ = useQuery({
    queryKey: ['staff-job', id],
    enabled: !!id && !!staff && active,
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

  const teamQ = useQuery({
    queryKey: ['staff-job-team', id, staff?.id],
    enabled: !!id && !!staff?.id && active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('pay_share, is_primary')
        .eq('booking_id', id!)
        .eq('staff_id', staff!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const orgTz = useOrgTimezone(staff?.organization_id ?? null);
  /* extras are slugs; labels are per-org. Same resolver MyJobCard uses. */
  const { data: orgExtras = [] } = useOrgExtrasCatalogue(staff?.organization_id ?? null);
  const job = jobQ.data;

  /* resolveCleanerPay mirrors the payout engine deliberately, so this screen
     cannot promise money payroll would not pay. Team share is priority 1. */
  const pay = useMemo(() => {
    if (!job || !staff) return null;
    return resolveCleanerPay(job as never, staff as never, teamQ.data?.pay_share ?? null);
  }, [job, staff, teamQ.data]);

  const mode: JobDetailMode = staffQ.error || jobQ.error || teamQ.error
    ? 'error'
    : staffQ.isLoading
      ? 'loading'
      : !staff
        ? 'noStaff'
        : !active
          ? 'deactivated'
          : jobQ.isLoading || teamQ.isLoading
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
        staffQ.refetch();
        jobQ.refetch();
        teamQ.refetch();
      }}
    />
  );
}
