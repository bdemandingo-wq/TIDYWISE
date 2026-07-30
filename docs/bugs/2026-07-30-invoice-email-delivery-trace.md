# Are invoice emails actually being sent?

**Investigated:** 2026-07-30. Read-only, nothing changed.

**Short answer: yes, they send — and this is the third option, not either of the two
you offered.** It is not "it doesn't send", and it is not "it sends and we have no
proof". It is **"it sends, we have durable proof of every FAILURE, and no proof at all
of any SUCCESS."**

That asymmetry is good news, because it makes your question answerable today rather
than requiring instrumentation first. **One query settles it** — see the bottom.

---

## 1. What `send-invoice` actually does

It genuinely sends. It is not a status-writer.

`supabase/functions/send-invoice/index.ts:325-341`:

```ts
const { sendOrgEmail } = await import("../_shared/send-org-email.ts");
const sendResult = await sendOrgEmail({
  organizationId: data.organizationId,
  to: customerEmail,
  cc: Array.isArray(data.ccEmails) && data.ccEmails.length > 0 ? data.ccEmails : undefined,
  subject: `${invoiceNumber} from ${companyName} — Pay Online`,
  html: emailHtml,
});

if (!sendResult.success) {
  if (/not verified/i.test(sendResult.error || "")) {
    const domain = emailSettings.from_email.split("@")[1];
    throw new Error(`Your email domain (${domain}) is not verified. …`);
  }
  throw new Error(sendResult.error || "Failed to send email");
}
```

**Provider:** `_shared/send-org-email.ts` — Gmail SMTP when the org has
`email_send_method='gmail_smtp'` with credentials, otherwise Resend, with automatic
Gmail→Resend fallback.

**What it does with the response:** checks `.success`, throws on failure with a
specific message for an unverified domain, and captures `sendResult.id` — the provider
message id — as `emailId`. It also creates a Stripe Checkout session first, so the
email carries a real pay link.

The function is well written. Every failure branch throws or returns a non-2xx.

## 2. Is there a record? Failures yes, successes no

**Failures are durable.** `_shared/send-org-email.ts:85-105` calls the
`log_org_email_send_failure` RPC, writing to `org_email_send_failures`
(`20260708093246…sql:145`):

```sql
organization_id, method, fell_back_to, recipient, subject, error_message, created_at
```

It fires on Gmail failure, on daily-limit fallback, and on both-providers-failed. Org
admins can read it (`is_org_admin` policy).

**Successes are not recorded anywhere durable.** `send-invoice:342-349` calls
`logAudit(...)` — but `_shared/audit-log.ts:2` says outright:

> "Logs are stored in the console and can be reviewed via edge function logs"

It is `console.log`, not a table. So a successful invoice send leaves nothing behind
except ephemeral edge-function output.

**The provider message id is discarded at both ends.** `sendResult.id` is returned in
the HTTP body as `emailId` — and the client throws the body away:

```ts
const { error } = await supabase.functions.invoke('send-invoice', { … });
```

`InvoicesPage.tsx:292` and `InvoiceViewDialog.tsx:88` both destructure only `error`.
`logAudit`'s `details` carries `{ customerEmail, amount }` — not the id either. So the
one durable handle that could be traced in Resend's dashboard is generated, returned,
and dropped.

**No delivery or bounce webhook exists.** Nothing consumes Resend delivery events —
`stripe-*` webhooks exist, no email equivalent. A message Resend accepts but the
recipient's server bounces is invisible to you.

**This is exactly why it has gone unnoticed either way.** A working send and a bounced
send look identical from inside the app.

## 3. Failure handling — this one is correct, unlike the quotes bug

**"Sent" is not written on a failed send.** The chain holds:

1. `send-invoice` throws → returns HTTP 500
2. `supabase.functions.invoke` populates `error` on non-2xx
3. Both client paths do `if (error) throw error;` **before** touching status
4. Only then `.update({ status: 'sent', sent_at: … })`

Verified in `InvoicesPage.tsx:282-313` and `InvoiceViewDialog.tsx:79-107` — they are
byte-identical duplicates and both get the ordering right. This is the opposite of
`BookingStepper`'s quote bug fixed earlier today (`f1d8a101`).

**One real gap in the same code, in the other direction:** the `.update()` result is
never checked.

```ts
await supabase.from('invoices')
  .update({ status: 'sent', sent_at: new Date().toISOString() })
  .eq('id', invoice.id);          // ← no error capture

toast.success(`Invoice emailed to ${contact.email}`);
```

If that write fails (RLS, transient network), the customer **has** the invoice, the
toast says success, and the invoice still reads `draft`. Less severe than the reverse —
nobody is under-billed — but it means a draft-looking invoice may already be with the
customer, and a "resend" would send it twice.

Also note the status is only written `if (invoice.status === 'draft')`. Resending a
`sent` or `overdue` invoice correctly does not touch status — but also does not update
`sent_at`, so `sent_at` records the *first* send, not the latest.

## 4. Additional recipients — collected, saved, and dropped

**Yes, and it is on invoices rather than campaigns.**

