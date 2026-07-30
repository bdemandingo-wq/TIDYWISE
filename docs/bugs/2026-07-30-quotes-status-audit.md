# Quotes screen status audit — the two `=== 'sent'` branches are dead, and editing a quote resets it

**Audited:** 2026-07-30. Read-only, nothing fixed.
**File:** `src/components/admin/QuotesTabContent.tsx`
**Verdict:** two bugs that mask each other. One is dead code; the other silently corrupts quote state.

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

## What a fix would need to decide

Not fixing per instruction, but the shape matters and it is not obvious:

1. **What should editing do to status?** Almost certainly *preserve* it — drop
   `status: 'draft'` from `handleSubmit`'s update path and let the existing value
   stand. `'draft'` is only correct for **create**.
2. **Should the dialog expose status at all?** Probably not as a free dropdown —
   `sent` should mean "we actually sent it", which is what `f1d8a101` just
   established for the SMS path. An editable status field would reintroduce the
   ability to claim a send that never happened.
3. **Should `estimate.sent` fire from here once reachable?** Only if this screen
   ever actually sends something. It does not — it writes a row. Firing
   `estimate.sent` on a status field flip would be the same lie `f1d8a101`
   removed from `BookingStepper`. The honest home for that dispatch is the SMS
   path, after a confirmed send.

That third point means the fix is probably **delete the two dead branches**
rather than make them reachable — but that is a product call about what
`estimate.sent` is supposed to mean to the orgs consuming it, so it needs your
answer, not mine.

## Minor

`(data as any).status` at both sites — `Quote.status` is declared `string | null`
at `:55`, so the cast is not buying anything. Harmless, but it is a cast sitting
exactly where the type system was the only thing that could have flagged the
branch as unreachable.
