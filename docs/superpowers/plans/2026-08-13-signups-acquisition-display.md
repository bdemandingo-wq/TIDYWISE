# Signups Tab — Acquisition Source Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show where each signup heard about TidyWise on the Platform Analytics Signups tab, with the other four onboarding answers available but secondary — and make the overwhelmingly common "no answers" case read as a stated fact rather than a broken panel.

**Architecture:** All decisions go in the existing pure module `src/lib/onboardingAnswers.ts` (zero imports, `node:test`). `PlatformAnalyticsPage` renders only.

**Tech Stack:** React + TypeScript, shadcn (`Badge`, `Popover`, `Tooltip`), `node:test`.

**Status:** Plan and spec written 2026-08-13. **Nothing implemented.** Spec is RED.

---

## Global Constraints

- **Null is the normal case, not an error state.** The column landed 2026-08-13 and was deliberately never backfilled. Nearly every organisation has `null` and always will.
- **Display only.** No writes, no backfill, no new queries. The data already arrives on each signup row.
- **`src/` only.** `platform-analytics` already returns the field (verified on `origin/main`: 10 occurrences, `onboarding_answers: orgInfo?.onboarding_answers ?? null` at the push). No edge-function work.
- The value arrives typed `unknown` and must be treated as untrusted: null, legacy shapes, and junk all have to render without throwing.
- Verify with `npx tsc --noEmit -p tsconfig.app.json` — **the `-p` flag is not optional**.

---

## The design decision that matters: what "no data" looks like

Three options were considered for a row with no answers:

| Option | Why not / why |
|---|---|
| Render nothing | Indistinguishable from "the feature is broken" or "we forgot to ship it". Rejected — this is exactly the failure the brief names. |
| A loud empty-state per row | ~45 of 47 rows would shout. Turns the normal case into visual noise. Rejected. |
| **A quiet muted `—` in a fixed column, plus one coverage line above the list** | **Chosen.** |

The coverage line is doing the real work: **"2 of 47 signups have acquisition data"** states the absence as a measured fact. A reader who sees that number cannot conclude the panel is broken, because the panel just told them how much data exists. The per-row `—` then keeps the column aligned and reads as "nothing here", with a tooltip explaining *why* — signed up before the question existed.

Put the badge in a **fixed position on the right of the row, before the date badge**. A dash only reads as "no data in this column" if there is visibly a column.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/onboardingAnswers.ts` | **Modify.** Add the admin-facing label vocabulary and five display helpers. Still zero imports. |
| `src/lib/onboardingAnswers.test.ts` | ✅ **Written — 15 new tests appended, 36 total, RED verified** |
| `src/pages/admin/PlatformAnalyticsPage.tsx` | **Modify.** Row type, coverage line, source badge, popover. |

---

## Task 1 — the display helpers

**Files:** Modify `src/lib/onboardingAnswers.ts`; Test `src/lib/onboardingAnswers.test.ts` ✅ written

- [ ] **Step 1: Add throwing stubs for the five new exports, then watch 36 tests fail individually.**

The spec currently fails as **one** link error (`does not provide an export named 'countWithOnboardingData'`), which collects **zero** tests — and that also means the 21 previously-green tests are not running. Stubs first, same as before.

```bash
node --experimental-strip-types --test src/lib/onboardingAnswers.test.ts
# expect: tests 36, fail 15, pass 21
```

- [ ] **Step 2: Implement.** Zero imports; `grep -c '^import'` must stay 0.

**Interfaces — Produces:**

```ts
export const OPTION_LABELS: Record<QualifyingKey, Record<string, string>>;
export const QUESTION_LABELS: Record<QualifyingKey, string>;

export function hasOnboardingData(raw: unknown): boolean;
export function labelForOption(key: QualifyingKey, value: string): string;
export function summariseSource(raw: unknown): { primary: string; extraCount: number } | null;
export function describeAnswers(raw: unknown): Array<{ key: QualifyingKey; question: string; labels: string[] }>;
export function countWithOnboardingData(rows: Array<{ onboarding_answers?: unknown }>): number;
```

Three rules the spec pins, each for a reason:

1. **`hasOnboardingData` is false when all five arrays are empty.** `normalizeAnswers({})` produces exactly that shape, so a structurally-valid-but-empty row must not count — otherwise the coverage number overstates itself, and a number that lies is worse than no number.
2. **`labelForOption` returns the raw slug for an unknown value.** Drift must degrade to something actionable: an admin who sees `fb_reels` knows precisely what to add. An empty badge tells them nothing and looks like a defect.
3. **`summariseSource` picks the primary by canonical option order**, not stored order — the same organisation must not read differently on two page loads.

Admin labels live here and are intentionally **separate** from the wizard's conversational labels in `OnboardingPage`. They serve different surfaces and may legitimately differ. The duplication risk is real and is mitigated by rule 2 rather than pretended away: a value that exists in the wizard but not here renders as its slug rather than vanishing.

- [ ] **Step 3: 36/36 green, eslint clean on the module, 0 imports.**
- [ ] **Step 4: Commit.**

---

## Task 2 — the row type and the coverage line

**Files:** Modify `src/pages/admin/PlatformAnalyticsPage.tsx`

- [ ] **Step 1: Widen the signup row type at `:67`.**

```ts
recent: {
  id: string; email: string; created_at: string;
  org_name?: string | null; org_id?: string | null; role?: string | null;
  onboarding_answers?: unknown;          // jsonb; null for orgs created before 2026-08-13
}[];
```

`unknown`, not a concrete shape — the module narrows it, and claiming a shape the API does not guarantee is how the silent-failure class in `ChoosePlanPage` started.

- [ ] **Step 2: Add the coverage line** immediately above the `ScrollArea` at `:919`, inside the Signups `CardContent`:

```tsx
{analytics?.signups.recent && analytics.signups.recent.length > 0 && (
  <p className="text-xs text-muted-foreground mb-2">
    {countWithOnboardingData(analytics.signups.recent)} of {analytics.signups.recent.length} signups
    have acquisition data — captured at onboarding from 13 Aug 2026, not backfilled.
  </p>
)}
```

This sentence is the load-bearing part of the whole feature. Do not drop it as decoration: without it, a list of dashes is indistinguishable from a bug.

- [ ] **Step 3: Typecheck.**

---

## Task 3 — the source badge, and the dash

**Files:** Modify `src/pages/admin/PlatformAnalyticsPage.tsx:952-955`

- [ ] **Step 1: Render the source in a fixed slot before the existing date badge.**

```tsx
<div className="flex items-center gap-2">
  {/* Fixed slot: a dash only reads as "no data" if there is visibly a column. */}
  {(() => {
    const src = summariseSource(signup.onboarding_answers);
    if (!src) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground/50 w-16 text-right">—</span>
          </TooltipTrigger>
          <TooltipContent>
            No acquisition data — this organisation signed up before the question existed.
          </TooltipContent>
        </Tooltip>
      );
    }
    return (/* badge, Task 4 */);
  })()}
  <Badge variant="outline" className="text-xs">
    {format(new Date(signup.created_at), 'MMM d')}
  </Badge>
  {/* delete button unchanged */}