Campaigns have no "extra recipients" concept — they run off a queue with
`total_recipients`. The only `extraRecipients` in the codebase is
`_shared/payroll-period-process.ts:226`, which handles them correctly
(`[ownerEmail, ...extraRecipients]`).

Invoices are the problem. `InvoiceFormDialog.tsx`:

- `:675` renders a **"CC recipients (optional)"** field
- `:273-282` add/remove handlers
- `:320` saves them onto the invoice row: `cc_emails: formData.cc_emails`
- `:401` passes them when sending **from that dialog**: `ccEmails: wantsEmail ? formData.cc_emails : []`

So creating-and-sending in one go works.

But `src/lib/invoiceUtils.ts:104-123`, `buildInvoiceEmailPayload`, returns:

```
organizationId, invoiceNumber, customerName, customerEmail, customerPhone,
invoiceDate, dueDate, subtotal, total, address, notes, isPaid, paidAt, lineItems
```

**No `ccEmails`.** `cc_emails` is not even on the `InvoiceLike` interface (`:22`).

And that builder is what **both other send paths** use — `InvoicesPage.sendInvoiceEmail`
(the list row Send/Resend button) and `InvoiceViewDialog.handleSendEmail`.

**So: every CC recipient saved on an invoice is silently dropped on every send except
the one made from the create/edit dialog.** The addresses are stored on the row, the
edge function supports `cc`, the UI shows them as configured — and the send omits them.
Nobody is told.

## 5. Silent-failure surface — smaller than expected

I went looking for the usual suspects and they are, unusually, all handled loudly:

| Risk | Handling |
|---|---|
| `RESEND_API_KEY` missing | `:71-76` returns 500 "Email service is not configured" |
| Org email settings missing | `:116-122` returns 400 with the reason |
| No Resend key at all | helper `:165` returns `ok:false` with a message naming the fix |
| Unverified sending domain | `:337-339` throws naming the actual domain |
| Gmail daily limit hit | falls back to Resend, **and** writes to `org_email_send_failures` |
| Gmail SMTP error | same fallback + failure row |
| Both providers fail | `success:false`, failure row written, function throws |
| Resend non-2xx | helper `:191` returns `ok:false` with `body.message` or the HTTP status |

**There is no silent-failure path inside `send-invoice`.** Every failure is either
thrown to the caller or written to `org_email_send_failures`, usually both.

The genuinely invisible things are all *after* a successful handoff:

1. no success record
2. the message id is discarded
3. no bounce/delivery webhook — post-acceptance failures are unknowable
4. the unchecked status `.update()` (§3)

---

## The query that settles your actual question

Because failures **are** durable, you do not need to instrument anything first:

```sql
-- Every invoice-email failure. Subject format is "{invoice_number} from {company} — Pay Online"
select created_at, organization_id, method, fell_back_to,
       recipient, subject, error_message
from public.org_email_send_failures
where subject ilike '%Pay Online%'
order by created_at desc
limit 100;

-- All email failures by cause, not just invoices
select method, fell_back_to,
       split_part(error_message, ':', 1) as cause,
       count(*), max(created_at) as most_recent
from public.org_email_send_failures
group by 1,2,3
order by count(*) desc;

-- Cross-check: invoices marked sent, and whether a failure was logged near that time
select i.invoice_number, i.status, i.sent_at, o.name as org,
       exists (
         select 1 from public.org_email_send_failures f
         where f.organization_id = i.organization_id
           and f.created_at between i.sent_at - interval '2 min'
                               and i.sent_at + interval '2 min'
       ) as failure_logged_near_send
from public.invoices i
join public.organizations o on o.id = i.organization_id
where i.sent_at is not null
order by i.sent_at desc
limit 50;
```

**How to read the result:**

- **No rows in the first two** → the sends succeeded at the provider. Your invoices
  reached Resend or Gmail. Anything wrong after that (spam folder, bounce) is invisible
  and needs a delivery webhook to see — a different, smaller problem.
- **Rows with `not verified`** → a sending-domain problem; that org's invoices are not
  going out and the sender is being told each time.
- **Rows with `fell_back_to = 'resend'`** → Gmail is failing and Resend is covering.
  The mail is going out, but **from the TidyWise platform sender rather than the org's
  own address**, which changes what the customer sees in their inbox.
- **The third query returning `sent_at` values with no nearby failure** → positive
  evidence that specific invoice was handed off successfully.

If all three come back clean, the answer is "they send, and we cannot yet prove
delivery" — and the fix is a success log plus a bounce webhook, not a rescue of broken
billing.

## What I would fix, in order, once you have that answer

1. **CC recipients dropped** (§4) — certain, silent, and affects money getting seen by
   the person who pays. One field on `buildInvoiceEmailPayload`.
2. **Persist the send** — a row per send with the provider message id, method, and
   whether it fell back. `org_email_send_failures` already proves the pattern works;
   this is its success twin.
3. **Check the status `.update()`** (§3) so "emailed" and "recorded as sent" cannot
   disagree.
4. **Resend delivery/bounce webhook** — the only way to distinguish delivered from
   accepted-then-bounced. Largest job, and pointless before (2) gives it something to
   attach to.
