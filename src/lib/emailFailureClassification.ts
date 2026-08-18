/**
 * Did an email actually fail to reach anyone, and if so why?
 *
 * Zero imports, no React, no Supabase — the whole point is that this is
 * testable directly. Tests: src/lib/emailFailureClassification.test.ts
 *
 * `fell_back_to` on org_email_send_failures records that a fallback was
 * ATTEMPTED, not that it worked. Treating it as "probably delivered" hid three
 * genuine non-deliveries: Clean Collective's booking confirmation and
 * Charleston Clean Routine's confirmation and quote. All three were rows the
 * dashboard banner deliberately filtered out.
 */

/** Row shape from org_email_send_failures, narrowed to what matters here. */
export interface FailureRowLike {
  fell_back_to: string | null;
  error_message: string | null;
}

/**
 * The exact literal produced by
 * `supabase/functions/_shared/send-org-email.ts` (~line 249) when the Gmail
 * primary fails AND the Resend fallback fails too:
 *
 *     `Gmail failed (${gmailError}); Resend fallback also failed: ${...}`
 *
 * It is built in one place only. The success path a few lines above logs the
 * primary's error alone, with the same `fell_back_to`, so this string is the
 * only thing separating a delivered email from an undelivered one.
 *
 * That coupling is brittle on purpose-of-record: a column on
 * org_email_send_failures would be better, and is not added here because this
 * change is frontend-only. If that message is ever reworded, this stops
 * matching and the banner goes quiet again — which is why it lives here as a
 * named constant rather than inline, and why the tests pin it.
 */
export const FALLBACK_ALSO_FAILED_MARKER = 'Resend fallback also failed';

/**
 * A hard failure is one where nothing was delivered.
 *
 * Two shapes qualify:
 *   1. No fallback was attempted at all — the single send failed.
 *   2. A fallback was attempted and it failed as well.
 *
 * A row with `fell_back_to` set and no failure marker is a SUCCESS record: the
 * primary failed, the fallback carried it, the customer got their email. Those
 * must not raise a banner. That includes `fell_back_to = 'platform'` rows,
 * which weekly-business-report writes on a *successful* send via the platform
 * sender — alarming on those would tell every org that ever fell back that its
 * email is broken, which is the failure mode that teaches people to ignore the
 * banner entirely.
 */
export function isHardFailure(row: FailureRowLike): boolean {
  if (!row.fell_back_to) return true;
  const msg = row.error_message ?? '';
  return msg.includes(FALLBACK_ALSO_FAILED_MARKER);
}

export type FailureCause =
  | 'invalid_key'
  | 'unverified_domain'
  | 'gmail_auth'
  | 'unknown';

/**
 * Why did it fail?
 *
 * Priority order matters: a compound Gmail-plus-domain message names two
 * problems, and the domain is the one that blocked the fallback which was
 * supposed to rescue the send, so it wins.
 */
export function classifyCause(errorMessage: string | null): FailureCause {
  const m = (errorMessage ?? '').toLowerCase();
  if (!m) return 'unknown';
  if (m.includes('domain is not verified')) return 'unverified_domain';
  if (m.includes('api key is invalid')) return 'invalid_key';
  if (m.includes('username and password not accepted') || m.includes('535')) return 'gmail_auth';
  return 'unknown';
}

/**
 * The single cause to write a remedy for, or null when they genuinely differ.
 *
 * Unanimity is required on purpose. A remedy that names the wrong fix is worse
 * than a plain count: it sends the owner to change a setting that was not the
 * problem, and when that does not help they stop believing the banner.
 */
export function dominantCause(rows: FailureRowLike[]): FailureCause | null {
  if (rows.length === 0) return null;
  const causes = new Set(rows.map((r) => classifyCause(r.error_message)));
  if (causes.size !== 1) return null;
  const only = [...causes][0];
  return only === 'unknown' ? null : only;
}
