# `lead.created` never fires for automated leads — blocker for speed-to-lead

**Logged:** 2026-08-12, while checking whether a Facebook lead backfill could fire outbound messages.
**Status:** Not fixed. **Blocks the speed-to-lead work**, which is the next piece after the Facebook lead backfill.
**Related:** `2026-08-12-facebook-lead-ingestion.md`, `2026-08-12-facebook-lead-backfill.md`

## The gap

`lead.created` is dispatched from exactly one place in the entire codebase:

```
src/pages/admin/LeadsPage.tsx:179
  dispatchZapier('lead.created', organization.id, lead as Record<string, unknown>);
```

That call sits inside the **frontend's manual create-lead mutation**. There is no `AFTER INSERT` trigger on `public.leads` that dispatches it, and no edge function does either — `facebook-lead-webhook`'s only outbound `fetch` goes to the Graph API.

So a lead created by anything other than an admin typing it into the Leads page dispatches nothing. That includes:

- **Facebook Lead Ads** (`facebook-lead-webhook`) — live since 2026-08-12
- **The booking chatbot** (`booking-chatbot/index.ts:209`, `source: 'chatbot'`)
- **The public booking form** (`_shared/create-booking-from-payload.ts:269`, `source: 'booking_form'`)
- Any future backfill or import

## Why it matters

The event is advertised to customers as **"New lead — Fires when a lead is captured"** (`src/lib/zapierEventSamples.ts:9`), and it is offered in two places in the product UI: `ZapierWebhooksCard.tsx:36` and `GHLSettingsCard.tsx:60`. A customer who wires Zapier or GoHighLevel to "New lead" gets their manually-typed leads and **silently misses every automated one** — which is to say, misses exactly the leads they are paying Meta to generate.

The wording is a promise the code does not keep. Same class of problem as the error-boundary copy that said "reported automatically" when nothing reached Sentry.

## Why it blocks speed-to-lead

Speed-to-lead texting needs a reliable "a lead just arrived" signal. Today there isn't one — there is a signal that means "an admin typed a lead in". Building the notifier on top of `lead.created` as it stands would produce a feature that never fires for the one source that actually needs sub-minute response: paid Facebook leads.

So the dispatch point has to move before the notifier is built, not after.

## Two ways to fix it, with a recommendation

**Option A — dispatch from the database.** An `AFTER INSERT` trigger on `public.leads` calling a dispatch function. Catches every writer forever, including ones nobody has written yet.

Risk, and it is a real one: it would fire for the **backfill too**. A trigger has no idea whether a row is a fresh enquiry or a July import. If this route is taken, the trigger must exclude `backfilled_at is not null` — which is exactly why the backfill marker is a column and not a notes convention (see the backfill plan's decision section).

**Option B — dispatch from each writer.** Call the dispatch in `facebook-lead-webhook`, `booking-chatbot`, and `create-booking-from-payload` alongside the existing frontend call.

Loses the "catches everything forever" property, and a fourth writer added later would silently miss it again — the same failure mode as the `['staff']` / `['staff-all']` cache-key bug, where two things that had to agree only agreed by memory.

**Recommendation: Option A, with the `backfilled_at is null` guard**, because the whole lesson of this gap is that per-writer wiring gets forgotten. Make the two agree by construction.

Whichever route: the notifier must **also** carry its own `backfilled_at is null` and freshness guards. Defence that lives in only one layer is defence that depends on the next author remembering.

## Before building

- Confirm what `dispatchZapier` does server-side (`src/lib/zapier.ts` → `zapier-dispatch` edge function) and whether it is safe to call from a service-role context rather than a browser session.
- Check whether GHL's `lead.created` mapping (`GHLSettingsCard.tsx:60`) expects fields a Facebook lead lacks — it maps `firstName`/`lastName`, and `leads` has a single `name`.
- Decide whether the historical Facebook leads should retroactively dispatch. Almost certainly no; that is the same "do not message people about weeks-old enquiries" instinct the backfill marker exists to protect.
