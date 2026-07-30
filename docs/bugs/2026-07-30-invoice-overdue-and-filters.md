# Invoices: the "Due" problem and the "sent" problem are not the same bug

**Investigated:** 2026-07-30. Read-only. Nothing fixed yet.
**Question asked:** is it one bug or two? **Answer: three, and one of them is in a different table.**

---

## A — every `?filter=` deep link into Invoices is inert (frontend, certain)

`InvoicesPage.tsx` never calls `useSearchParams`, `useLocation`, or `URLSearchParams`.
Confirmed by grep across the whole file.

Six links point at it with query params anyway:

| Source | Link |
|---|---|
| `notificationCatalog.ts:129` | `/dashboard/invoices?filter=overdue` |
| `notificationCatalog.ts:130` | `/dashboard/invoices?filter=paid` |
| `notificationCatalog.ts:131` | `/dashboard/invoices?filter=failed` |
| `notificationCatalog.ts:132` | `/dashboard/invoices?filter=refunded` |
| `notificationCatalog.ts:133` | `/dashboard/invoices?filter=disputed` |
| `MobileContactProfile.tsx:357` | `/dashboard/invoices?customer=<id>` |

All six land on the full unfiltered list. An owner clicking "Invoice overdue" in
their notifications gets every invoice they have ever raised.

**Extra problem underneath it:** three of those five filter values are not invoice
statuses. The CHECK constraint (`20260119160901…sql:18`) allows exactly
`draft, sent, paid, overdue, cancelled`. There is no `failed`, `refunded`, or
`disputed`. So implementing `?filter=` literally would still leave those three
links matching zero rows — they need mapping to something real, or the
notification routes need changing.

## B — the Overdue count is computed and thrown away (frontend, certain)

`InvoicesPage.tsx:335` computes `stats.overdue`. **It is never rendered.** The six
cards are Total, Draft, Sent, Paid, Total Paid, Outstanding.

There is also **no status filter UI on the page at all** — no tabs, no dropdown, no
segmented control. Overdue invoices do appear inline with an "Overdue" badge
(`statusConfig`, `:101`), but there is no way to see how many there are or to
isolate them.

So the admin UI currently cannot answer "what's overdue?" — which is the single
most common thing an owner wants from an invoices screen.

## C — "reading sent when they shouldn't have" — needs a LIVE check

The only `sent → overdue` transition in the entire codebase is
`send-invoice-reminder/index.ts:43-48`:

```ts
.update({ status: "overdue" })
.eq("status", "sent")
.lt("due_date", today)
.not("due_date", "is", null)
```

It is driven by pg_cron job `send-invoice-payment-reminders`, daily at 09:00 UTC,
from `20260212034241…sql`. Nothing unschedules it *by name*.

**If that cron is not running, every past-due invoice stays `sent` forever** —
which is exactly the reported symptom, and would independently make (B) moot
because the overdue count would be 0 no matter what.

Two reasons this cannot be settled from the repo:

1. **CLAUDE.md rule 4** — a migration file existing is not proof it ran.
2. `20260723021110…sql` unschedules six jobs **by numeric jobid** (10, 17, 18, 19,
   20, 30). The inline comments name other functions, but a jobid is positional
   and a comment is a claim, not evidence. If `send-invoice-payment-reminders`
   held one of those ids, it was silently killed.

### The query to settle it

```sql
-- Is the invoice-overdue cron alive, and when did it last succeed?
select j.jobid, j.jobname, j.schedule, j.active,
       r.status, r.return_message, r.start_time
from cron.job j
left join lateral (
  select status, return_message, start_time
  from cron.job_run_details d
  where d.jobid = j.jobid
  order by d.start_time desc
  limit 1
) r on true
where j.command ilike '%send-invoice-reminder%'
   or j.jobname ilike '%invoice%';

-- How many invoices SHOULD be overdue but are not?
select count(*) as stuck_as_sent,
       min(due_date) as oldest_due
from public.invoices
where status = 'sent'
  and due_date is not null
  and due_date < current_date;
```

A non-zero `stuck_as_sent` with an old `oldest_due` confirms the cron is dead or
erroring. If `stuck_as_sent` is 0, the cron is fine and (C) is not a bug — leaving
only (A) and (B), which are both purely cosmetic-to-navigational.

**Note:** the update only promotes `sent`, not `draft`. A draft past its due date
never becomes overdue. That is defensible — an invoice never sent to anyone is not
overdue — but worth confirming it matches intent.

## D — quotes marked `sent` before the SMS is attempted (different table, certain)

Not invoices, but the same words and worth knowing about if the symptom was seen
on the Quotes screen.

`BookingStepper.tsx:356-375` inserts the quote with `status: 'sent'` and *then*
calls `send-openphone-sms`. If the SMS fails, the quote permanently reads "sent"
though nothing was ever sent. The insert is not rolled back and the status is not
corrected on the failure path.

Contrast with the invoice send paths (`InvoicesPage.tsx:282-313` and
`InvoiceViewDialog.tsx:79-107`), which get the ordering right: they invoke
`send-invoice`, `throw` on error, and only then set `status: 'sent'`.
`send-invoice` returns real 400/500 status codes on every failure branch, so
`functions.invoke` populates `error` and the guard holds. Those two paths are
byte-identical duplicates of each other, which is its own small problem, but they
are correct.

---

## Verdict

| | Certain? | Where | Fixable by Claude Code alone |
|---|---|---|---|
| A — inert `?filter=` links | yes | `src/` | yes |
| B — Overdue stat unrendered, no filter UI | yes | `src/` | yes |
| C — invoices stuck reading `sent` | **unproven** | cron / live DB | no — needs the query above first |
| D — quotes `sent` before send | yes | `src/` | yes |

A and B are one coherent piece of work: read the param, add the filter UI, render
the overdue count. Doing them without settling C risks shipping a filter that
correctly shows zero overdue invoices because nothing ever marks any.
