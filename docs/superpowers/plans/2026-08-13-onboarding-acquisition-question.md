# Onboarding Acquisition Question — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask "How did you hear about us?" during onboarding, and persist all five qualifying answers to the organization so they survive the session and can be reported on.

**Architecture:** One `jsonb` column on `organizations`, written in the existing org-creation insert. The answer shape changes from `string` to `string[]` (multi-select), so all four existing consumers move onto one pure, tested module rather than reading the raw object.

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres + Deno edge functions), `node:test` for unit tests.

**Status:** Plan and spec written 2026-08-13. **Nothing implemented.** Spec is RED.

---

## Global Constraints

- **Forward-looking only. No backfill.** Existing orgs keep a null column. Nothing reads history, nothing infers a source for an org that predates this.
- **`supabase/` is Lovable's.** The migration (Task 1) and the edge-function change (Task 6) ship as paste-ready prompts, not edits. Everything in `src/` is ours.
- **The new question's six options, exactly:** Facebook ad, Facebook group, TikTok, Google search, Friend or referral, Other → values `fb_ad`, `fb_group`, `tiktok`, `google`, `referral`, `other`.
- **All five questions become multi-select with a Continue button.** Tap-to-auto-advance is removed.
- `totalSteps` 6 → 7.
- No `Set` or `Map` in anything persisted — CLAUDE.md rule 1. The payload is plain arrays.
- Verify with `npx tsc --noEmit -p tsconfig.app.json` — **the `-p` flag is not optional**, a bare `tsc` compiles zero files.

---

## The hazard that dictates task order

`organizations.onboarding_answers` does not exist yet. The moment `OnboardingPage` includes that key in its insert, PostgREST rejects the whole statement (`PGRST204`, unknown column) and **org creation fails for every new signup** — the single most critical path in the product.

So the order is not a preference:

1. **Task 1 (Lovable) — migration lands and is verified live.**
2. Only then may Task 4 ship.

There is a tempting alternative — write the column in a separate `update` after the insert, wrapped in `try/catch`, so a missing column loses the answer instead of breaking signup. **Rejected.** That is CLAUDE.md rule 5 exactly: it converts "the schema is wrong" into "the data silently isn't there", discovered weeks later when the Signups tab is empty. One insert, correct ordering, loud failure.

---

## File Structure

| File | Owner | Responsibility |
|---|---|---|
| `supabase/migrations/<new>.sql` | **Lovable** | Add `onboarding_answers jsonb` to `organizations` |
| `src/lib/onboardingAnswers.ts` | us | **Create.** Pure logic: shape normalisation, plan recommendation, copy pickers, DB payload. Zero imports. |
| `src/lib/onboardingAnswers.test.ts` | us | ✅ **Written — 21 tests, RED verified** |
| `src/pages/OnboardingPage.tsx` | us | Fifth question, multi-select + Continue, `totalSteps` 7, write the column |
| `src/pages/ChoosePlanPage.tsx` | us | Consume the module instead of reading the raw object |
| `supabase/functions/platform-analytics/index.ts` | **Lovable** | Return the field on each signup row |
| `src/pages/admin/PlatformAnalyticsPage.tsx` | us | Show it on the Signups tab |

Why a separate pure module rather than fixing the two pages in place: the four broken consumers are all *expressions inside JSX*, and `vitest` is not installed, so a component test is not available. Extracting the decisions is what makes them assertable at all — the same pattern as `src/lib/emailSenderResolution.ts` and the 14 other `node:test` specs in `src/lib/`.

---

## Task 1 — the column (LOVABLE)

**Files:** Create one migration.

- [ ] **Step 1: Write a paste prompt to `docs/superpowers/prompts/`** containing:

```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_answers jsonb;

COMMENT ON COLUMN public.organizations.onboarding_answers IS
  'Onboarding qualifying answers, captured once at org creation. Shape: {teamSize:[],bookingMethod:[],biggestPain:[],revenueGoal:[],howHeard:[]}. Forward-looking only — null for orgs created before 2026-08-13.';
```

