// Shared per-org processor for the payroll-period-report flow.
// Imported by both the cron-driven `payroll-period-report` function and the
// admin-triggered `admin-trigger-payroll-report` function so the report logic
// has exactly one source of truth.

import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { Resend } from "https://esm.sh/resend@2.0.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  type PayrollPeriodConfig,
  DEFAULT_PAYROLL_CONFIG,
  calendarDateInTz,
  getEndDay,
  getPeriodEnd,
  getPeriodStart,
  getPreviousPeriod,
  isPeriodEndDay,
  formatPeriodLabel,
  toDateString,
} from "./payroll-period.ts";
import {
  formatEmailFrom,
  getOrgEmailSettings,
  getReplyTo,
} from "./get-org-email-settings.ts";
import {
  PayrollPeriodReport,
  type CleanerRow,
} from "./email-templates/payroll-period-report.tsx";

const TEMPLATE_NAME = "payroll-period-report";
const APP_URL =
  Deno.env.get("APP_URL") ?? "https://app.jointidywise.com";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgRow {
  id: string;
  name: string;
  owner_id: string;
}

export interface ProcessOrgOptions {
  /** Bypass the "today is the period-end day" check. Used by the admin trigger. */
  force?: boolean;
  /** Render the email but don't actually send or log. Used for preview. */
  dryRun?: boolean;
  /**
   * Override the period being reported on. Required when `force` is true and
   * today isn't an actual period-end day (otherwise we send for the in-progress
   * period, which is misleading).
   */
  periodOverride?: { start: Date; end: Date };
}

export type ProcessSkippedReason =
  | "email_disabled"
  | "not_period_end_day"
  | "no_owner_email"
  | "no_email_settings"
  | "already_sent"
  | "no_completed_bookings";

export interface ProcessOrgResult {
  organizationId: string;
  success: boolean;
  skipped?: ProcessSkippedReason;
  error?: string;
  recipients?: string[];
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string;
  periodLabel?: string;
  subject?: string;
  html?: string;
  text?: string;
  totals?: {
    revenue: number;
    payroll: number;
    profit: number;
    laborPct: number;
    jobs: number;
    cleanersWorked: number;
  };
}

// ---------------------------------------------------------------------------
// Per-booking pay calc — mirrors weekly-payroll-summary so wages stay
// computed the same way everywhere.
// ---------------------------------------------------------------------------

interface BookingForPay {
  duration: number | null;
  total_amount: number | null;
  cleaner_override_hours: number | null;
  cleaner_pay_expected: number | null;
  cleaner_actual_payment: number | null;
  cleaner_wage_type: string | null;
  cleaner_wage: number | null;
  staff_id: string | null;
}

interface StaffForPay {
  base_wage: number | null;
  hourly_rate: number | null;
  percentage_rate: number | null;
}

function bookingHours(b: BookingForPay): number {
  if (b.cleaner_override_hours != null) return Number(b.cleaner_override_hours);
  if (b.duration != null) return Number(b.duration) / 60;
  return 0;
}

