# Sending a quote SMS twice creates two quotes — and can create two customers

**Found:** 2026-07-30, while scoping the `estimate.sent` rebuild.
**Status:** customer half **FIXED** 2026-07-30. Quote half deliberately left alone — see below.
**File:** `src/components/admin/booking-form/BookingStepper.tsx` (`handleSendQuoteSms`)
**Severity as originally logged:** MEDIUM, "needs a repeat action".
**Corrected on fixing: it fired on the FIRST save, every time.** See the correction below.

---

## What happens

`handleSendQuoteSms` unconditionally INSERTs:

```ts
const { error: quoteError } = await supabase.from('quotes').insert({
  organization_id: organizationId,
  customer_id: customerId || null,
  …
  status: 'sent',
});
```

There is **no lookup for an existing quote, no dedupe, and no idempotency key**.
Every invocation writes a new row. The function is reached from the booking-save
flow when the "send quote SMS" checkbox is ticked (`:1346-1349`).

So sending a quote for the same job twice produces two `quotes` rows, both at
`status: 'sent'`, both counted.

## The second-order problem: it can duplicate the customer too

`:344-350`, at the top of the same function:

```ts
let customerId = selectedCustomerId;
if (customerTab === 'new' && newCustomer.first_name && newCustomer.last_name && newCustomer.email) {
  const customer = await createCustomer.mutateAsync(newCustomer);
  customerId = customer.id;
}
```

`customerId` is a **local**. Nothing writes the new id back to state — grepping the
file for `setSelectedCustomerId` returns **zero** matches. So `selectedCustomerId`
stays empty and `customerTab` stays `'new'`.

### Correction — this was worse than first logged

The original write-up said a repeat needed a retry. That was wrong, and the
verification done before fixing found why.

Both creates run **inside a single `executeSubmit`**:

- `:924` → `buildBookingData` → `:629` `createCustomer.mutateAsync` → **customer #1**
- `:1370` → `handleSendQuoteSms` → `:355` `createCustomer.mutateAsync` → **customer #2**

Because `selectedCustomerId` was never written back and `customerTab` stayed
`'new'`, the second branch's guard was still satisfied. So **one save with "send
quote SMS" ticked created two customer records on the first attempt** — no retry
needed. The quote was then attached to the duplicate rather than to the customer
the booking referenced.

A retry made it worse still, adding another pair.

That fed directly into backlog item #1: duplicate customers get merged, and
`merge_customers` orphans the portal login
(`docs/superpowers/prompts/2026-07-30-merge-customers-orphans-portal-login.md`).
This is one of the ways duplicates get created in the first place.

## Blast radius

`QuotesTabContent`'s stats (`:266-271`) count rows with no dedupe:

```ts
total:      quotes.length,
pending:    quotes.filter(q => q.status === 'draft' || q.status === 'sent').length,
totalValue: quotes.reduce((sum, q) => sum + (q.total_amount || 0), 0),
```

A duplicated quote therefore inflates the pipeline count **and** `totalValue` — the
same job's money counted twice. For an owner using that figure to judge how much
work is in flight, it is silently wrong in the optimistic direction.

## What limits it

Worth stating so this is not over-rated:

- `sendQuoteSms` defaults to `false` (`BookingFormContext.tsx:285`) and is not
  persisted, so **editing a booking does not silently re-send**. The box has to be
  ticked deliberately each time.
- A repeat therefore needs a real user action — a retry after a failed save, or
  ticking it again on a later save for the same job.

It is not silent background duplication. It is "the obvious recovery action
quietly does the wrong thing", which is why it is worth fixing rather than
tolerating.

---

## Fix directions — not decided

1. ~~**Write the new customer id back to state.**~~ **DONE.** But a state write-back
   *alone* would not have worked, which is worth recording: `handleSendQuoteSms`
   reads `customerTab` / `selectedCustomerId` from its **render closure**, and a
   `setState` in `buildBookingData` cannot update those locals mid-flow. The
   same-submit duplication needed an explicit hand-off — `handleSendQuoteSms` now
   takes a `resolvedCustomerId`, and `executeSubmit` passes the
   `bookingData.customer_id` it already resolved. The state write-back was still
   added, and is what fixes the *retry* case on a still-open dialog.
2. **Make the quote insert idempotent per job.** Needs a decision about what
   identity means here — same customer + same address + same amount within some
   window? There is no natural key on `quotes` today.
3. **Warn instead of dedupe.** If a `sent` quote already exists for this customer
   and address, ask before creating another. Preserves the legitimate case (a
   genuinely revised price) while making the accidental one visible.

**Decided 2026-07-30: (1) only.** (2) and (3) are explicitly NOT being done.

Two quotes for one job is legitimate when a price has been renegotiated, so a
blind dedupe would break a real workflow. If repeat quotes ever need handling it
should be a **"supersede the previous quote"** action with real semantics — the
earlier quote marked superseded, the pipeline counting one — not deduplication.
That is a feature, not a bug fix, and is not currently scheduled.

## Related

- `docs/superpowers/plans/2026-07-30-estimate-sent-rebuild.md` — deferred; its
  "does it fire on resend?" question is downstream of this. If a repeat send stops
  creating a second row, that question changes shape.
- `f1d8a101` — fixed the *ordering* in this same function (quote was marked sent
  before the SMS went out). It did not touch duplication.