- [ ] **Step 2: No new RLS policy.** `organizations` already has policies; the column inherits them. Do NOT add one — say so explicitly in the prompt, because an added policy on this table is exactly the kind of collateral change CLAUDE.md warns about.
- [ ] **Step 3: Verify live, not from the file.** CLAUDE.md rule 4 — a migration existing is not proof it ran:

```
GET /rest/v1/organizations?select=id,onboarding_answers&limit=1
  200               -> column exists
  400 + 42703       -> column missing, DO NOT SHIP TASK 4
```

Run a deliberately fake column name as a control to confirm which error you are looking at.

---

## Task 2 — the pure module

**Files:** Create `src/lib/onboardingAnswers.ts`; Test `src/lib/onboardingAnswers.test.ts` ✅ written

- [ ] **Step 1: Add throwing stubs for all seven exports, then watch 21 tests fail individually.**

The spec currently fails as **one** error, not 21: a static named import of a missing module is a link-time failure, so `node:test` collects zero tests. That is a real RED but it cannot distinguish 21 wired tests from a typo in the import. Stubs first — the same lesson as `_shared/facebook-lead-mapping.ts`.

```bash
node --experimental-strip-types --test src/lib/onboardingAnswers.test.ts
# expect: tests 21, fail 21
```

- [ ] **Step 2: Implement.** Zero imports, no DOM, no `sessionStorage` access inside the module — the caller reads storage and passes the parsed value in, which is what keeps it testable.

**Interfaces — Produces:**

```ts
export const QUALIFYING_KEYS = ['teamSize','bookingMethod','biggestPain','revenueGoal','howHeard'] as const;
export type QualifyingKey = typeof QUALIFYING_KEYS[number];
export type OnboardingAnswers = Record<QualifyingKey, string[]>;

export const HOW_HEARD_VALUES = ['fb_ad','fb_group','tiktok','google','referral','other'] as const;

export function normalizeAnswers(raw: unknown): OnboardingAnswers;
export function recommendPlan(a: OnboardingAnswers): 'basic' | 'pro' | 'custom';
export function primaryPain(a: OnboardingAnswers): string | null;
export function hasAnswer(v: string[] | undefined): boolean;
export function buildAnswersPayload(a: OnboardingAnswers): Record<QualifyingKey, string[]>;
```

**The recommendation rules**, which multi-select forces us to state rather than infer:

| Condition | Plan |
|---|---|
| `teamSize` includes `large` **or** `revenueGoal` includes `50k` | `custom` |
| `teamSize` ⊆ `{solo}` **and** `revenueGoal` ⊆ `{5k}` | `basic` |
| otherwise | `pro` |

The middle row is subset containment, not `.includes()`. Someone who ticks both "Just me" and "5-15 cleaners" has told you the larger number; selling them the smallest plan on the strength of the smaller tick is wrong. The spec pins this twice — once as a case, once as the invariant *adding a selection never lowers the recommendation*.

`primaryPain` returns the first selected pain **in canonical option order**, not tap order, so the same answers always produce the same copy.

- [ ] **Step 3: 21/21 green.** Then `grep -c '^import' src/lib/onboardingAnswers.ts` must return 0.
- [ ] **Step 4: Commit.**

---

## Task 3 — multi-select UI

**Files:** Modify `src/pages/OnboardingPage.tsx`

- [ ] **Step 1: Add the fifth question** as the last entry in `QUALIFYING_QUESTIONS` (`:67-112`):

```ts
{
  key: 'howHeard',
  title: 'How did you hear about us?',
  description: 'Pick any that apply',
  options: [
    { value: 'fb_ad',    label: 'Facebook ad' },
    { value: 'fb_group', label: 'Facebook group' },
    { value: 'tiktok',   label: 'TikTok' },
    { value: 'google',   label: 'Google search' },
    { value: 'referral', label: 'Friend or referral' },
    { value: 'other',    label: 'Other' },
  ],
},
```

Last, not earlier: the comment at `:49-54` documents a deliberate arc — self-identification → pain → agitation → aspiration — so the user has articulated *why* they need this by the time they hit the paywall. This question serves us, not them. Putting it mid-arc interrupts the only part of onboarding that is doing persuasive work.

