import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Phone, MapPin, User, Navigation, MapPinned, ClipboardList, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { resolveCleanerPay, describeCleanerPay } from '@/lib/wageCalculation';
import {
  Button,
  Card,
  CardTitle,
  DetailHeader,
  Eyebrow,
  InfoRow,
  InverseCard,
  NoteWell,
  Skeleton,
  StatusBadge,
} from '@/components/portal-v2';

/**
 * Screen 3a wired to real data — a cleaner's job detail.
 *
 * ADDITIVE. This is a new route; MyJobCard and the my-jobs list are untouched.
 * There was no per-job screen before: /staff is a single route, my-jobs is a
 * tab, and MyJobCard is the detail rendered inline. Porting its 626 lines of
 * GPS, on-the-way SMS, checklist and photo behaviour is a separate change.
 *
 * The customer's phone is deliberately absent, per the 3a decision — a cleaner
 * should not be able to contact a customer off-platform, and a tel: link would
 * put the number back in the DOM regardless of whether it is displayed.
 */

const MONEY = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/* Both formatters pass an explicit timeZone, which is what
   local/no-device-local-dates asks for — the ban is on toLocale* WITHOUT one. */
const timeLabel = (iso: string, tz: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
};
const dayLabel = (iso: string, tz: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
};

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
  const job = jobQ.data;

  const pay = useMemo(() => {
    if (!job || !staff) return null;
    return resolveCleanerPay(job as never, staff as never, teamQ.data?.pay_share ?? null);
  }, [job, staff, teamQ.data]);

  const loading = staffQ.isLoading || (active && (jobQ.isLoading || teamQ.isLoading));
  const failed = staffQ.error || jobQ.error || teamQ.error;

  const back = () => navigate('/staff');

  /* ── Deactivated: zero rows by RLS, which is NOT "no jobs" ──────────── */
  if (!staffQ.isLoading && staff && !active) {
    return (
      <Shell onBack={back} title="Job" sub={null}>
        <Card>
          <div role="alert">
            <CardTitle>Your access is paused</CardTitle>
            <p className="mt-2 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              Your staff account is not active, so job details are hidden. Nothing
              has been deleted. Ask your admin to reactivate you.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (!staffQ.isLoading && !staff) {
    return (
      <Shell onBack={back} title="Job" sub={null}>
        <Card>
          <div role="alert">
            <CardTitle>No staff record</CardTitle>
            <p className="mt-2 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
              This account isn&rsquo;t set up as a cleaner.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (failed) {
    return (
      <Shell onBack={back} title="Job" sub={null}>
        <Card>
          <div role="alert">
            <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
              Couldn&rsquo;t load this job
            </p>
            <button
              type="button"
              onClick={() => {
                staffQ.refetch();
                jobQ.refetch();
              }}
              className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell onBack={back} title="Job" sub={null}>
        <InverseCard>
          <Eyebrow onInverse>Your pay</Eyebrow>
          <Skeleton onInverse className="mt-1.5 h-[30px] w-[132px]" />
        </InverseCard>
        <Card>
          <Skeleton className="h-3.5 w-1/3" />
          <div className="mt-3 flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="mt-1 h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Shell>
    );
  }

  /* Genuinely absent — the read succeeded and returned nothing. Distinct from
     both the failure above and the access case. */
  if (!job) {
    return (
      <Shell onBack={back} title="Job" sub={null}>
        <Card>
          <div className="py-4 text-center">
            <p className="text-[13px] font-bold text-[hsl(var(--pv-ink))]">
              This job isn&rsquo;t available
            </p>
            <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
              It may have been cancelled or reassigned.
            </p>
            <button
              type="button"
              onClick={back}
              className="mt-2 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
            >
              Back to my jobs
            </button>
          </div>
        </Card>
      </Shell>
    );
  }

  const customerName = job.customer
    ? `${job.customer.first_name ?? ''} ${job.customer.last_name ?? ''}`.trim()
    : null;
  const addressLine = [job.address, job.city, job.state, job.zip_code].filter(Boolean).join(', ');
  const start = job.scheduled_at ? timeLabel(job.scheduled_at, orgTz) : null;
  const end =
    job.scheduled_at && job.duration
      ? timeLabel(new Date(new Date(job.scheduled_at).getTime() + job.duration * 60000).toISOString(), orgTz)
      : null;
  const extras = Array.isArray(job.extras) ? (job.extras as string[]) : [];
  const isTeam = !!teamQ.data;
  const checkedIn = !!job.cleaner_checkin_at;
  const checkedOut = !!job.cleaner_checkout_at;

  const statusTone =
    job.status === 'confirmed' ? 'success' : job.status === 'in_progress' ? 'warn' : 'info';

  return (
    <Shell
      onBack={back}
      title={`#${job.booking_number} · ${job.service?.name ?? 'Cleaning'}`}
      sub={
        job.scheduled_at
          ? `${dayLabel(job.scheduled_at, orgTz)}${start ? ` · ${start}` : ''}${end ? ` – ${end}` : ''}`
          : 'Not scheduled'
      }
      badge={{ tone: statusTone as 'info' | 'success' | 'warn', label: job.status.replace('_', ' ') }}
    >
      {/* ── PayHeroCard ─────────────────────────────────────────────────
          §5.1 corrected: isMissingPay is a THIRD state. Not $0.00, and not
          the error copy, which would blame the read for an admin's omission. */}
      <InverseCard>
        <div className="flex items-start gap-3">
          <Eyebrow onInverse>Your pay</Eyebrow>
          {isTeam && (
            <span className="ml-auto text-[10.5px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--pv-on-inverse-muted))]">
              Team job
            </span>
          )}
        </div>

        {pay?.isMissingPay ? (
          <>
            <p className="mt-1 text-[17px] font-extrabold text-[hsl(var(--pv-on-inverse))]">
              Pay not set yet
            </p>
            <p className="mt-1 text-[11.5px] font-medium text-[hsl(var(--pv-on-inverse-muted))]">
              Your admin will confirm it before this job is paid out.
            </p>
          </>
        ) : (
          <>
            <p className="mt-0.5 text-[26px] font-extrabold leading-none tabular-nums text-[hsl(var(--pv-on-inverse))]">
              {MONEY(pay?.calculatedPay ?? 0)}
            </p>
            <p className="mt-1.5 text-[11.5px] font-medium text-[hsl(var(--pv-on-inverse-muted))]">
              {pay ? describeCleanerPay(pay) : ''}
              {isTeam && teamQ.data?.is_primary ? ' · Lead' : ''}
            </p>
          </>
        )}
      </InverseCard>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      {(checkedIn || checkedOut) && (
        <Card>
          <CardTitle>Progress</CardTitle>
          <div className="mt-2.5 flex flex-col gap-2">
            <InfoRow
              icon={<Clock className="h-4 w-4" aria-hidden />}
              title="Checked in"
              sub={job.cleaner_checkin_at ? timeLabel(job.cleaner_checkin_at, orgTz) : 'Not yet'}
            />
            <InfoRow
              icon={<Clock className="h-4 w-4" aria-hidden />}
              title="Checked out"
              sub={job.cleaner_checkout_at ? timeLabel(job.cleaner_checkout_at, orgTz) : 'Not yet'}
            />
          </div>
        </Card>
      )}

      {/* ── ContactCard. No phone, by decision. ──────────────────────── */}
      <Card>
        <CardTitle>Contact</CardTitle>
        <div className="mt-3 flex flex-col gap-3">
          <InfoRow
            icon={<User className="h-4 w-4" aria-hidden />}
            title={customerName || 'No customer on file'}
            sub={customerName ? 'Customer' : undefined}
          />
          <InfoRow
            icon={<Phone className="h-4 w-4" aria-hidden />}
            title="Customer phone"
            sub="Number hidden"
            action={{ label: 'Call', onClick: () => {} }}
          />
          <InfoRow
            icon={<MapPin className="h-4 w-4" aria-hidden />}
            title={addressLine || 'No address on file'}
            sub={addressLine ? undefined : 'Ask your admin to add one'}
            action={addressLine ? { label: 'Map', href: '#' } : undefined}
          />
        </div>
      </Card>

      {/* ── Extras ───────────────────────────────────────────────────── */}
      {extras.length > 0 && (
        <Card>
          <CardTitle>Add-ons</CardTitle>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {extras.map((e) => (
              <StatusBadge key={String(e)} tone="info" label={String(e)} />
            ))}
          </div>
        </Card>
      )}

      {/* ── Three note sources, deliberately distinct. Each omitted when
             genuinely absent — an omitted well is not an error here. ──── */}
      {job.notes && (
        <NoteWell tone="warn" label="Special instructions">
          {job.notes}
        </NoteWell>
      )}
      {job.customer_notes && (
        <NoteWell tone="info" label="From the customer">
          {job.customer_notes}
        </NoteWell>
      )}

      {/* ── ActionsCard ──────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Actions</CardTitle>
        <p className="mt-0.5 text-[10.5px] font-medium text-[hsl(var(--pv-ink-3))]">
          Full controls are on the My jobs card
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Button variant="primary" className="rounded-[10px]" icon={<Navigation className="h-4 w-4" aria-hidden />} onClick={back}>
            On the way
          </Button>
          <Button
            variant={addressLine ? 'secondary' : 'disabled-visible'}
            className="rounded-[10px]"
            icon={<MapPinned className="h-4 w-4" aria-hidden />}
          >
            Directions
          </Button>
          <Button variant="disabled-visible" className="rounded-[10px]">
            GPS check-in
          </Button>
          <Button variant="disabled-visible" className="rounded-[10px]" icon={<ClipboardList className="h-4 w-4" aria-hidden />}>
            Checklist
          </Button>
        </div>
        <Button
          variant={checkedOut ? 'disabled-visible' : 'disabled-visible'}
          size="lg"
          fullWidth
          className="mt-2.5"
        >
          {checkedOut ? 'Job complete' : checkedIn ? 'In progress' : 'Start job'}
        </Button>
      </Card>
    </Shell>
  );
}

function Shell({
  title,
  sub,
  badge,
  onBack,
  children,
}: {
  title: string;
  sub: string | null;
  badge?: { tone: 'info' | 'success' | 'warn' | 'danger'; label: string };
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      <DetailHeader title={title} sub={sub ?? undefined} badge={badge} onBack={onBack} />
      <div className="flex flex-1 flex-col gap-3 px-5 pb-8">{children}</div>
    </main>
  );
}
