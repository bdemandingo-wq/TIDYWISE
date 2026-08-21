# Every cron job's `Authorization: Bearer` header is null

**Found:** 2026-08-15, while reviewing the broadcast-dispatch worker.
**Status:** confirmed live. One job (`demo-reminders-15min`) is probably dead as a result; the other seven are unaffected but are carrying a broken header that will bite the next function that relies on it.
**Severity:** low today, high the moment someone writes a cron-invoked function without a `config.toml` entry — which is exactly what this plan nearly did.

## The finding

`vault.decrypted_secrets` on `slwfkaqczvwvvvavkgpr` contains **exactly three** secrets:

```
cron_secret
email_queue_service_role_key
supabase_url
```

There is no `supabase_service_role_key` and no `service_role_key`.

Eight live `cron.job` rows build their auth header like this:

```sql
'Authorization', 'Bearer ' || (
  select decrypted_secret from vault.decrypted_secrets
  where name = 'supabase_service_role_key'
)
```

The subquery returns no row, so the expression is `'Bearer ' || NULL`, which in Postgres is **NULL** — not the string `"Bearer null"`, and not an empty string. `jsonb_build_object` then emits a JSON null for that key. Every one of these jobs has been calling its edge function with no usable Authorization header.

The eight, all naming `supabase_service_role_key`:

| cron job | `config.toml` entry | effect |
|---|---|---|
| `process-rebooking-reminders-hourly` | `verify_jwt = false` | unaffected |
| `process-recurring-offers-hourly` | `verify_jwt = false` | unaffected |
| `process-review-sms-queue-every-5-min` | `verify_jwt = false` | unaffected |
| `send-booking-reminders-every-15-min` | `verify_jwt = false` | unaffected |
| `send-invoice-payment-reminders` | `verify_jwt = false` | unaffected |
| `sync-openphone-messages-every-5-min` | `verify_jwt = false` | unaffected |
| `weekly-business-report-monday` | `verify_jwt = false` | unaffected |
| **`demo-reminders-15min`** | **none** | **defaults to `verify_jwt = true` → gateway should reject every tick** |

## Why seven of them work anyway

Those seven functions carry `verify_jwt = false`, so the gateway never inspects the Authorization header. Their real authorization is the `x-cron-secret` header, checked inside the function by `_shared/requireCronSecret.ts`. The Bearer is decorative — it has presumably never worked, and nothing noticed because nothing depended on it.

That is a reasonable design. The problem is that the *migrations* look like the Bearer is load-bearing, so anyone copying the established pattern inherits a header that silently does nothing.

## The one that probably is broken

`demo-reminders` has no `config.toml` entry, so `verify_jwt = true` applies and the gateway should reject every invocation with 401. It runs every 15 minutes and sends demo reminders.

**Not yet confirmed as actually failing**, and there are two reasons it might not be:

1. `config.toml` may not be authoritative for how Lovable deploys. `handle-email-unsubscribe` also has no entry, yet `tests/security.spec.ts:19` lists it as intentionally public — so deployed JWT settings can evidently come from somewhere other than this file.
2. Nobody has reported missing demo reminders.

**To confirm:** check whether any demo reminder has been delivered recently, or ask Lovable for `demo-reminders` invocation logs and look for 401s.

## How it nearly shipped again

The broadcast worker's cron was written from the same pattern, naming `service_role_key`. Task 5's review flagged the name as inconsistent and suggested `supabase_service_role_key` — the name the other eight use. Both are wrong: neither exists. Had the suggestion been applied without checking the vault, the header would have stayed null, and because `broadcast-dispatch` was specified with **no** `config.toml` entry, `verify_jwt = true` would have applied and every tick would have 401'd. The visible symptom would have been a broadcast stuck at `sending` with zero sends and no error anywhere.

Fixed there by dropping the Bearer entirely and adding `[functions.broadcast-dispatch] verify_jwt = false`, with `requireCronSecret` as the internal gate CLAUDE.md rule 2 requires.

## Recommended fixes, in order of value

1. **Confirm or clear `demo-reminders`.** It is the only one with real exposure.
2. **Decide which model this project actually uses** and make the migrations honest about it. Two coherent options:
   - *Cron secret only* (what works today): drop the Bearer line from all eight jobs, keep `x-cron-secret`, ensure every cron-invoked function has `verify_jwt = false` plus `requireCronSecret`.
   - *Real service-role Bearer*: add a `supabase_service_role_key` secret to the vault, and the eight jobs start genuinely authenticating. Note this also silently changes `demo-reminders` from broken to working, which is worth doing deliberately rather than as a side effect.
3. **Do not copy the Bearer line into new cron migrations** until (2) is settled.

## Reproduction

```sql
-- what is actually in the vault
select name from vault.decrypted_secrets order by name;

-- the eight jobs naming a secret that does not exist
select jobname,
       substring(command from 'name = ''(service_role_key|supabase_service_role_key)''') as names_secret
from cron.job
where command ilike '%service_role_key%'
order by jobname;

-- proof that the concatenation collapses to NULL
select ('Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                      where name = 'supabase_service_role_key')) is null as header_is_null;
```