- [ ] **Step 2: Widen the answer state.** `useState<Record<string,string>>` (`:131`) becomes `Record<string,string[]>`.
- [ ] **Step 3: Replace auto-advance with toggle + Continue.** `selectQualifyingOption` (`:486-494`) currently sets one value, flashes, and advances after 280ms. It becomes a toggle:

```ts
const toggleQualifyingOption = (key: string, value: string) => {
  setAnswers((prev) => {
    const current = prev[key] ?? [];
    return { ...prev, [key]: current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value] };
  });
};
```

Delete the `flashValue` state and its 280ms timer — with no auto-advance there is nothing to acknowledge, the checked state is the acknowledgement. Selection styling at `:669` moves from `answers[key] === opt.value || flashValue === opt.value` to `answers[key]?.includes(opt.value)`.

- [ ] **Step 4: Add the Continue button** under each question's cards, enabled only when that question has ≥1 selection. This is a **new blocking gate** — auto-advance meant a question could never be passed unanswered, and a Continue button that permits an empty answer would quietly make every question optional. Decide deliberately; the spec assumes required (it distinguishes "unanswered" from "not asked").
- [ ] **Step 5: `totalSteps = 6` → `7`** (`:482`), and `currentQuestion` (`:483-484`) becomes `step >= 2 && step <= 6 ? QUALIFYING_QUESTIONS[step - 2] : null`. The service-selection screen moves from step 6 to step 7 — grep for `step === 6` and update. The progress dots at `:589-599` derive from `totalSteps` and need no change.
- [ ] **Step 6: Fix the silent consumer at `:531`.** `PAIN_BUILD_LINE[answers.biggestPain]` becomes `PAIN_BUILD_LINE[primaryPain(normalizeAnswers(answers)) ?? '']`. Left alone it returns `undefined` for an array and silently renders the fallback line.
- [ ] **Step 7: Typecheck + lint.**

---

## Task 4 — persist the answers

**Files:** Modify `src/pages/OnboardingPage.tsx:332-338`

> **BLOCKED until Task 1 verifies live.** See "The hazard that dictates task order".

- [ ] **Step 1: Add the column to the existing insert.** Not a follow-up update:

```ts
const { data, error } = await supabase
  .from('organizations')
  .insert({
    name,
    owner_id: user.id,
    slug,
    onboarding_answers: buildAnswersPayload(normalizeAnswers(answers)),
  })
  .select()
  .single();
```

This sits inside the 3-attempt slug-collision retry loop (`:329-345`), so the payload is built once outside the loop rather than rebuilt per attempt.

- [ ] **Step 2: Leave the sessionStorage write at `:451-456` in place.** `/choose-plan` still reads it, and it carries `businessName`, which is not part of the DB payload. Two sinks, one source.
- [ ] **Step 3: Verify one real signup writes non-null JSON**, and that its five keys match what was clicked.

---

## Task 5 — unbreak the paywall

**Files:** Modify `src/pages/ChoosePlanPage.tsx:106-128, 169, 361`

This is the task that must not be deferred. Every one of these fails *silently* on the new shape — nothing throws, the page renders, and the damage is invisible.

- [ ] **Step 1: Delete the local `OnboardingAnswers` interface, `readAnswers`, and `recommendPlan` (`:106-128`)** and import from the module. Keep `PAIN_PITCH` where it is — it is copy, not logic.
- [ ] **Step 2: `readAnswers` becomes** `normalizeAnswers(JSON.parse(sessionStorage.getItem('tw_onboarding_answers') ?? 'null'))`, keeping the existing try/catch.
- [ ] **Step 3: `:169`** — `PAIN_PITCH[personal.biggestPain]` → `const pain = primaryPain(personal); const painPitch = pain ? PAIN_PITCH[pain] : null;`
- [ ] **Step 4: `:361`** — `personal.teamSize ? 'Recommended for you' : 'Most popular'` → `hasAnswer(personal.teamSize) ? ...`. **An empty array is truthy**, so left alone this claims a personalised recommendation for someone who answered nothing.
- [ ] **Step 5: `:311-312`** — `personal.businessName` still comes from sessionStorage and is still a plain string. `normalizeAnswers` drops unknown keys, so read it separately rather than expecting it on the normalised object.
- [ ] **Step 6: Typecheck, lint, and re-run the spec.**

