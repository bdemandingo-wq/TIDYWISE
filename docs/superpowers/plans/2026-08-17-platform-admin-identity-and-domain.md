# Item 10 — platform-admin identity, then the domain change

**Status:** plan for approval. Nothing built. The mechanism decision in §3 should be settled before any of §5 is written.

---

## 1. First, a correction: some of this is already done

The brief describes `is_platform_admin()` as email-based and part of a 34-site problem. It is not, as of the live database on 2026-08-17:

```sql
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = 'e95b92d0-7099-408e-a773-e4407b34f8b4'::uuid
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
$function$
```

No email. It reads platform-org membership — **the same rule `PlatformAdminRoute.tsx` already uses.** So two of the three drifting definitions have already converged; the migration files still mentioning the address are history, not live state.

That changes the size of this job substantially. The counts below are from the live database and from `origin/main`, not from migration archaeology.

## 2. The actual live surface

**Already decoupled — nothing to do:**

| Site | Current rule |
|---|---|
| `is_platform_admin()` | platform-org membership |
| `PlatformAdminRoute.tsx` | platform-org membership |

**Still keyed on the email address:**

| Site | Count | Detail |
|---|---|---|
| RLS policies | **10** | `demo_bookings` ×3, `demo_requests` ×2, `sentry_dismissed_issues` ×4, `user_sessions` ×1 |
| SQL functions | **1** | `has_active_subscription`, in its allowlist branch |
| Edge functions | **3** | `platform-analytics:10,74`, `platform-session-stats:9,60`, `delete-platform-account:10,48` |
| `src/` | at least 1 | `HelpPage.tsx:34,51` |

So the identity work is **~15 code sites**, not 34. The remaining ~30 mentions in migrations are historical DDL that has already been superseded.

## 3. What the check should be

### The recommendation: a dedicated `platform_admins` table

Not a role column, not an `app_metadata` claim. The reasoning, in order of weight:

**The current rule couples two unrelated facts, and that is the real defect.** `e95b92d0-…` is not an abstract "platform org" — it is **TIDYWISE, a live operating tenant with 232 customers and 439 bookings.** So "runs the SaaS platform" and "is an admin of one particular cleaning business" are currently the same row in `org_memberships`.

Anyone granted owner/admin of TIDYWISE for an ordinary operational reason — a bookkeeper, a VA, a manager — silently acquires: cross-tenant revenue across all 97 orgs, every subscriber's email, all session data, and the broadcast tool that emails every organization owner. Today that set has exactly one member, so there is no live exposure. The coupling is the hazard, not the current membership.

A separate table makes the two facts separable again, and makes granting platform admin a deliberate act rather than a side effect of staffing.

**Against an `app_metadata` JWT claim:** revocation is delayed until the token expires. For a gate that controls cross-tenant reads, "you stop being an admin in up to an hour" is the wrong failure mode. It also needs the Auth admin API to set, which is awkward to drive through Lovable, and it is invisible to SQL — the 10 RLS policies could not read it without a helper that unpacks the JWT anyway.

**Against a boolean on `profiles`:** `profiles` is written by ordinary application paths. A privilege flag there needs column-level `REVOKE`s to stop self-promotion, and this repo already carries three separate migrations that exist because column grants were got wrong. Fewer moving parts elsewhere.

**Against reusing `user_roles`:** it exists (308 `staff`, 2 `admin`) but its `app_role` enum is `admin|staff|user` and its `admin` clearly means org-level admin. Overloading it would recreate exactly the conflation being removed.

### Shape

```sql
create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  granted_by  uuid references auth.users(id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  note        text
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
grant all on public.platform_admins to service_role;
-- No policy for `authenticated`. Nobody reads this table directly; the only
-- consumer is is_platform_admin(), which is SECURITY DEFINER.
```

Keyed on `user_id`, not email — that is the whole point, and it means the address change in §6 cannot touch it.

`revoked_at` rather than `DELETE` so that removing an admin leaves a record. Membership means `revoked_at IS NULL`.

