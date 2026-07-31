# Do additional campaign recipients receive anything?

**Investigated:** 2026-07-30. Read-only, nothing changed.

**Answer: there is no additional-recipients feature. Nothing is collected and dropped,
because nothing is collected.** This is not the invoice CC bug repeated — campaign
audiences are entirely parameter-driven, and the UI offers no way to add a person.

But the investigation turned up the *inverse* of that bug, and one real preview/send
discrepancy. Both below.

---

## 1. What the campaign audience actually is

Recipients are **computed**, never listed. The wizard collects audience *parameters* —
`days_inactive`, `targetAudience`, `excludeAlreadyReceived`, `excludeRecentDays`,
`onlyAfterDate` — and `run-inactive-campaign` resolves them into customers at send time
(`:205-215`), filtering on `marketing_status = 'active'` and a non-null phone.

**The "Preview Recipients" list is read-only.** `CampaignWizard.tsx:790-810` renders each
matched customer as a plain `<div>` with informational badges. No checkboxes, no
selection state, no way to add anyone. It is a report, not a picker.

So there is nowhere for an "extra recipient" to be entered, and correspondingly nothing
that could silently discard one.

**Searched to be sure:** `additional_recipients`, `extra_recipients`,
`manual_recipients`, `recipient_list` return nothing anywhere in `src/`,
`supabase/functions/` or `supabase/migrations/`. The only `extraRecipients` in the
codebase is `_shared/payroll-period-process.ts:226`, which handles them correctly
(`[ownerEmail, ...extraRecipients]`). The campaign tables are
`automated_campaigns`, `campaign_emails`, `campaign_runs`, `campaign_sms_sends` —
none of them stores a recipient roster.

## 2. The inverse bug: the server can take an explicit list, and nothing sends one

`run-inactive-campaign:154-182` has a complete explicit-recipient path:

```ts
// Explicit recipient list: skip audience resolution entirely.
if (!testMode && Array.isArray(recipientCustomerIds) && recipientCustomerIds.length > 0) {
  const { data: explicitCustomers } = await supabase
    .from('customers')
    .select('id, first_name, last_name, phone')
    .eq('organization_id', organizationId)
    .eq('marketing_status', 'active')
    .not('phone', 'is', null)
    .in('id', recipientCustomerIds)
    …
  return await createRunAndEnqueue({ … recipients: explicitCustomers || [] … });
}
```

It is properly written — org-scoped, opt-out respecting, phone-required.

**No caller ever supplies `recipientCustomerIds`.** Grepping `src/` and all 202 edge
functions returns only the three lines inside `run-inactive-campaign` itself
(`:51` default, `:154` guard, `:161` query).

So the capability you were asking about **exists on the server and has no UI**. That is
the same family as `automation_steps` (a full editor writing to a table no sender reads)
and `invoice_branding` / `customers.credits` — except inverted: here the backend is
ready and the frontend never arrived.

**Practical consequence:** if you want "add these three people to this campaign", it is a
frontend-only job. The server side is done. That is unusually cheap for a feature on
your list.

## 3. The real discrepancy: the preview cannot evaluate one of its own toggles

Preview and send call the **same function** with **identical audience parameters** —
verified line by line (`CampaignWizard:203-215` vs `:272-286`). That is good design and
means the count is honest for what it can compute.

**But the send passes `campaignId` and the preview does not.** And at `:314-316`:

```ts
if (campaignId || excludeAlreadyReceived) {
  const filterCampaignId = campaignId;
  if (filterCampaignId) {
    …load campaign_sms_sends for this campaign…
  }
}
```

The already-received lookup is **gated on `campaignId` being present**, not on the
toggle. With no `campaignId`, `sentCustomerIds` stays empty, so `already_received` is
`false` for every customer in the preview response (`:373`).

Two consequences:

- **The "Already received" badge can never appear in the preview.** `CampaignWizard:798`
  renders it from `c.already_received`, which is structurally always false there.
- **The `excludeAlreadyReceived` toggle has no visible effect at preview time.** Flipping
  it changes the sent audience but never the previewed one.

For a brand-new campaign this is harmless in outcome — the campaign was just created, so
`campaign_sms_sends` holds nothing for it and the exclusion would find nobody anyway. It
is misleading rather than wrong: a toggle that appears inert, and a badge that is coded
for and never shows.

It becomes a genuine count difference on any path that previews against an **existing**
campaign with prior sends.

**`recently_contacted` is unaffected** — `recentlySentIds` is scoped to "any campaign
recently" and needs no `campaignId`, so that badge does work in the preview.

## 4. The honest caveat on the recipient count

Even with identical parameters, **the number shown is a snapshot, not a promise.**
`excludeRecentDays` and `excludeAlreadyReceived` are evaluated against a moving "now",
and a customer can opt out between preview and send. So "✅ 47 clients match this
audience" can legitimately become 44 sent, with nothing explaining the gap.

That is not a bug — it is the correct behaviour of a live audience — but it is the shape
you were worried about, and the UI does not say so anywhere.

---

## Verdict

| Question | Answer |
|---|---|
| Is there an "add extra recipients" feature? | **No.** Audiences are parameter-driven; the preview list is read-only |
| Are extra recipients collected and dropped? | **No** — nothing collects them |
| Is this the invoice CC bug again? | **No.** The inverse: the server supports an explicit list, the UI never sends one |
| Anything actually wrong? | Yes, two things — the preview cannot evaluate `excludeAlreadyReceived`, and the count is a snapshot the UI presents as certain |

Neither is urgent. The `already_received` gating is a five-line fix (pass `campaignId`
into the preview when editing an existing campaign, or gate the lookup on the toggle
rather than the id) but it needs a decision about what previewing an unsaved campaign
should even mean, so it is not a blind change.
