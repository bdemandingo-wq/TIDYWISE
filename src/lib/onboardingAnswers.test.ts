// Onboarding qualifying answers — shape, persistence payload, and the plan
// recommendation derived from them.
//
// Runner: node:test (vitest is not installed in this repo; 15 other specs in
// src/lib use this same runner). The module under test must have ZERO imports:
//
//   node --experimental-strip-types --test src/lib/onboardingAnswers.test.ts
//
// WHY THIS MODULE EXISTS. Onboarding asks four qualifying questions and throws
// every answer away — they go to sessionStorage and are read once by
// /choose-plan. This change adds a fifth question ("How did you hear about
// us?"), persists all five to organizations.onboarding_answers, and turns every
// question multi-select.
//
// That last part is what makes a spec necessary rather than nice-to-have. The
// answers change shape from string to string[], and EVERY existing consumer
// fails silently on the new shape:
//
//   ChoosePlanPage:125  a.teamSize === 'large'      -> false for ['large']
//   ChoosePlanPage:169  PAIN_PITCH[a.biggestPain]   -> undefined for an array
//   ChoosePlanPage:361  personal.teamSize ? ... : ..-> [] is TRUTHY, so an
//                                                      unanswered question
//                                                      reads as answered
//   OnboardingPage:531  PAIN_BUILD_LINE[...]        -> undefined, silent fallback
//
// Not one of those throws. The page renders, everyone quietly gets 'pro', and
// the personalised copy quietly disappears. Pulling the logic into one pure
// module is what makes those four cases assertable at all.
//
// See docs/superpowers/plans/2026-08-13-onboarding-acquisition-question.md
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUALIFYING_KEYS,
  HOW_HEARD_VALUES,
  normalizeAnswers,
  recommendPlan,
  primaryPain,
  hasAnswer,
  buildAnswersPayload,
  type OnboardingAnswers,
} from "./onboardingAnswers.ts";

/** Rank for the monotonicity invariant. Bigger = more expensive plan. */
const RANK: Record<string, number> = { basic: 0, pro: 1, custom: 2 };

// ─── the shape boundary ─────────────────────────────────────────────────────
// normalizeAnswers is the ONLY place the outside world's untrusted shape turns
// into the internal one. sessionStorage is user-writable and survives a deploy,
// so it can legitimately hold yesterday's format.

test("a legacy single-string answer is read as a one-element array", () => {
  // The deploy-window case, and the reason this cannot just be a cast: a user
  // part-way through onboarding when the new build ships has the OLD shape
  // sitting in sessionStorage. Dropping it would silently reset their answers.
  const r = normalizeAnswers({ teamSize: "solo", revenueGoal: "5k" });
  assert.deepEqual(r.teamSize, ["solo"]);
  assert.deepEqual(r.revenueGoal, ["5k"]);
});

test("an array answer passes through and non-strings inside it are dropped", () => {
  const r = normalizeAnswers({ teamSize: ["solo", 42, null, "mid"] });
  assert.deepEqual(r.teamSize, ["solo", "mid"]);
});

test("every key is always present as an array, never undefined", () => {
  // Consumers index these directly. One undefined turns a .includes() into a
  // TypeError at the paywall — the single worst place in the funnel to throw.
  const r = normalizeAnswers({});
  for (const k of QUALIFYING_KEYS) {
    assert.ok(Array.isArray(r[k]), `${k} should be an array, got ${typeof r[k]}`);
    assert.equal(r[k].length, 0);
  }
});

test("garbage input yields empty answers rather than throwing", () => {
  for (const junk of [null, undefined, "nonsense", 7, [], true]) {
    const r = normalizeAnswers(junk);
    assert.equal(r.teamSize.length, 0, `failed on ${JSON.stringify(junk)}`);
  }
});

test("unknown keys are dropped, not carried into the database", () => {
  // The normalised object is what gets written to organizations.onboarding_answers.
  // Anything sessionStorage happens to contain would otherwise be persisted
  // verbatim, and sessionStorage is user-writable.
  const r = normalizeAnswers({ teamSize: ["solo"], evil: ["x"], businessName: "Acme" });
  assert.deepEqual(Object.keys(r).sort(), [...QUALIFYING_KEYS].sort());
});

// ─── the new question ───────────────────────────────────────────────────────

test("howHeard is one of the five qualifying keys", () => {
  assert.ok(QUALIFYING_KEYS.includes("howHeard"));
  assert.equal(QUALIFYING_KEYS.length, 5);
});

test("howHeard offers exactly the six agreed options", () => {
  assert.deepEqual(
    [...HOW_HEARD_VALUES],
    ["fb_ad", "fb_group", "tiktok", "google", "referral", "other"],
  );
});

// ─── recommendPlan: no silent change for existing behaviour ─────────────────

test("every legacy single-answer combination recommends exactly what it did before", () => {
  // The regression guard. This reimplements the ORIGINAL ChoosePlanPage:124-128
  // and asserts the new array-aware version agrees on all 25 combinations of the
  // old shape. If this fails, the shape migration changed what real users are
  // sold — the exact silent failure this module exists to prevent.
  const legacy = (teamSize?: string, revenueGoal?: string) => {
    if (teamSize === "large" || revenueGoal === "50k") return "custom";
    if (teamSize === "solo" && revenueGoal === "5k") return "basic";
    return "pro";
  };
  const teamSizes = [undefined, "solo", "small", "mid", "large"];
  const goals = [undefined, "5k", "10k", "25k", "50k"];
  for (const t of teamSizes) {
    for (const g of goals) {
      const raw: Record<string, string> = {};
      if (t) raw.teamSize = t;
      if (g) raw.revenueGoal = g;
      assert.equal(
        recommendPlan(normalizeAnswers(raw)),
        legacy(t, g),
        `teamSize=${t} revenueGoal=${g}`,
      );
    }
  }
});

