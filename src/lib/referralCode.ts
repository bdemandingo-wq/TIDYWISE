/**
 * Referral codes for the org-to-org referral programme.
 *
 * TWO functions, and they are not inverses of each other:
 *
 *   generateReferralCode()  mints the code an org shares
 *   normalizeReferralCode() turns anything a human typed into that code
 *
 * KEEP IN SYNC: `supabase/functions/_shared/referral-code.ts` is a verbatim
 * copy below its header, because the edge functions run in Deno and cannot
 * import from `src/`. Same arrangement as automation-templates.ts and phone.ts.
 * referralCode.test.ts imports both and asserts they agree.
 *
 * WHY NOT JUST SLICE A UUID. A uuid is hex, so it contains 0 and 1 — the two
 * characters most often misread as O and I when a code is read aloud or copied
 * off a screen. A referral code exists to be shared by a human, so the alphabet
 * excludes both pairs. `generateReferralCode` and `normalizeReferralCode` are
 * pinned to agree: a generated code always survives its own normaliser
 * unchanged, or a stored code would never match what someone typed back.
 */

/**
 * Unambiguous alphabet — no O/0, no I/1. 32 characters, so an 8-character code
 * is 32^8 ≈ 1.1e12 possibilities. Collisions are handled by the UNIQUE
 * constraint on org_referral_codes.code, not by hoping.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CODE_LENGTH = 8;

/**
 * Turn user input into the canonical form. Forgiving on purpose: people paste
 * codes with spaces, hyphens and mixed case out of emails and text messages.
 *
 * Returns null when nothing usable remains, so callers can distinguish "no code
 * supplied" from "a code that happens to normalise to empty".
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length === 0 ? null : cleaned;
}

/**
 * Mint the code for an organization. Deterministic in the seed, which is the
 * organization_id — so re-running the mint is idempotent rather than issuing a
 * second code for an org that already has one.
 *
 * FNV-1a, then one round of mixing per output character. Not a cryptographic
 * hash and not trying to be: organization_id is not public, and the worst case
 * for a guessed code is that someone credits a referral to an org that did not
 * earn it — which the self-referral and vesting checks still gate.
 */
export function generateReferralCode(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    h = Math.imul(h ^ (h >>> 13), 16777619);
    out += ALPHABET[Math.abs(h) % ALPHABET.length];
  }
  return out;
}
