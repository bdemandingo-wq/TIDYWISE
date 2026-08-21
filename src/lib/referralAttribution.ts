/**
 * Referral attribution capture.
 *
 * A referral link is `https://jointidywise.com/?ref=ABC23456`. The code has to
 * survive the whole journey from that landing to the moment an organization
 * row exists, which is when the server can finally be asked to record who
 * referred whom. That gap is why this holds the code in storage rather than
 * passing it through the signup form.
 *
 * THE CLIENT NEVER RECORDS ATTRIBUTION. It only carries the code. The decision
 * about which org gets credit, whether the pair is a self-referral, and what
 * status the referral takes is made server-side by the `claim-referral` edge
 * function on the service role — because `organizations`' INSERT policy is
 * `(auth.uid() = owner_id)` with no column enumeration, so anything a client
 * can write, a client can forge.
 *
 * Storage is injected so the rules are testable without a DOM. Production
 * passes nothing and gets localStorage.
 */

import { normalizeReferralCode } from './referralCode.ts';

/** The slice of the Storage API this needs. */
export interface ReferralStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'tw-referral-code';

/**
 * localStorage when it exists, and a no-op otherwise so this module is safe to
 * import during SSR, in tests, and in any context without a window.
 */
function defaultStorage(): ReferralStorage {
  if (typeof localStorage !== 'undefined') return localStorage;
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

/**
 * Pull `ref` out of a query string and normalise it. Accepts the string with
 * or without its leading `?`. Returns null when there is nothing usable, so a
 * malformed code is indistinguishable from no code — both mean "no referral".
 */
export function extractReferralFromSearch(search: string): string | null {
  const qs = search.startsWith('?') ? search.slice(1) : search;
  return normalizeReferralCode(new URLSearchParams(qs).get('ref'));
}

/**
 * Record the code from a landing URL. FIRST TOUCH WINS: an existing capture is
 * never overwritten, so someone who clicks A's link, browses, then arrives via
 * B's link before signing up is still attributed to A.
 *
 * Never throws. Safari in private browsing throws on setItem, and losing an
 * attribution is a support ticket where taking down the landing page is not.
 */
export function captureReferralFromUrl(
  search: string,
  storage: ReferralStorage = defaultStorage(),
): void {
  const code = extractReferralFromSearch(search);
  if (!code) return;

  try {
    if (normalizeReferralCode(storage.getItem(KEY))) return; // first touch wins
    storage.setItem(KEY, code);
  } catch {
    // Storage unavailable or denied. No attribution, no crash.
  }
}

/**
 * The captured code, or null. Re-normalised on the way out because
 * localStorage is user-editable and a hand-edited value must not reach the
 * server as though it were a real code.
 */
export function readCapturedReferral(
  storage: ReferralStorage = defaultStorage(),
): string | null {
  try {
    return normalizeReferralCode(storage.getItem(KEY));
  } catch {
    return null;
  }
}

/**
 * Drop the capture. Call this once `claim-referral` has accepted (or finally
 * rejected) the code.
 *
 * Not housekeeping — correctness. Left in place, the same browser creating a
 * SECOND organization would attribute that one to the same referrer as well,
 * earning an extra free month per org from a single link click.
 */
export function clearCapturedReferral(
  storage: ReferralStorage = defaultStorage(),
): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // Nothing to do; a stale capture is bounded by org_referrals' UNIQUE
    // constraint on referred_org_id server-side.
  }
}
