# Phase 5: Campaign Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give operators visibility and control over a campaign run — live progress, pause/resume/cancel, a throttle they choose, scheduling that actually schedules, and status labels that say what really happened — while splitting the 1,660-line `CampaignsPage.tsx` into files small enough to reason about.

**Architecture:** A pure status module (`campaignRunStatus.ts`) owns the entire run-state vocabulary — label, tone, explanation, and available actions — as data, not JSX. Every component renders from it, so the taxonomy is defined once and testable without a DOM. Extraction happens before any feature work, so each refactor step is verifiable as a no-op.

**Tech Stack:** React 18, TanStack Query v5, shadcn/ui + Tailwind, Supabase JS.

**Scope:** Frontend only. Nothing in `supabase/`. Every backend capability this depends on is already deployed.

---

## Global Constraints

**No `supabase/` changes.** `set_campaign_run_status`, `campaign_runs`, `throttle_seconds` and `scheduled_at` are all live and verified. If something seems to need a migration, stop and flag it rather than working around it.

**Match the existing design system.** shadcn `Card`/`Badge`/`Button`/`Select`/`Progress`, existing Tailwind tokens, dark theme default. Do not introduce a new palette, typeface, or spacing scale — this is an admin surface inside an established product, and a distinctive visual identity here would be a defect, not a feature.

**Extraction is a no-op.** Tasks in 5A must not change rendered output. Verification is `tsc --noEmit -p tsconfig.app.json` plus loading the page and confirming it looks and behaves identically. Do not "improve" anything while moving it.

**Do not persist run progress.** `campaign-runs` query data must be excluded from the offline persister in `App.tsx`, alongside `service-pricing`. A run restored from yesterday's cache reading "Sending 12 of 300" is a confidently wrong number — the same class of failure as the `sentCount` toast, and worse because it looks live.

**Poll only while active.** `refetchInterval` is `5000` when a run is `pending`/`running`/`paused`, and `false` otherwise. A finished campaign must not poll forever.

---

## File Structure

```
src/components/admin/campaigns/
  campaignDispatch.ts          EXISTS   dispatch toast copy
  campaignRunStatus.ts         NEW      status taxonomy — pure, no JSX
  CampaignRunBadge.tsx         NEW      compact pill for list rows
  CampaignRunControls.tsx      NEW      progress + pause/resume/cancel
  ThrottleSelect.tsx           NEW      30s / 1m / 2m / 5m
  ScheduleFields.tsx           NEW      date + time -> org-tz timestamp
  CampaignWizard.tsx           EXTRACT  the 3-step create dialog (~430 lines)
  CampaignList.tsx             EXTRACT  list/table + row actions
  CampaignTrackingDialog.tsx   EXTRACT  tracking detail dialog
  OptedOutPanel.tsx            EXTRACT  opt-out tab + ManualOptOutForm
  CampaignEditDialog.tsx       EXTRACT  edit dialog
  StatCard.tsx                 EXTRACT  stat tile
src/hooks/
  useCampaignRuns.ts           NEW      run query + status mutations
  useCampaigns.ts              EXTRACT  campaigns/automations/stats queries
  useOptOuts.ts                EXTRACT  opt-out queries + mutation
```

`CampaignsPage.tsx` ends as a composition root of roughly 200–250 lines: layout, tab state, and wiring.

---

## Phase 5A — Extract (no behaviour change)

Each task: move code, fix imports, typecheck, load the page, commit. One commit per extraction so any regression bisects cleanly.

