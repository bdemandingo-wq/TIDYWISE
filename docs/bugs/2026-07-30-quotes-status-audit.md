# Quotes screen status audit — the two `=== 'sent'` branches are dead, and editing a quote resets it

**Audited:** 2026-07-30. **Resolved same day — see "What was done" at the foot.**
**File:** `src/components/admin/QuotesTabContent.tsx`
**Verdict:** two bugs that mask each other. One is dead code; the other silently corrupts quote state.

> ## ⚠ Action still outstanding: affected orgs must be told
>
> `estimate.sent` has **never once fired from this screen**. Any org that wired a
> Zapier Zap or GoHighLevel automation to `estimate.sent` for quotes has been
> receiving nothing, for as long as the feature has existed, with no error on
> either side.
>
> The dead branches were deleted rather than repaired (reasoning below), so that
> does not change — but those orgs are sitting on automations they believe work.
> **They need telling.** Silently reviving the event would have been worse: it
> would have started delivering to untested automations, triggered by quotes being
> *edited* rather than sent.
>
> **The queries to identify them are written**, covering both channels
> (`org_zapier_webhooks.event_type` for Zapier, `org_ghl_settings.event_config` for
> GoHighLevel), plus an owner contact list and a dispatch-log check that verifies
> the "never fired" claim empirically rather than by code reading:
> `docs/superpowers/prompts/2026-07-30-find-estimate-sent-subscribers.md`

---

## Finding 1 — `estimate.sent` can never fire from this screen

`createMutation:108` and `updateMutation:129` both do:

```ts
if ((data as any).status === 'sent' && quote) {
  dispatchZapier('estimate.sent', organization.id, quote as Record<string, unknown>);
}
```

`data` comes from `handleSubmit:323-327`:

```ts
const data = {
  ...formData,
  status: 'draft',      // literal, AFTER the spread — always wins
};
```

`formData` (`:280-290`) has **no `status` key at all**, and the literal comes after
the spread regardless. So `data.status` is `'draft'` on every create and every
update, and `=== 'sent'` is never true.

**`dispatchZapier('estimate.sent', …)` is unreachable from both call sites.** Any
org that wired an `estimate.sent` Zap or GoHighLevel automation for quotes has
been receiving nothing. `dispatchZapier` swallows its own failures
(`zapier.ts`, `Promise.allSettled` + `console.warn`), so even a real dispatch
would fail quietly — but here it is never attempted.

Quotes *do* legitimately reach `'sent'` — just not from this screen.
`BookingStepper.handleSendQuoteSms` inserts them that way directly (fixed
earlier today in `f1d8a101` to only do so after the SMS actually goes out).

## Finding 2 — editing any quote silently reverts its status to `draft`

This is the serious one.

`updateMutation:120-124` writes the whole `data` object, `status: 'draft'`
included. The dialog has **no status control** — its fields are Customer,
Service, Address, Subtotal, Discount, Total, Valid Until, Notes — and
`handleOpenDialog:295-305` does not read `quote.status` into `formData`.

So an admin who opens a quote to fix a typo or adjust a price silently rewrites
its status:

| Before edit | After edit | Collateral |
|---|---|---|
| `sent` | `draft` | customer has the quote; system says it was never sent |
| `accepted` | `draft` | **`accepted_at` stays set**, and the booking `markAsAccepted:163-180` created still exists |
| `declined` | `draft` | reappears as live pipeline |

The `accepted` case is the worst: `markAsAccepted:157-161` sets
`status='accepted'` and `accepted_at=now()`, then creates a real booking at
`status='confirmed'`. A later edit leaves a **draft quote carrying an acceptance
timestamp with a confirmed booking attached** — three records disagreeing about
whether the customer ever agreed to anything.

The stats counter compounds it: `pending: q.status === 'draft' || q.status === 'sent'`
(`:275`) pulls the reverted quote back into the pending count, so the pipeline
number silently inflates.

## Finding 3 — why this survived

The two findings mask each other, which is why nobody has hit it as a report.

Because `status` is always `'draft'`, the `=== 'sent'` branch never runs, so the
webhook that would have made the reset externally visible never goes out. And
because there is no status control in the dialog, nobody expects the edit form to
touch status at all — the field is invisible in both directions.

A quote reverting from `accepted` to `draft` looks like someone else changed it,
not like the edit form did it.

---

## What was done

Decided and shipped 2026-07-30.

**1. `status: 'draft'` removed from the update path.** `handleSubmit` now sends it
only on create, where it is genuinely correct — a brand-new quote really is a
draft. Editing no longer touches status at all, so `sent`, `declined` and
`accepted` survive a price correction.

Status is left to the actions that actually change it: `markAsAccepted`, and
`BookingStepper`'s SMS send.

**2. Both `=== 'sent'` branches deleted**, along with the now-unused
`dispatchZapier` import.

The reasoning for deleting rather than reviving: **this screen does not send
quotes.** It writes a row. `BookingStepper.handleSendQuoteSms` is what actually
puts a quote in front of a customer. Firing `estimate.sent` when a status field
flips in an edit form announces something that did not happen here — the identical
lie `f1d8a101` removed from `BookingStepper` the same day.

If `estimate.sent` should fire at all, it belongs in the path that actually sends
the quote. That is separate work, and doing it here would have meant delivering
events to untested automations on the wrong trigger.

**3. Not done: exposing status in the dialog.** Deliberate. A free status dropdown
would reintroduce exactly the ability `f1d8a101` removed — claiming a send that
never happened. If quotes need a manual "mark as sent", it should be an explicit
action with its own semantics, not a form field.

**4. Still outstanding:** telling the orgs whose `estimate.sent` automations have
never fired. See the banner at the top.

## Minor, resolved by the above

`(data as any).status` at both sites — `Quote.status` is declared `string | null`
at `:55`, so the cast bought nothing. It sat exactly where the type system was the
only thing that could have flagged the branch as unreachable. Both casts went with
the branches; eslint dropped from 22 to 20 issues in this file as a result.