---

## Task 6 — surface it (LOVABLE + us)

**Files:** Modify `supabase/functions/platform-analytics/index.ts:105`; then `src/pages/admin/PlatformAnalyticsPage.tsx`

- [ ] **Step 1 (Lovable prompt):** the signup enrichment already embeds the org. One field:

```ts
// :103-106, was: .select('user_id, role, organization:organizations(id, name)')
.select('user_id, role, organization:organizations(id, name, onboarding_answers)')
```

then carry it into the pushed row at `:140-145` as `onboarding_answers: orgInfo?.onboarding_answers ?? null`, and set the same on the `orgMap` entry at `:121`. **Do not** add a second query — the join is already there. Leave the `staff` branch at `:127-136` alone; staff signups have no onboarding answers by definition.

- [ ] **Step 2 (ours):** render it on the Signups tab rows (`:920-922`). Null for every pre-existing org is expected and correct — forward-looking only.
- [ ] **Step 3:** a count-by-source summary is **out of scope** for this plan. Note it and stop.

---

## Verification

- [ ] `node --experimental-strip-types --test src/lib/onboardingAnswers.test.ts` — 21/21
- [ ] `npx tsc --noEmit -p tsconfig.app.json` — with the flag
- [ ] `npm run lint`
- [ ] One real signup end-to-end: five questions answered multi-select, Continue works at each, org created, `onboarding_answers` non-null and correct, `/choose-plan` shows the right recommended tier and the pain pitch.
- [ ] **The regression that matters most:** a signup answering `solo` + `5k` must still land on `basic`, and `large` must still land on `custom`. The 25-combination legacy test covers this in code; confirm once in the browser too.

---

## Self-review

**Scope coverage.** jsonb column written in the same insert ✓ (Tasks 1, 4). Fifth question with the six given options, placed last ✓ (Task 3). `totalSteps` 6→7 ✓. All five multi-select with Continue ✓. `ChoosePlanPage` updated in the same change ✓ (Task 5 — and it found four broken consumers, not the one in the brief: `:125`, `:169`, `:361`, plus `OnboardingPage:531`). `platform-analytics` returns the field ✓ (Task 6). No backfill anywhere ✓.

**Deliberate additions, flag if unwanted.** (a) `normalizeAnswers` accepts the legacy string shape, so a user mid-onboarding across the deploy does not lose their answers — without it the shape change silently resets them. (b) Unknown keys are dropped before the DB write, because sessionStorage is user-writable and the payload goes into jsonb verbatim otherwise. Neither was asked for; both are one-line consequences of the shape change.

**Deliberately excluded.** No version field in the payload — the column comment records the shape, and a `v: 1` nobody reads is cargo. No count-by-source dashboard. No backfill. No change to `PAIN_PITCH`/`PAIN_BUILD_LINE` copy.

**Open decision for a human, Task 3 Step 4.** Auto-advance made every question implicitly required. A Continue button can permit an empty answer. Required keeps the data clean and matches the spec's "unanswered vs never-asked" distinction; optional respects that `howHeard` is our question, not theirs, and reduces friction before a paywall. I have assumed **required** and flagged it rather than deciding it — it changes completion rates, which is a product call.

**Unverified.** Whether `organizations` has an INSERT policy that enumerates permitted columns — if it does, Task 1 must extend it or the insert fails RLS rather than schema. CLAUDE.md records Lovable rewriting an `org_memberships` INSERT policy unprompted, so this is worth one live check before Task 4, not an assumption.

**Left over, not part of this plan.** `PlatformAnalyticsPage` is guarded by `AdminRoute`, not `PlatformAdminRoute` (`App.tsx:378`), and I found no internal platform-admin check in the page, while the `platform-analytics` function it calls runs on the service-role key and returns every org's data. Task 6 puts more per-org data behind that guard, which raises the stakes but does not create the issue. Its own item, after this.
