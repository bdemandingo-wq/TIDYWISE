/**
 * One email validator, shared by the sender and both CSV importers.
 *
 * WHY IT IS NOT THE OBVIOUS REGEX
 *
 * process-migration-import used to validate with:
 *
 *     /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 *
 * which passes `chefbschrank@gmail.com+15615830771`. `[^\s@]+` after the dot
 * accepts anything without a space or an at-sign, so a phone number
 * concatenated onto a TLD satisfies it. That value was imported, stored as a
 * customer's email, and every booking confirmation to that customer failed —
 * Gmail returned "No valid emails provided!", Resend returned "Invalid `to`
 * field", and both were right. It failed silently from February.
 *
 * Anchoring the TLD on letters is the fix. It is not a full RFC 5322 parser and
 * is not trying to be: the job is to reject values that are obviously not
 * addresses before they are stored, not to adjudicate exotic-but-legal ones.
 */
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

/**
 * Split a stored email field into deliverable addresses.
 *
 * Nine customers typed comma-separated addresses into a single-value field —
 * accounts plus a person, property-management teams — wanting mail to reach
 * two or three inboxes. Stored as one string it reached Resend as one
 * malformed address and the whole send failed, so none of them received
 * anything rather than some of them.
 *
 * Invalid parts are DROPPED, not fatal. A list of three addresses where one has
 * a typo should still deliver to the other two: partial delivery beats a silent
 * total failure, which is the behaviour being replaced. The caller can compare
 * lengths if it needs to report what was skipped.
 */
export function parseRecipients(value: string | string[] | undefined | null): string[] {
  if (!value) return [];
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  // Deduplicated: the same address twice in `to` makes some providers reject
  // the whole message, and none of them deliver it twice usefully.
  return [...new Set(parts.filter(isValidEmail))];
}
