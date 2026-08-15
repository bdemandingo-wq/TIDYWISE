/**
 * Phone normalisation — TWO functions, because there are two different jobs and
 * merging them breaks one of the callers.
 *
 *   phoneMatchKey()  "are these the same person?"   -> last 10 digits
 *   toE164()         "what do we put in `to`?"      -> +E.164, or null
 *
 * `+1 (813) 555-1234` and `813-555-1234` are the SAME person but only one is a
 * valid send address, so the two rules must stay separate.
 *
 * KEEP IN SYNC: this is a verbatim copy of `src/lib/phone.ts` below this header.
 * That copy is canonical and is what src/lib/phone.test.ts tests.
 *
 * WHY toE164 RETURNS NULL RATHER THAN A BEST EFFORT. The code this replaces
 * (notify-new-lead, step 12) only guarded the 10-digit case, so a 9-digit number
 * became "+405252227", an empty string became "+", and an Australian mobile in
 * national format became "+10409206947". A null the caller can log beats a
 * malformed address the vendor rejects for reasons nobody records.
 */

/** Digits only. Tolerates null, undefined and anything non-string. */
function digitsOf(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '');
}

/**
 * NANP national number: area code and exchange code both start 2-9.
 * This is what rejects the Australian 04xx numbers rather than prefixing "1".
 */
const NANP_NATIONAL = /^[2-9]\d{2}[2-9]\d{6}$/;

/**
 * The MATCH KEY. Last 10 digits, or null when there are fewer than 10.
 *
 * Behaviourally identical to the private normalizePhone() that Task 2 deletes
 * from marketing-guard.ts — src/lib/phone.test.ts pins that equivalence against
 * a copy of the old body, so the swap is a provable no-op.
 *
 * Last 10 rather than full E.164 on purpose: it makes "+1 813…", "813…" and
 * "1813…" one key, which is the whole point of a dedupe.
 */
export function phoneMatchKey(raw: string | null | undefined): string | null {
  const digits = digitsOf(raw);
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * The SEND ADDRESS. Strict E.164, or null when the input cannot be one.
 *
 * NANP numbers (US, Canada, Caribbean) are validated and given +1. Numbers that
 * already carry some other country code pass through untouched — the live data
 * holds Australian leads as both `61475442420` and `+610459046970`, and those
 * work under the old code, so narrowing this to NANP-only would have silently
 * stopped texting that org.
 */
export function toE164(raw: string | null | undefined): string | null {
  const digits = digitsOf(raw);

  // Bare NANP national number.
  if (digits.length === 10) {
    return NANP_NATIONAL.test(digits) ? `+1${digits}` : null;
  }

  // NANP with its country code already on the front.
  if (digits.length === 11 && digits.startsWith('1')) {
    const national = digits.slice(1);
    return NANP_NATIONAL.test(national) ? `+1${national}` : null;
  }

  // Already carries a non-NANP country code. E.164 allows up to 15 digits and
  // no country code begins with 0, which is what rejects "00000000000".
  if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0')) {
    return `+${digits}`;
  }

  return null;
}
