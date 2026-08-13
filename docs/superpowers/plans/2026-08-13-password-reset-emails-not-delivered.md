# HIGH — password reset emails are not delivered; live customers cannot reset

**Reported:** 2026-08-13, from a real signup. Notification emails arrived; the reset code never did.
**Status:** Not fixed. Investigation deferred until Lovable credits are available.
**Severity:** High and customer-facing. Anyone locked out of their account stays locked out.

## Symptom

Signing up produced notification emails as expected. Requesting a password reset produced **no email at all** — no error shown to the user either. So email sending as a whole works, and the reset path specifically does not.

## Why that pattern is the diagnostic

**This app has two entirely separate email systems**, and the split maps exactly onto what works and what doesn't.

**System A — app emails. Works.** `_shared/send-org-email.ts` → Resend (or Gmail), called directly by the sending function. `send-team-invite` uses it, which is why invites arrive. Notification emails use it too. None of these touch Supabase Auth.

**System B — auth emails. Broken.** Supabase Auth fires the `auth-email-hook` edge function for signup confirmations, magic links and recovery. That hook does **not send anything**:

```
auth-email-hook  →  renders the React Email template
                 →  INSERT email_send_log (status: 'pending')
                 →  rpc('enqueue_email', { queue_name: 'auth_emails', ... })
                 →  returns 200
```

The actual send happens later, when something drains the queue. Supabase Auth sees a 200 and reports success, which is why **the user gets no error** — from Auth's point of view the email was handled.

So "invites work, resets don't" is not evidence that email is half-broken. It is evidence that **System B's queue is not being drained**, while System A never needed it.

## The reset path, concretely

`ForgotPasswordPage.tsx:36` calls **`signInWithOtp`**, not `resetPasswordForEmail`. So a reset request produces a **`magiclink`**-type auth email, whose subject in the hook is `'Your TidyWise password reset code'` (`auth-email-hook/index.ts:22`). `ResetPasswordPage.tsx:104-106` then verifies it with `verifyOtp({ type: 'email' })`.

The hook handles `magiclink` correctly and the template exists — `MagicLinkEmail` takes `{ token }` and the hook passes `token: payload.data.token` (`:225`). Nothing looks wrong in the rendering.

## Prime suspect: the drain cron

The queue is drained by `email_queue_dispatch()`, scheduled as a pg_cron job named `process-email-queue`. That job is **not created by a plain migration** — it is registered at runtime by `email_queue_wake()`:

```sql
-- 20260716180500_backfill_reverse_drift_functions.sql:143
PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
-- :145
RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
```

Two properties make this a likely silent failure:

1. **The schedule is created dynamically**, so its existence is not guaranteed by migration history. If it was never registered, or was unscheduled, nothing drains the queue.
2. **A failure to schedule raises a WARNING, not an error.** Warnings do not fail anything or surface anywhere a person looks.

If the job is missing or erroring, every auth email since then is sitting in the queue, and `email_send_log` is full of rows still at `status = 'pending'`.

## Checks to run first, in this order

```sql
-- 1. Is the drain job registered and active at all? (the whole question, usually)
select jobid, jobname, schedule, active from cron.job where jobname = 'process-email-queue';

-- 2. If it exists, is it succeeding? Look at return_message on failures.
select status, return_message, start_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'process-email-queue')
order by start_time desc limit 20;

-- 3. The smoking gun. The hook writes 'pending' BEFORE enqueueing, so a pile of
--    pending magiclink rows means the hook ran and the dispatcher never did.
select template_name, status, count(*), min(created_at), max(created_at)
from public.email_send_log
group by 1, 2 order by 3 desc;

-- 4. Queue depth for the auth_emails queue.
select * from pgmq.metrics('auth_emails');
```

Query 3 also dates the breakage, and query 1 almost certainly answers it outright.

## If the job is fine

Then the fault is downstream and the next places to look are:

- **`process-email-queue` has `verify_jwt = true`** in `config.toml` — the only function in the file set that way, and it sits oddly outside the main `[functions]` grouping. If `email_queue_dispatch()` reaches it over HTTP without a valid JWT, every drain attempt 401s. Worth confirming whether dispatch calls the function or does the send in SQL.
- Sender-domain or Resend key differences between the hook's `noreply@${FROM_DOMAIN}` and the working `sendOrgEmail` path — System A demonstrably has valid credentials, System B may not.
- Supabase Auth's own rate limiting on OTP emails, which would suppress repeat attempts but not a first one.

## Related, already logged

Item 11 in the follow-ups punch list covers a gap in **System A's** failure visibility (`org_email_send_failures` cannot distinguish a recovered fallback from a genuine non-delivery). Different system, different table, same underlying theme: an email path whose failures are invisible. Fixing the reset path does not fix that one, and vice versa.

## Do not ship a workaround first

The tempting quick fix is to route password resets through `sendOrgEmail` like invites, bypassing the queue. Resist it until query 1 has been run: if the drain job is simply unscheduled, then **signup confirmations and every other auth email are equally broken** and rerouting one path leaves the rest silently dead. Find out what is actually stuck before deciding what to move.
