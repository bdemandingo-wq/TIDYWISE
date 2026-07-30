# DEFERRED — wire `estimate.sent` to the path that actually sends a quote

**Status:** NOT STARTED. Queued behind the Lovable backlog. Do not build ahead of the decisions below.
**Decided:** 2026-07-30 — the event comes back, wired to the send path, not to a status flip.
**Depends on nothing technical.** Deferred because two contract questions are open, not because it is blocked.

**Background:** `docs/bugs/2026-07-30-quotes-status-audit.md` (why the old wiring was wrong)
**Outreach:** `docs/superpowers/prompts/2026-07-30-find-estimate-sent-subscribers.md` (who to tell)

---

## What is being built

`estimate.sent` fires when a quote is genuinely sent to a customer. Today the only
path that does that is `BookingStepper.handleSendQuoteSms` — it texts the customer
a price and, since `f1d8a101`, records the quote only after the SMS succeeds.

The old wiring fired on a status field flip in the Quotes edit form, which sent
nothing to anyone. It never fired at all (`4bcef4f5` deleted it), so **no org has
ever received an `estimate.sent` event**.

## The freedom that comes with that, and the constraint that doesn't

Because nothing has ever been delivered, there is **no backwards-compatibility
obligation to the wire format**. Nobody has a working Zap parsing a real payload.

But there *is* a published contract. `zapierEventSamples.ts:123-130` ships a sample
that orgs see when building a Zap, and they map fields from it:

```ts
'estimate.sent': {
  estimate_id:    'est_sample_123',
  customer_id:    'cus_sample_123',
  customer_email: 'jane@example.com',
  total_amount:   24500,
  currency:       'USD',
  status:         'sent',
  sent_at:        '2026-06-29T15:00:00.000Z',
}
```

**That sample does not match reality, in four separate ways.** Checked against the
`quotes` table and the deleted call site:

| Sample field | Reality |
|---|---|
| `estimate_id` | column is `id` |
| `customer_email` | not on `quotes` — needs a join to `customers` |
| `currency` | **no such column**; currency is a client-side concern (`activeCurrency`) |
| `sent_at` | **no such column** on `quotes` (it has `accepted_at`, not `sent_at`) |
| `total_amount: 24500` | looks like **cents**. The DB stores dollars, and the sibling `booking.created` sample uses `total_amount: 185` — dollars. This sample appears to have been written from a Stripe-shaped template and never reconciled. |

And the deleted code passed `quote as Record<string, unknown>` — the **raw DB row**,
which shares almost none of those field names. So even if the branch had fired, it
would have delivered something the documented sample does not describe, and every
org's field mapping would have broken.

**This is a second bug in the same feature**, independent of the trigger being
wrong, and it is the reason the outreach must not promise "it'll work as
documented".

---

## Open decisions — settle these before writing code

### 1. What does the payload carry?

Two coherent options; pick one deliberately.

- **(a) Honour the published sample.** Emit `estimate_id`, `customer_email`,
  `currency`, `sent_at`, and decide the amount unit. Requires joining `customers`
  for the email, sourcing a currency from somewhere real, and synthesising
  `sent_at` (or adding the column). Respects what orgs mapped against.
- **(b) Correct the sample to match the data**, and emit a clean payload built from
  what actually exists: `id`, `quote_number`, `customer_id`, `total_amount`
  (dollars), `subtotal`, `valid_until`, `organization_id`. Simpler and honest, but
  any org that pre-mapped from the old sample has to re-map.

**Sub-decision either way: the amount unit.** `24500` vs `185` across two samples
is a live inconsistency. Whatever is chosen must be consistent with the other
events, because an org with several Zaps will assume one convention. Getting this
wrong is a money bug in someone else's automation.

**Also note:** GHL does not receive the raw payload — `ghl-dispatch`'s
`buildGhlBody(event_type, org, payload, mapping)` transforms it per the org's
`event_config` mapping. Any new field must be reachable through that mapping or
GHL subscribers will not see it. Check `buildGhlBody` before finalising.

### 2. Does it fire on resend?

Worth noting how the code actually behaves before answering:
`handleSendQuoteSms` **always INSERTs a new quote row**. There is no resend in that
path — texting a customer twice creates two quotes. So "resend" is really two
separate questions:

- **A repeat send from `BookingStepper`** — currently creates a genuinely new quote
  row, so on today's behaviour it would fire. But that duplication is **itself a
  logged bug**, tracked separately at
  `docs/bugs/2026-07-30-quote-sms-duplicate-insert.md` and explicitly NOT waiting
  on this rebuild. Settle that first: if a repeat stops creating a second row,
  this question changes shape entirely.
- **`QuotesTabContent`'s reminder SMS** (`:250-270`) — sends a reminder about an
  *existing* quote and deliberately does not change status. Arguably this is not
  `estimate.sent` at all but a distinct `estimate.reminded` event. Firing
  `estimate.sent` here would re-announce a quote the org already knows about, and
  downstream automations that create a task or CRM entry per event would duplicate.

### 3. Where exactly does the dispatch go?

Implementation note, not a judgement call, but it needs doing right:

Post-`f1d8a101`, the insert is `const { error: quoteError } = await supabase.from('quotes').insert({…})`
— **no `.select()`**, so the created row is not returned. `quote_number` is
DB-assigned, so it is not knowable client-side. Emitting a payload containing
`id` or `quote_number` requires adding `.select().single()` back and firing after
that succeeds.

Fire point must be: SMS confirmed sent → insert succeeded → dispatch. Not before
either. The insert-failed path already toasts "sent but not saved" and returns; no
event should go out there, since there is no quote to reference.

---

## Definition of done

- [ ] Payload shape decided (1) and `zapierEventSamples.ts` updated to match whatever is chosen — sample and reality agree
- [ ] Amount unit consistent with the other events, and verified against `booking.created`
- [ ] Resend semantics decided (2); reminder path either fires a distinct event or nothing
- [ ] `buildGhlBody` confirmed to pass the chosen fields through for GHL subscribers
- [ ] Dispatch fires only after both the SMS and the insert succeed
- [ ] A real dispatch appears in `zapier_dispatch_log` with `success = true` — the first one ever
- [ ] Subscribed orgs contacted (see the outreach doc) — and told *after* the shape is settled, not before