- [ ] **5A.1** Extract `StatCard` (already a standalone function at the file's end) → `StatCard.tsx`. Smallest possible first move; proves the import path and directory layout.
- [ ] **5A.2** Extract the opt-out queries (`optedOutCount`, `optedOutList`, `setOptOutStatus`, the customer-search query inside `ManualOptOutForm`) → `useOptOuts.ts`.
- [ ] **5A.3** Extract `ManualOptOutForm` + the opted-out tab JSX → `OptedOutPanel.tsx`, consuming `useOptOuts`.
- [ ] **5A.4** Extract the campaign data layer (`campaigns`, `automations`, `conversionStats`, `campaignTrackingStats`, `detailTracking` queries; `createCampaign`, `updateCampaign`, `deleteCampaign`, `runCampaign`, `toggleAutomation` mutations) → `useCampaigns.ts`.
- [ ] **5A.5** Extract the tracking detail dialog → `CampaignTrackingDialog.tsx`.
- [ ] **5A.6** Extract the edit dialog → `CampaignEditDialog.tsx`.
- [ ] **5A.7** Extract the create wizard, its form state, `generateTemplates`, `testCampaign`, `sendCampaignNow`, and `resetForm` → `CampaignWizard.tsx`. Largest single move; do it last, when everything around it is already small.
- [ ] **5A.8** Extract the campaign list/table and row actions → `CampaignList.tsx`.
- [ ] **5A.9** Confirm `CampaignsPage.tsx` is under 300 lines and `tsc --noEmit -p tsconfig.app.json` is clean. Commit.

---

## Phase 5B — The status vocabulary

- [ ] **5B.1** Write `campaignRunStatus.ts`. Pure module, no React. Exports:

```ts
export type RunTone = 'neutral' | 'active' | 'paused' | 'success' | 'warning' | 'danger'
export type RunAction = 'pause' | 'resume' | 'cancel'

export interface RunPresentation {
  label: string          // badge text, short
  tone: RunTone
  detail: string | null  // one sentence: what happened, what to do
  actions: RunAction[]   // which controls are offered
  showProgress: boolean
}

export function presentRun(run: CampaignRun | null, orgTimezone: string | null): RunPresentation
```

The full taxonomy, which is the point of this module:

| Run state | Label | Tone | Detail |
|---|---|---|---|
| no run | `Draft` / `Active` (existing template logic) | neutral | — |
| `pending`, `scheduled_at` future | `Scheduled` | neutral | "Sends <date, org time>." |
| `pending`, no schedule | `Starting` | active | "Queuing recipients." |
| `running` | `Sending` | active | "<sent> of <total> sent." |
| `paused` | `Paused` | paused | "Queued messages are held. Resume picks up where it stopped." |
| `completed` | `Sent` | success | "<sent> of <total> delivered." |
| `cancelled` + `user_cancelled` | `Cancelled` | neutral | "You cancelled this. Remaining messages were dropped." |
| `cancelled` + `expired` | `Expired` | warning | "This sat paused for over 24 hours and expired before sending." |
| `cancelled` + `enqueue_stalled` | `Never started` | danger | "Recipients failed to queue, so nothing was sent. Re-run it." |

Actions: `running` → `['pause','cancel']`; `paused` → `['resume','cancel']`; `pending` → `['cancel']`; terminal → `[]`.

Three distinct cancel outcomes, three distinct operator responses — never collapse them to "Cancelled".

- [ ] **5B.2** Add a `pauseReason?: string | null` parameter, currently always undefined. When it is `'sms_not_configured'`, return label `Paused — SMS not set up`, tone `warning`, detail "Add your OpenPhone credentials in Settings, then resume." The column does not exist yet; this is the seam so adding it later is a one-line change at the call site rather than a redesign.
- [ ] **5B.3** Unit-test `presentRun` across all nine states plus both pause reasons. Pure function, no DOM, fast. Commit.

---

## Phase 5C — Run status, read-only

- [ ] **5C.1** `useCampaignRuns.ts` — query the most recent run per campaign for the org. `refetchInterval: 5000` while any run is active, `false` otherwise. Commit.
- [ ] **5C.2** Exclude `campaign-runs` from the offline persister in `App.tsx`, next to `service-pricing`, with a comment explaining that stale progress is worse than absent progress. Commit.
- [ ] **5C.3** `CampaignRunBadge.tsx` — renders `presentRun().label` with tone-mapped shadcn `Badge` variants. Commit.
- [ ] **5C.4** `CampaignRunControls.tsx`, display half only: a `Progress` bar for `sent / total`, plus `skipped` and `failed` counts shown **only when non-zero** (a permanent "0 failed" is noise). Below it, `presentRun().detail`. Commit.
- [ ] **5C.5** Wire the badge into `CampaignList` rows and the controls into `CampaignTrackingDialog`. Commit.

---

## Phase 5D — Pause, resume, cancel

- [ ] **5D.1** Add mutations to `useCampaignRuns`, calling `supabase.rpc('set_campaign_run_status', { p_run_id, p_status })`. The RPC returns the updated run row — write it straight into the query cache instead of refetching, so the UI updates on the same tick.
- [ ] **5D.2** Errors surface verbatim. The RPC rejects unauthorised callers and illegal transitions with real messages; show them rather than "Something went wrong". A non-admin must see that it was refused, not that it failed.
- [ ] **5D.3** Cancel gets an `AlertDialog`: "Cancel this campaign? Queued messages will be dropped and cannot be recovered. <N> of <total> have already been sent." Pause and resume are reversible and get no confirmation.
- [ ] **5D.4** Render buttons from `presentRun().actions` — never hand-coded per state, so the taxonomy stays the single source of truth. Disable while the mutation is in flight. Commit.

---

## Phase 5E — Throttle and real scheduling

- [ ] **5E.1** `ThrottleSelect.tsx` — 30 seconds / 1 minute / 2 minutes / 5 minutes → `30 | 60 | 120 | 300`. Helper text derives the finish estimate from the current recipient count: "About 25 minutes for 50 recipients." Commit.
- [ ] **5E.2** Add it to the wizard's schedule step, writing `throttle_seconds` on the campaign and passing it to the enqueue call. Commit.
- [ ] **5E.3** `ScheduleFields.tsx` — combine date + time into an ISO timestamp **in the organisation's timezone** (`business_settings.timezone`), not the browser's. Echo the resolved moment back: "Sends Tuesday 30 July at 9:00 AM (America/New_York)". An owner scheduling from another timezone must not silently send at the wrong hour.
- [ ] **5E.4** Pass `scheduledAt` through to `run-inactive-campaign`. Commit.
- [ ] **5E.5** **Fix the misleading button.** When `schedule === 'later'`, the primary action reads **"Schedule Campaign"**, not "Send Campaign". Today it says Send, and sends immediately, after showing the chosen date on the review screen. Commit.
- [ ] **5E.6** Review step shows the resolved schedule and throttle together: "Scheduled for Tue 30 Jul, 9:00 AM · one message every 60 seconds · about 50 minutes." Commit.

---

## Deliberately out of scope

- **`pause_reason`** — needs a Lovable migration. 5B.2 builds the seam; adding it later is one line.
- **Realtime subscriptions** for run progress. Polling at 5s while active is sufficient and avoids a publication change. Revisit only if 5s feels slow in use.
- **Changing throttle mid-run.** The RPC only permits status transitions. Would need a new RPC; not worth it until someone asks.
- **Retrying failed recipients.** The DLQ holds them and `recipientCustomerIds` could re-enqueue, but identifying and replaying them is a feature in its own right.
- **Bulk pause/cancel** across campaigns. No evidence it is needed.
- **Discounts under Campaigns**, and **invoice-email error surfacing**. Both real, both unrelated to this brief.
- **Per-recipient live status.** The tracking dialog already lists recipients; live per-row state is scope creep.

---

## Definition of done

1. A running campaign shows live progress on its list row and in the tracking dialog, updating without a manual refresh.
2. Pause holds the queue; resume continues from where it stopped; cancel drops it — all three via the existing RPC, with a confirmation only on cancel.
3. A non-admin attempting any of the three sees the RPC's actual refusal.
4. Throttle is selectable at creation and honoured by the worker.
5. Choosing "later" shows "Schedule Campaign", writes `scheduled_at` in org time, and does not send immediately.
6. The three cancel reasons render as three different labels with three different explanations.
7. Run progress is never restored from the offline cache.
8. `CampaignsPage.tsx` is under 300 lines; no new file exceeds ~250.
9. `npx tsc --noEmit -p tsconfig.app.json` clean; lint error count not increased.
10. Keyboard-focusable controls, `aria-live` on the progress region, reduced-motion respected.
