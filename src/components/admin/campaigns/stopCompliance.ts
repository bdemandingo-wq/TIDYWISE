/**
 * Opt-out ("STOP") compliance for campaign SMS bodies.
 *
 * WHY THIS EXISTS
 *
 * Nothing in the send path ever appends an opt-out instruction. `marketing-guard.ts`
 * is opt-out *suppression* only — it decides who to skip, and never touches outgoing
 * text. `process-campaign-queue` substitutes tokens and sends, adding nothing.
 *
 * So the STOP line lives only as characters inside the body an owner typed, seeded as
 * a default in CampaignWizard and then editable to nothing. An owner could delete it
 * and save, and every recipient of that campaign got a marketing SMS with no opt-out
 * instruction — a TCPA exposure, on the one message system that already had editable
 * copy.
 *
 * This module is the guard. It is deliberately a plain, tested function rather than
 * inline JSX validation, because it has to be applied at THREE call sites — creating a
 * campaign, editing one, and applying an AI-generated template — and a rule enforced in
 * only some of them is not a rule.
 *
 * SCOPE: every campaign body is sent as SMS. `automated_campaigns` has no `channel`
 * column, and both senders are SMS-only — `run-inactive-campaign` reads
 * `organization_sms_settings` and sends via OpenPhone, and `process-campaign-queue` is
 * the `campaign_sms` PGMQ worker. So this applies unconditionally to campaign bodies;
 * there is no email case to exempt.
 *
 * NOT a general marketing-SMS guard. Transactional messages (appointment reminders,
 * booking confirmations) correctly carry no STOP line, and applying this to them would
 * be a new bug. See docs/superpowers/plans/2026-07-30-editable-automation-messages.md
 * for the message-class work that generalises this properly.
 */

/** The opt-out sentence CampaignWizard seeds by default. */
export const STOP_SENTENCE = 'Reply STOP to opt out.';

/**
 * Does this body carry an opt-out instruction?
 *
 * Matches a standalone, UPPERCASE `STOP`. Both halves of that are deliberate:
 *
 * - **Standalone** (word boundaries) so "STOPPED" or "NONSTOP" do not count.
 * - **Uppercase, case-SENSITIVE** because lowercase "stop" is ordinary English and
 *   appears in innocent prose — "we'll stop by on Tuesday" would pass a
 *   case-insensitive check while containing no opt-out instruction at all. That false
 *   pass is the failure mode that matters here: it would let a non-compliant message
 *   through while appearing to have been validated.
 *
 * Uppercase is also the carrier convention, what the seeded default uses, and what
 * every compliant SMS in the wild does — so requiring it costs a compliant author
 * nothing, and the error message says exactly what to write.
 */
export function hasStopLanguage(body: string | null | undefined): boolean {
  if (!body) return false;
  return /\bSTOP\b/.test(body);
}

/**
 * Validation message for a campaign body, or null when it is acceptable.
 *
 * Returns a string rather than a boolean so every call site shows the same wording —
 * three dialogs disagreeing about why a save was refused is its own small confusion.
 */
export function stopComplianceError(body: string | null | undefined): string | null {
  if (!body || !body.trim()) {
    return 'Message body is required.';
  }
  if (!hasStopLanguage(body)) {
    return `Marketing texts must tell people how to opt out. Add "${STOP_SENTENCE}" (STOP in capitals) to the end of your message.`;
  }
  return null;
}

/**
 * Append the opt-out sentence if it is missing. Used by the "Fix it for me" action.
 *
 * Returns the body unchanged when it already complies, so it is safe to call twice
 * and will not stack duplicate sentences.
 */
export function withStopSentence(body: string): string {
  if (hasStopLanguage(body)) return body;
  const trimmed = body.trimEnd();
  if (!trimmed) return STOP_SENTENCE;
  const needsSpace = !/[.!?]$/.test(trimmed);
  return `${trimmed}${needsSpace ? '.' : ''} ${STOP_SENTENCE}`;
}
