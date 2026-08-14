/**
 * Onboarding qualifying answers — shape, plan recommendation, and DB payload.
 *
 * Deliberately ZERO imports and no browser globals, so `node:test` can load it
 * directly. Tests: src/lib/onboardingAnswers.test.ts
 *
 * WHY THIS EXISTS. Onboarding asks qualifying questions whose answers were
 * `string`. Making them multi-select turns them into `string[]`, and every
 * existing consumer breaks SILENTLY on that change — nothing throws, the page
 * renders, and the damage is invisible:
 *
 *   ChoosePlanPage:125  a.teamSize === 'large'       false for ['large']
 *   ChoosePlanPage:169  PAIN_PITCH[a.biggestPain]    undefined for an array
 *   ChoosePlanPage:361  personal.teamSize ? x : y    [] is TRUTHY
 *   OnboardingPage:531  PAIN_BUILD_LINE[...]         undefined, silent fallback
 *
 * Those live inside JSX and vitest is not installed, so they were untestable
 * where they sat. Moving the decisions here is what makes them assertable.
 *
 * See docs/superpowers/plans/2026-08-13-onboarding-acquisition-question.md
 */

/** The five qualifying questions, in the order they are asked. */
export const QUALIFYING_KEYS = [
  "teamSize",
  "bookingMethod",
  "biggestPain",
  "revenueGoal",
  "howHeard",
] as const;

export type QualifyingKey = (typeof QUALIFYING_KEYS)[number];

/** Every answer is an array — the questions are multi-select. */
export type OnboardingAnswers = Record<QualifyingKey, string[]>;

/** Options for "How did you hear about us?", in display order. */
export const HOW_HEARD_VALUES = [
  "fb_ad",
  "fb_group",
  "tiktok",
  "google",
  "referral",
  "other",
] as const;

/**
 * Canonical pain order — the order the cards are declared in, NOT the order the
 * user tapped them. PAIN_PITCH and PAIN_BUILD_LINE are keyed by one pain, so
 * with multi-select the pick has to be deterministic or the same answers produce
 * different copy on different runs.
 */
const PAIN_ORDER = ["scheduling", "payments", "noshows", "everything"] as const;

/**
 * Turn anything into the internal shape.
 *
 * The only place untrusted input crosses the boundary, and it has two jobs
 * beyond type-narrowing:
 *
 *   1. Accept the LEGACY single-string shape. sessionStorage survives a deploy,
 *      so a user part-way through onboarding when the new build ships still has
 *      `{teamSize: "solo"}` sitting there. Dropping it would silently reset
 *      answers they already gave.
 *   2. Drop unknown keys. The result is written verbatim into a jsonb column and
 *      sessionStorage is user-writable, so anything it happens to contain would
 *      otherwise be persisted.
 */
export function normalizeAnswers(raw: unknown): OnboardingAnswers {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as OnboardingAnswers;
  for (const key of QUALIFYING_KEYS) {
    const value = source[key];
    if (typeof value === "string") {
      out[key] = value ? [value] : [];
    } else if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === "string" && v.length > 0);
    } else {
      out[key] = [];
    }
  }
  return out;
}

/** True when the user actually selected something. `[]` is truthy — this is not. */
export function hasAnswer(v: string[] | undefined): boolean {
  return Array.isArray(v) && v.length > 0;
}

/** Every element of `values` is in `allowed`, and there is at least one. */
function nonEmptySubsetOf(values: string[], allowed: readonly string[]): boolean {
  return values.length > 0 && values.every((v) => allowed.includes(v));
}

/**
 * Which plan to recommend on the paywall.
 *
 * The middle rule is subset containment, not `.includes()`, and that is the whole
 * reason multi-select needed a decision rather than a find-and-replace. Someone
 * who ticks BOTH "Just me" and "5-15 cleaners" has told you the larger number.
 * Selling them the smallest plan on the strength of the smaller tick is wrong.
 *
 * Stated as an invariant, which the spec asserts directly: ticking one more box
 * can move you up a plan or leave you where you are. It must never move you down.
 */
export function recommendPlan(a: OnboardingAnswers): "basic" | "pro" | "custom" {
  if (a.teamSize.includes("large") || a.revenueGoal.includes("50k")) return "custom";
  if (nonEmptySubsetOf(a.teamSize, ["solo"]) && nonEmptySubsetOf(a.revenueGoal, ["5k"])) {
    return "basic";
  }
  return "pro";
}

/**
 * The single pain used for personalised copy, or null when none was selected.
 *
 * Null rather than undefined or "" so a caller's `pain ? PITCH[pain] : null`
 * falls through to the default line instead of rendering an empty pitch.
 */
export function primaryPain(a: OnboardingAnswers): string | null {
  for (const pain of PAIN_ORDER) {
    if (a.biggestPain.includes(pain)) return pain;
  }
  return a.biggestPain[0] ?? null;
}

/**
 * What gets written to organizations.onboarding_answers.
 *
 * All five keys are always present, even when unanswered, so a later query can
 * tell "skipped this question" from "signed up before the question existed" —
 * the second is NULL for the whole column.
 *
 * Plain arrays only. A Set or Map here would survive in memory and arrive in
 * Postgres as `{}` (CLAUDE.md rule 1, same failure as the persisted query cache).
 */
export function buildAnswersPayload(a: OnboardingAnswers): Record<QualifyingKey, string[]> {
  const payload = {} as Record<QualifyingKey, string[]>;
  for (const key of QUALIFYING_KEYS) {
    payload[key] = [...(a[key] ?? [])];
  }
  return payload;
}