## 4. The migration path — no window where neither works

The lockout risk named in the brief is real, and it is entirely a question of ordering. The rule throughout: **never remove a path in the same migration that adds one.** Every phase leaves at least two working routes.

### Phase A — expand (additive only, zero behaviour change)

1. Create `platform_admins` as above.
2. Seed it by `user_id`, resolved from the addresses **while they still work**:
   ```sql
   insert into public.platform_admins (user_id, note)
   select id, 'seeded from pre-migration allowlist'
   from auth.users
   where lower(email) in ('support@tidywisecleaning.com', 'agencyfootprintllc@gmail.com')
   on conflict (user_id) do nothing;
   ```
3. Widen `is_platform_admin()` to accept **either**:
   ```sql
   SELECT EXISTS (SELECT 1 FROM public.platform_admins
                  WHERE user_id = auth.uid() AND revoked_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.org_memberships
                  WHERE organization_id = 'e95b92d0-…'::uuid
                    AND user_id = auth.uid() AND role IN ('owner','admin'));
   ```

**Verification gate:** the seed must return exactly 2 rows and both must be non-null user_ids. If it returns fewer, stop — the addresses did not resolve and phase D would lock you out.

### Phase B — repoint the ~15 sites

Every site stops comparing an email and calls `is_platform_admin()` instead.