function bookingPay(b: BookingForPay, staff: StaffForPay | null): number {
  // SINGLE SOURCE OF TRUTH: cleaner_pay_expected
  if (b.cleaner_pay_expected != null) return Number(b.cleaner_pay_expected);
  if (b.cleaner_actual_payment != null) return Number(b.cleaner_actual_payment);

  // Fallback: compute from the rate/type stored on the booking, then staff.
  const wageType = (b.cleaner_wage_type || "hourly").toLowerCase();
  const wageRate = Number(
    b.cleaner_wage ?? staff?.base_wage ?? staff?.hourly_rate ?? 0,
  );
  const hours = bookingHours(b);
  const total = Number(b.total_amount ?? 0);

  if (wageType === "flat") return wageRate;
  if (wageType === "percentage") return (total * wageRate) / 100;
  return wageRate * hours;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function processOrg(
  org: OrgRow,
  supabase: SupabaseClient,
  opts: ProcessOrgOptions = {},
): Promise<ProcessOrgResult> {
  const result: ProcessOrgResult = {
    organizationId: org.id,
    success: false,
  };

  // --- 1. Load business_settings (config + tz + report controls) -----------
  const { data: bs } = await supabase
    .from("business_settings")
    .select(
      "timezone, payroll_frequency, payroll_start_day, payroll_custom_days, " +
        "payroll_report_email_enabled, payroll_report_recipients, " +
        "company_name",
    )
    .eq("organization_id", org.id)
    .maybeSingle();

  const tz = (bs?.timezone as string) || "America/New_York";
  const config: PayrollPeriodConfig = {
    payroll_frequency: (bs?.payroll_frequency as "weekly" | "biweekly") ||
      DEFAULT_PAYROLL_CONFIG.payroll_frequency,
    payroll_start_day:
      (bs?.payroll_start_day as number | null) ??
        DEFAULT_PAYROLL_CONFIG.payroll_start_day,
    payroll_custom_days: (bs?.payroll_custom_days as number[] | null) ?? null,
  };
  const emailEnabled = bs?.payroll_report_email_enabled ?? true;
  const extraRecipients = (bs?.payroll_report_recipients as string[]) ?? [];
  const companyName = (bs?.company_name as string) || org.name;

  if (!opts.force && !emailEnabled) {
    return { ...result, skipped: "email_disabled", success: true };
  }

  // --- 2. Decide which period this run reports on ---------------------------
  const today = calendarDateInTz(new Date(), tz);
  let periodStart: Date;
  let periodEnd: Date;

  if (opts.periodOverride) {
    periodStart = opts.periodOverride.start;
    periodEnd = opts.periodOverride.end;
  } else if (isPeriodEndDay(today, config)) {
    periodStart = getPeriodStart(today, config);
    periodEnd = getPeriodEnd(periodStart, config);
  } else if (opts.force) {
    // Admin trigger on a non-end-day: report on the CURRENT in-progress
    // pay period (the one that contains today). This matches what the
    // Payroll dashboard shows as "Current Pay Period".
    periodStart = getPeriodStart(today, config);
    periodEnd = getPeriodEnd(periodStart, config);
  } else {
    return { ...result, skipped: "not_period_end_day", success: true };
  }

  result.periodStart = toDateString(periodStart);
  result.periodEnd = toDateString(periodEnd);
  result.periodLabel = formatPeriodLabel(periodStart, periodEnd);

  // --- 3. Pre-send dedupe check --------------------------------------------
  // org_id + period_end live inside metadata (the email_send_log table only
  // has id/message_id/template_name/recipient_email/status/error_message/
  // metadata/created_at), so we filter via jsonb operators.
  if (!opts.dryRun) {
    const { data: existing } = await supabase
      .from("email_send_log")
      .select("id")
      .eq("template_name", TEMPLATE_NAME)
      .eq("status", "sent")
      .eq("metadata->>organization_id", org.id)
      .eq("metadata->>period_end", result.periodEnd)
      .limit(1);
    if (existing && existing.length > 0) {
      return { ...result, skipped: "already_sent", success: true };
    }
  }

  // --- 4. Resolve owner email + extra recipients ----------------------------
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", org.owner_id)
    .maybeSingle();
  const ownerEmail = (ownerProfile?.email as string | null) ?? null;

  const recipients = Array.from(
    new Set(
      [ownerEmail, ...extraRecipients]
        .filter((e): e is string => !!e && /\S+@\S+\.\S+/.test(e)),
    ),
  );
  if (recipients.length === 0) {
    return { ...result, skipped: "no_owner_email", success: true };
  }
  result.recipients = recipients;

  // --- 5. Pull bookings for current + 3 prior periods (for warnings) -------
  const span = config.payroll_frequency === "biweekly" ? 14 : 7;
  const lookbackStart = new Date(
    periodStart.getTime() - 3 * span * 86_400_000,
  );

  const { data: rawBookings } = await supabase
    .from("bookings")
    .select(
      "id, staff_id, status, scheduled_at, duration, total_amount, " +
        "cleaner_override_hours, cleaner_pay_expected, cleaner_actual_payment, " +
        "cleaner_wage_type, cleaner_wage",
    )
    .eq("organization_id", org.id)
    .eq("status", "completed")
    .gte("scheduled_at", lookbackStart.toISOString())
    .lte("scheduled_at", new Date(periodEnd.getTime() + 86_400_000).toISOString());

  const bookings = (rawBookings ?? []) as Array<BookingForPay & {
    id: string;
    status: string;
    scheduled_at: string;
  }>;

  // --- 6. Pull staff + payout accounts -------------------------------------
  const { data: staffData } = await supabase
    .from("staff")
    .select("id, name, base_wage, hourly_rate, percentage_rate")
    .eq("organization_id", org.id);

  const staffMap = new Map<
    string,
    { name: string } & StaffForPay
  >();
  for (const s of (staffData ?? []) as Array<
    { id: string; name: string } & StaffForPay
  >) {
    staffMap.set(s.id, s);
  }

  const { data: payoutAccts } = await supabase
    .from("staff_payout_accounts")
    .select("staff_id, payouts_enabled")
    .eq("organization_id", org.id);
  const payoutsEnabledFor = new Set(
    ((payoutAccts ?? []) as Array<{ staff_id: string; payouts_enabled: boolean }>)
      .filter((p) => p.payouts_enabled)
      .map((p) => p.staff_id),
  );

  // --- 7. Bucket bookings by period -----------------------------------------
  const inPeriod = (b: { scheduled_at: string }, start: Date, end: Date) => {
    const t = new Date(b.scheduled_at).getTime();
    return t >= start.getTime() &&
      t < end.getTime() + 86_400_000;
  };

  // Custom-days narrowing applies to the current period stats only — we still
  // measure prior periods unfiltered so the change-vs-prev numbers are
  // comparable.
  const passesCustomDays = (b: { scheduled_at: string }) => {
    if (!config.payroll_custom_days || config.payroll_custom_days.length === 0) {
      return true;
    }
    // Use the org's tz to decide the booking's weekday.
    const dow = calendarDateInTz(new Date(b.scheduled_at), tz).getUTCDay();
    return config.payroll_custom_days.includes(dow);
  };

  const prev1 = getPreviousPeriod(periodStart, config);
  const prev2 = getPreviousPeriod(prev1.start, config);
  const prev3 = getPreviousPeriod(prev2.start, config);

  const currentBookings = bookings.filter(
    (b) => inPeriod(b, periodStart, periodEnd) && passesCustomDays(b),
  );
  const prev1Bookings = bookings.filter((b) => inPeriod(b, prev1.start, prev1.end));
  const prev2Bookings = bookings.filter((b) => inPeriod(b, prev2.start, prev2.end));
  const prev3Bookings = bookings.filter((b) => inPeriod(b, prev3.start, prev3.end));

  // --- 8. Per-cleaner aggregation for the current period --------------------
  interface CleanerAgg {
    name: string;
    jobs: number;
    revenue: number;
    payout: number;
    hours: number;
  }
  const aggCurrent = new Map<string, CleanerAgg>();
  const aggPrev1 = new Map<string, CleanerAgg>();

  const aggregate = (
    list: typeof bookings,
    target: Map<string, CleanerAgg>,
  ) => {
    for (const b of list) {
      if (!b.staff_id) continue;
      const staff = staffMap.get(b.staff_id);
      if (!staff) continue;
      let row = target.get(b.staff_id);
      if (!row) {
        row = { name: staff.name, jobs: 0, revenue: 0, payout: 0, hours: 0 };
        target.set(b.staff_id, row);
      }
      const pay = bookingPay(b, staff);
      const hrs = bookingHours(b);
      row.jobs += 1;
      row.revenue += Number(b.total_amount ?? 0);
      row.payout += pay;
      row.hours += hrs;
    }
  };
  aggregate(currentBookings, aggCurrent);
  aggregate(prev1Bookings, aggPrev1);

  // --- 9. Totals + change vs prev ------------------------------------------
  const sumPay = (list: typeof bookings) =>
    list.reduce(
      (acc, b) => acc + bookingPay(b, b.staff_id ? staffMap.get(b.staff_id) ?? null : null),
      0,
    );
  const sumRev = (list: typeof bookings) =>
    list.reduce((acc, b) => acc + Number(b.total_amount ?? 0), 0);

  const currentRevenue = sumRev(currentBookings);
  const currentPayroll = sumPay(currentBookings);
  const prev1Revenue = sumRev(prev1Bookings);
  const prev1Payroll = sumPay(prev1Bookings);

  const totals = {
    revenue: currentRevenue,
    payroll: currentPayroll,
    profit: currentRevenue - currentPayroll,
    laborPct: currentRevenue > 0 ? (currentPayroll / currentRevenue) * 100 : 0,
    jobs: currentBookings.length,
    cleanersWorked: aggCurrent.size,
  };
  result.totals = totals;

  if (!opts.force && currentBookings.length === 0) {
    return { ...result, skipped: "no_completed_bookings", success: true };
  }

  const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / prev) * 100;
  };
  const hadPrev = prev1Bookings.length > 0;
  const changeVsPrevious = hadPrev
    ? {
      revenuePct: pctChange(currentRevenue, prev1Revenue),
      payrollPct: pctChange(currentPayroll, prev1Payroll),
      jobsPct: pctChange(currentBookings.length, prev1Bookings.length),
    }
    : null;

  // --- 10. Build the cleaner rows + standouts -------------------------------
  const cleaners: CleanerRow[] = Array.from(aggCurrent.values())
    .map((c) => {
      const staffId = [...aggCurrent.entries()].find(([, v]) => v === c)?.[0];
      const prev = staffId ? aggPrev1.get(staffId) : undefined;
      const payoutChangePct = prev && prev.payout > 0
        ? ((c.payout - prev.payout) / prev.payout) * 100
        : null;
      return {
        name: c.name,
        jobs: c.jobs,
        revenue: c.revenue,
        payout: c.payout,
        hours: c.hours,
        payoutChangePct,
      };
    })
    .sort((a, b) => b.payout - a.payout);

  const topEarner = cleaners[0]
    ? { name: cleaners[0].name, payout: cleaners[0].payout }
    : undefined;
  const mostJobsRow = [...cleaners].sort((a, b) => b.jobs - a.jobs)[0];
  const mostJobs = mostJobsRow
    ? { name: mostJobsRow.name, jobs: mostJobsRow.jobs }
    : undefined;
  const highestAvgRow = [...cleaners]
    .filter((c) => c.jobs > 0)
    .sort((a, b) => b.payout / b.jobs - a.payout / a.jobs)[0];
  const highestAvg = highestAvgRow
    ? {
      name: highestAvgRow.name,
      avgPayout: highestAvgRow.payout / highestAvgRow.jobs,
    }
    : undefined;

  const standouts = topEarner || mostJobs || highestAvg
    ? { topEarner, mostJobs, highestAvg }
    : null;

  // --- 11. Warnings ---------------------------------------------------------
  // Idle: jobs in EITHER prior 2 periods AND zero current.
  const staffIdsWithJobs = (list: typeof bookings) => {
    const s = new Set<string>();
    for (const b of list) if (b.staff_id) s.add(b.staff_id);
    return s;
  };
  const inCurrent = staffIdsWithJobs(currentBookings);
  const inPrev1 = staffIdsWithJobs(prev1Bookings);
  const inPrev2 = staffIdsWithJobs(prev2Bookings);

  const idleStaffIds: string[] = [];
  for (const sid of new Set([...inPrev1, ...inPrev2])) {
    if (!inCurrent.has(sid)) idleStaffIds.push(sid);
  }
  const idleCleaners = idleStaffIds
    .map((sid) => staffMap.get(sid)?.name)
    .filter((n): n is string => !!n)
    .sort();

  const noStripeCleaners = Array.from(aggCurrent.entries())
    .filter(([sid]) => !payoutsEnabledFor.has(sid))
    .map(([, agg]) => agg.name)
    .sort();

  let negativeMargin = 0;
  let zeroPay = 0;
  for (const b of currentBookings) {
    if (!b.staff_id) continue;
    const staff = staffMap.get(b.staff_id) ?? null;
    const pay = bookingPay(b, staff);
    const rev = Number(b.total_amount ?? 0);
    if (pay === 0) zeroPay += 1;
    if (pay > rev) negativeMargin += 1;
  }

  const warnings = {
    idleCleaners,
    noStripeCleaners,
    negativeMarginBookings: negativeMargin,
    zeroPayBookings: zeroPay,
  };

  // --- 12. Org email settings — block if missing ---------------------------
  const emailSettingsResult = await getOrgEmailSettings(org.id);
  if (!emailSettingsResult.success || !emailSettingsResult.settings) {
    if (!opts.dryRun) {
      await supabase.from("email_send_log").insert({
        template_name: TEMPLATE_NAME,
        recipient_email: recipients[0],
        status: "failed",
        error_message: emailSettingsResult.error ?? "Email settings missing",
        metadata: {
          reason: "no_email_settings",
          organization_id: org.id,
          period_start: result.periodStart,
          period_end: result.periodEnd,
        },
      });
    }
    return {
      ...result,
      skipped: "no_email_settings",
      success: false,
      error: emailSettingsResult.error,
    };
  }
  const emailSettings = emailSettingsResult.settings;
  if (!emailSettings.resend_api_key) {
    if (!opts.dryRun) {
      await supabase.from("email_send_log").insert({
        template_name: TEMPLATE_NAME,
        recipient_email: recipients[0],
        status: "failed",
        error_message:
          "No Resend API key configured. Set one in Settings → Emails.",
        metadata: {
          reason: "no_resend_key",
          organization_id: org.id,
          period_start: result.periodStart,
          period_end: result.periodEnd,
        },
      });
    }
    return {
      ...result,
      skipped: "no_email_settings",
      success: false,
      error: "Resend API key not configured for this organization",
    };
  }

  // --- 13. Render React Email -----------------------------------------------
  const subject = `📊 Payroll report — ${result.periodLabel} · ${
    totals.payroll.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    })
  }`;

  const props = {
    orgName: companyName,
    periodLabel: result.periodLabel!,
    totals,
    changeVsPrevious,
    cleaners,
    standouts,
    warnings,
    ctaUrl: `${APP_URL}/dashboard/payroll`,
  };
  const html = await renderAsync(React.createElement(PayrollPeriodReport, props));
  const text = await renderAsync(
    React.createElement(PayrollPeriodReport, props),
    { plainText: true },
  );
  result.html = html;
  result.text = text;
  result.subject = subject;

  if (opts.dryRun) {
    return { ...result, success: true };
  }

  // --- 14. Send via Resend (retry once) -------------------------------------
  const resend = new Resend(emailSettings.resend_api_key);
  const messageId = crypto.randomUUID();
  const fromHeader = formatEmailFrom(emailSettings);
  const replyTo = getReplyTo(emailSettings);

  // Insert pending row first so we have a record even on crash.
  await supabase.from("email_send_log").insert({
    message_id: messageId,
    template_name: TEMPLATE_NAME,
    recipient_email: recipients[0],
    status: "pending",
    metadata: {
      recipients,
      period_label: result.periodLabel,
      totals,
      organization_id: org.id,
      period_start: result.periodStart,
      period_end: result.periodEnd,
    },
  });

  const sendOnce = () =>
    resend.emails.send({
      from: fromHeader,
      to: recipients,
      reply_to: replyTo,
      subject,
      html,
      text,
      headers: { "X-Message-ID": messageId },
    });

  let sendError: unknown = null;
  try {
    const r = await sendOnce();
    if ((r as any)?.error) sendError = (r as any).error;
  } catch (e) {
    sendError = e;
  }
  if (sendError) {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    try {
      const r = await sendOnce();
      if ((r as any)?.error) sendError = (r as any).error;
      else sendError = null;
    } catch (e) {
      sendError = e;
    }
  }

  if (sendError) {
    const errorMessage =
      sendError instanceof Error ? sendError.message : JSON.stringify(sendError);
    await supabase
      .from("email_send_log")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("message_id", messageId);
    return { ...result, success: false, error: errorMessage };
  }

  await supabase
    .from("email_send_log")
    .update({ status: "sent" })
    .eq("message_id", messageId);

  return { ...result, success: true };
}
