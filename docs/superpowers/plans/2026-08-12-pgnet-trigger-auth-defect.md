# A `pg_net` trigger sends a non-JWT string where a Bearer token belongs

**Logged:** 2026-08-12, while choosing an auth mechanism for the speed-to-lead trigger.
**Status:** Not fixed, not chased. One site, not a sweep.
**Related:** `2026-08-12-speed-to-lead.md` (deliberately did not copy this pattern)

## Correction to how this was first reported

I initially said this defect might span "those other 27 migrations". **That was wrong and the real number is 1.** Of the 27 migrations calling `net.http_post`:

| Pattern | Count | Verdict |
|---|---|---|
| `x-cron-secret` from `vault.decrypted_secrets` | 12+ | Correct, and the convention to copy |
| `Authorization: Bearer ` + `current_setting('request.jwt.claims')::json->>'role'` | **1** | Broken |
| Other (`apikey`, vault service-role key, no auth header) | remainder | Not reviewed |

Recording the correction because an inflated count would have sent someone auditing 27 files for a defect in one, and because "27 migrations share a defect" and "one old migration has a defect" justify very different responses.

## The defect

`supabase/migrations/20251224072250_3de6c027-8b19-416e-9c1a-900c93920668.sql:64-69`:

```sql
PERFORM net.http_post(
  url := supabase_url || '/functions/v1/send-loyalty-progress-email',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::json->>'role'
  ),
```

`current_setting('request.jwt.claims', true)::json->>'role'` yields the **role name** — the literal string `service_role`, or `authenticated`, or `NULL`. It is not a JWT. So the outgoing header is `Authorization: Bearer service_role`, or `Authorization: Bearer ` with nothing after it.

Any gateway or in-function check that tries to verify that as a token rejects it. And because it is fired from a trigger via `pg_net`, which is fire-and-forget, **the trigger never sees the rejection** — the loyalty email simply never sends, and nothing logs a failure at the database end.

This is a trigger on a live table: `CREATE TRIGGER send_loyalty_email_trigger` at `:93`, calling `send-loyalty-progress-email`.

## Why it is worth a look but not urgent

The failure mode is a missing email, not a leak — the header carries no credential, so nothing is exposed. Worst case is that customer loyalty-progress emails have silently not been sending since December 2025.

Two things to establish before touching it:

1. **Is this function still the live one?** A later migration, `20251227021415_ac930c9c-ad88-4c11-bc21-1f23854aa6e6.sql`, also references `send-loyalty-progress-email` and may have replaced it three days later. Check `pg_get_functiondef` on the live database rather than reading migration files — rule 4b applies, and the answer decides whether there is anything to fix at all.
2. **Does the edge function actually reject it?** If `send-loyalty-progress-email` has `verify_jwt = false` and does its own service-role check, it may be failing on a different line, or not failing at all. Check whether any loyalty-progress email has ever been delivered.

## The fix, if it is still live

Adopt the convention the other 12 use:

```sql
headers := jsonb_build_object(
  'Content-Type',  'application/json',
  'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
)
```

…and gate the edge function with `requireCronSecret` from `_shared/requireCronSecret.ts`.

**Caveat that is itself unresolved:** all 12 correct examples are inside `cron.schedule` blocks, which run as the job owner. This one is inside a trigger, which runs as the inserting role. Whether a `SECURITY DEFINER` trigger function on this project can read `vault.decrypted_secrets` at all is exactly the open question in the speed-to-lead plan's Task S1. **Wait for that probe result before rewriting this** — otherwise a fix could swap a header that fails loudly-but-invisibly for one that reads NULL and fails the same way.