test("no answers at all still defaults to pro", () => {
  assert.equal(recommendPlan(normalizeAnswers({})), "pro");
});

// ─── recommendPlan: the multi-select rules ──────────────────────────────────

test("a large team anywhere in the selection recommends custom", () => {
  assert.equal(recommendPlan(normalizeAnswers({ teamSize: ["solo", "large"] })), "custom");
});

test("a 50k goal anywhere in the selection recommends custom", () => {
  assert.equal(recommendPlan(normalizeAnswers({ revenueGoal: ["5k", "50k"] })), "custom");
});

test("solo and 5k alone still recommends basic", () => {
  assert.equal(
    recommendPlan(normalizeAnswers({ teamSize: ["solo"], revenueGoal: ["5k"] })),
    "basic",
  );
});

test("solo PLUS a bigger team size does not get downgraded to basic", () => {
  // The rule multi-select makes necessary: someone who ticks both "just me" and
  // "5-15 cleaners" has told you they are the larger of the two. Selling them
  // the smallest plan on the strength of the smaller tick is the wrong answer.
  assert.equal(
    recommendPlan(normalizeAnswers({ teamSize: ["solo", "mid"], revenueGoal: ["5k"] })),
    "pro",
  );
});

test("adding a selection NEVER lowers the recommendation", () => {
  // The invariant behind the two tests above, stated once so it holds for
  // combinations nobody enumerated. Ticking one more box can move you up a plan
  // or leave you where you are; it must never move you down.
  const base: Record<string, string[]> = { teamSize: ["solo"], revenueGoal: ["5k"] };
  const additions: Array<[string, string]> = [
    ["teamSize", "small"], ["teamSize", "mid"], ["teamSize", "large"],
    ["revenueGoal", "10k"], ["revenueGoal", "25k"], ["revenueGoal", "50k"],
  ];
  const before = RANK[recommendPlan(normalizeAnswers(base))];
  for (const [key, value] of additions) {
    const grown = { ...base, [key]: [...base[key], value] };
    const after = RANK[recommendPlan(normalizeAnswers(grown))];
    assert.ok(after >= before, `adding ${key}=${value} dropped the plan (${after} < ${before})`);
  }
});

test("the other three questions do not affect the recommendation", () => {
  // howHeard especially: it is an attribution question for us, not a signal
  // about them, and it must not move what they are sold.
  const withNoise = normalizeAnswers({
    teamSize: ["solo"], revenueGoal: ["5k"],
    bookingMethod: ["manual", "dms"], biggestPain: ["everything"], howHeard: ["fb_ad", "tiktok"],
  });
  assert.equal(recommendPlan(withNoise), "basic");
});

// ─── copy pickers ───────────────────────────────────────────────────────────

test("primaryPain picks by canonical option order, not by tap order", () => {
  // PAIN_PITCH and PAIN_BUILD_LINE are keyed by ONE pain. With multi-select the
  // pick has to be deterministic, or the same answers produce different copy on
  // different runs depending on which card was tapped first.
  const a = normalizeAnswers({ biggestPain: ["everything", "scheduling"] });
  const b = normalizeAnswers({ biggestPain: ["scheduling", "everything"] });
  assert.equal(primaryPain(a), primaryPain(b));
  assert.equal(primaryPain(a), "scheduling");
});

test("primaryPain returns null when nothing was selected", () => {
  // Must be null, not undefined and not "", so the caller's `? :` falls through
  // to the default line rather than rendering an empty pitch.
  assert.equal(primaryPain(normalizeAnswers({})), null);
});

// ─── the truthiness trap ────────────────────────────────────────────────────

test("hasAnswer is false for an empty selection", () => {
  // ChoosePlanPage:361 does `personal.teamSize ? 'Recommended for you' : 'Most
  // popular'`. An empty ARRAY is truthy, so after this change that line would
  // claim a recommendation is personalised for someone who answered nothing.
  const a = normalizeAnswers({});
  assert.equal(hasAnswer(a.teamSize), false);
  assert.equal(hasAnswer(normalizeAnswers({ teamSize: ["solo"] }).teamSize), true);
});

// ─── what gets written to the database ──────────────────────────────────────

test("the payload carries all five keys even when unanswered", () => {
  // A missing key and an unanswered key must be distinguishable later. If
  // unanswered questions were omitted, a future query could not tell "skipped"
  // from "asked before this question existed".
  const payload = buildAnswersPayload(normalizeAnswers({ howHeard: ["tiktok"] }));
  for (const k of QUALIFYING_KEYS) {
    assert.ok(k in payload, `${k} missing from payload`);
  }
  assert.deepEqual(payload.howHeard, ["tiktok"]);
  assert.deepEqual(payload.teamSize, []);
});

test("the payload is JSON-round-trippable", () => {
  // It goes into a jsonb column. A Set or Map here would survive in memory and
  // arrive as {} in Postgres — the same class of bug as the persisted-query-cache
  // rule in CLAUDE.md.
  const payload = buildAnswersPayload(
    normalizeAnswers({ teamSize: ["solo"], howHeard: ["fb_ad", "other"] }),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
});

test("buildAnswersPayload does not mutate its input", () => {
  const a: OnboardingAnswers = normalizeAnswers({ teamSize: ["solo"] });
  const snapshot = JSON.parse(JSON.stringify(a));
  buildAnswersPayload(a);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), snapshot);
});