- **10 RLS policies** → `USING (public.is_platform_admin())`. Mechanical.
- **`has_active_subscription`** → replace the email allowlist branch with `OR public.is_platform_admin()`. Note this slightly widens that branch (any platform admin's org gets access, not just three addresses) — which is the intended semantics and worth stating out loud rather than discovering later.
- **3 edge functions** → call `is_platform_admin()` through a **user-scoped** client, the pattern `broadcast-admin` already uses. Not the service-role client: `is_platform_admin()` reads `auth.uid()` and would return false for everyone.
- **`src/`** → these are UX only. `HelpPage.tsx` hides a link; the server gate is what matters. Repoint for consistency, but they are not a security boundary and should not be treated as one.

Behaviour is unchanged throughout, because Phase A's `OR` keeps the old route alive.

### Phase C — prove the new path carries the load alone

This is the phase that makes Phase D safe, and it needs a control, not a smoke test.

1. Add a **third, disposable** account to `platform_admins` that is **not** a member of the platform org.
2. Confirm it passes `is_platform_admin()` and can reach a platform-admin surface.
3. Confirm a **non**-member, **non**-table account still gets `false` — proving the gate did not simply become permissive.
4. Confirm no live object still references the address:
   ```sql
   select count(*) from pg_policies
   where schemaname='public'
     and (coalesce(qual,'') like '%tidywisecleaning.com%'
       or coalesce(with_check,'') like '%tidywisecleaning.com%');   -- expect 0

   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and pg_get_functiondef(p.oid) like '%tidywisecleaning.com%';  -- expect 0
   ```
5. Remove the disposable account.

### Phase D — contract

Drop the `org_memberships` branch from `is_platform_admin()`, leaving only the table. Platform admin and TIDYWISE staffing are now independent facts.

**Escape hatch, which is what makes this reversible:** `platform_admins` is service-role writable, so Lovable can always re-add a `user_id` even if every UI path is shut. That is the answer to "the fix is only reachable from inside Lovable" — it stays reachable, and by one INSERT rather than a function rewrite.

### Phase E — the address change

By this point nothing in the identity path cares what the address is. §6.

## 5. The drift, resolved

One definition: **`is_platform_admin()`**, reading `platform_admins`.

Everything else calls it. The three edge functions stop hardcoding, the 10 policies stop inlining, `PlatformAdminRoute` keeps calling it (its current org-membership check becomes a call to the RPC instead, so the client agrees with the server by construction rather than by coincidence).

The rule worth writing into CLAUDE.md at the end: *an email address is a contact detail, not an identity. If code is deciding what someone may do, it reads `is_platform_admin()`.*

## 6. The address change

**Do this after Phase D, and not before.** It is 84 sites of find-and-replace whose only real risk is that one of them is load-bearing for auth — and Phases A–D are what remove that risk.

- 3 shared files carry most of it: `_shared/email-footer.ts:14`, `_shared/email-sender-resolution.ts:30`, `_shared/policies.ts:26`
- 51 sites across 28 edge-function files
- 33 sites across 18 `src/` files

`.com` is the right target: the codebase already uses `jointidywise.com` for the canonical URL, sitemap, robots, App Store copy and six edge functions, so this reduces the number of domains in play rather than adding one.

**Sequence within the change:** shared files first (they cover the most sites and are the easiest to verify), then edge functions, then `src/`. Verify sending works after the shared-file change before touching anything else — a broken `email-sender-resolution` breaks every outbound email at once.

## 7. The DKIM hazard — do this FIRST, it is independent

`tidywisecleaning.com` has **two different DKIM public keys at the same selector.** Verified live 2026-08-17:

```
$ dig +short TXT resend._domainkey.tidywisecleaning.com
"p=MIGfMA0…SrVwS1jW+LXYLBfXTNr0YY0GfLdgI8aBEhBKkwkwqpzzcVW+o4l0zCZZsyX8Uj3AST7zL9WZ5KifUc9ydusKSbt+HZymeQIDAQAB"
"p=MIGfMA0…AbJj89gT5kyAUobtKRV8ilkpUpRYZym/MeTqPQHB/mDD3vOxApSEGhl1tn6oeQlSOheN4BRveVyUfijyUpdBwFckUAA4JDG/8Pw0eoAsXhaHawIDAQAB"
```

A verifier resolving that selector gets two records and no way to know which signed the message. If it picks the wrong one the signature fails, DKIM alignment fails, and DMARC evaluation degrades — mail lands in spam or is rejected outright. This is happening today, on the domain every outbound email currently comes from.

By contrast `jointidywise.com` has exactly **one** record and is clean:

```
$ dig +short TXT resend._domainkey.jointidywise.com | grep -c "p="
1
```

**Why first:** it is live breakage, it costs one DNS edit, it depends on nothing else in this plan, and it stays worth fixing even if the domain move is deferred — mail sent from `tidywisecleaning.com` between now and the cutover is still mail.

**What to do:** identify which key Resend currently signs with (its dashboard shows the expected value), delete the other record, and re-verify the domain. Do not delete both and re-add — that creates a window with no valid key.

## 8. The order

| # | Step | Depends on | Reversible |
|---|---|---|---|
| 1 | Fix the duplicate DKIM record | nothing | yes, keep the deleted value |
| 2 | **Phase A** — create + seed `platform_admins`, widen `is_platform_admin()` | 1 (not really; can run in parallel) | yes, drop the OR branch |
| 3 | **Phase B** — repoint 10 policies, 1 function, 3 edge functions, `src/` | 2 | yes, both routes still live |
| 4 | **Phase C** — prove the table path alone, with the disposable-account control | 3 | n/a, verification only |
| 5 | **Phase D** — drop the org-membership branch | 4 passing | yes, re-add the branch |
| 6 | **Phase E / §6** — the address change, shared files first | 5 | yes, it is a string change |
| 7 | Write the identity rule into CLAUDE.md | 5 | — |

Steps 1 and 2 are independent and can go in either order. Everything from 3 onward is strictly sequential, and **step 6 must not start before step 5 passes** — that ordering is the entire answer to the lockout question.

## Open questions for you

1. **Should `agencyfootprintllc@gmail.com` remain a platform admin?** It is in `is_platform_admin()`'s historical allowlist and would be seeded by Phase A. Worth deciding deliberately rather than inheriting.
2. **Does anything outside this repo authenticate as `support@tidywisecleaning.com`?** Zapier, a cron elsewhere, a monitoring check. Those break at step 6 and are invisible from here.
3. **Is `applereview@tidywise.com` still needed** in `has_active_subscription`'s allowlist after Phase B, or does its `plan_type='lifetime'` already cover it? It does today — worth removing the special case while you are in there.