</div>
```

- [ ] **Step 2:** `TooltipProvider` already wraps the app (`App.tsx:273`), so `Tooltip` needs no extra setup. Import `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`.
- [ ] **Step 3: Do not change the checkbox, avatar, email, org name, role badge, relative time, date badge or delete button.** The delete button's `opacity-0 group-hover:opacity-100` must keep working — verify a row still reveals it on hover.

---

## Task 4 — the other four, secondary

**Files:** Modify `src/pages/admin/PlatformAnalyticsPage.tsx`

- [ ] **Step 1: The badge, with a Popover for the rest.**

```tsx
<Popover>
  <PopoverTrigger asChild>
    <button type="button">
      <Badge variant="secondary" className="text-xs cursor-pointer">
        {src.primary}{src.extraCount > 0 && ` +${src.extraCount}`}
      </Badge>
    </button>
  </PopoverTrigger>
  <PopoverContent className="w-72 text-xs space-y-2">
    {describeAnswers(signup.onboarding_answers).map((row) => (
      <div key={row.key}>
        <p className="text-muted-foreground">{row.question}</p>
        <p className="font-medium">{row.labels.join(', ')}</p>
      </div>
    ))}
  </PopoverContent>
</Popover>
```

**Popover, not HoverCard.** Hover-only disclosure is unreachable on touch, and this page is reached from the admin surface on phones.

- [ ] **Step 2:** the `+N` suffix is the whole multi-select story in the row — full detail is one tap away, so the row stays scannable.
- [ ] **Step 3: Typecheck, lint the touched file, `npm run build`.**

---

## Task 5 — verification

- [ ] `node --experimental-strip-types --test src/lib/onboardingAnswers.test.ts` — 36/36
- [ ] `npx tsc --noEmit -p tsconfig.app.json` — with the flag
- [ ] `npm run lint` on the touched files; confirm any pre-existing errors are pre-existing by counting them on the `HEAD` version first
- [ ] Load `/dashboard/platform-analytics?tab=signups` and check, by eye:
  - the coverage line states a number, and that number matches the count of badges visible
  - rows without data show a dim `—` in the same column, not a gap
  - a row **with** data shows the source badge; tapping it opens the popover with the other four
  - the delete button still appears on row hover
- [ ] The two browser-test orgs are the only ones with answers, **if** they survived Lovable's `962f4960 "Deleted test orgs and reset"`. Check before concluding the display is broken — an empty result may mean the data was deleted, not that the render failed.

---

## Self-review

**Brief coverage.** Null treated as normal and reading as "no data" → the coverage line states it as a measured fact, plus a fixed-column dash with an explaining tooltip; three options weighed in the table above. Acquisition source prominent → its own badge in a fixed right-hand slot, ahead of the date. Other four secondary → behind one tap, never in the row itself.

**Deliberately excluded.** No aggregate breakdown ("12 from Facebook ads"), no filtering or sorting by source, no CSV export, no change to any other tab. Each is a reasonable next request; none is this one.

**Known risk, mitigated not hidden.** Admin labels here duplicate the wizard's. A new wizard option not added here renders as its raw slug — deliberately, so drift is visible and actionable rather than blank. Unifying the two vocabularies is a follow-up, not part of this.

**Unverified.** Whether any organisation currently has non-null answers. Lovable's `962f4960` deleted the test orgs, and they were the only two carrying data. If none survive, this ships correct but unexercised against real data, and the first true check is the next real signup. Say so rather than reporting it as verified.

**Still open, unchanged by this.** `PlatformAnalyticsPage` is guarded by `AdminRoute`, not `PlatformAdminRoute` (`App.tsx:378`), while `platform-analytics` runs on the service-role key and returns every organisation's data. This task puts more per-org detail behind that guard, which raises the stakes without creating the problem. Its own item.
