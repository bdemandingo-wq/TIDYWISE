# Portal login: cross-tenant ambiguity, and two message bugs — plan

**Status:** plan only, nothing built.
**Source:** the three-part investigation of 2026-07-31.

---

## Your question first: is the portal login org-scoped?

**No. Not by URL, not by subdomain, not by query parameter.**

```
src/App.tsx:335   <Route path="/portal"       element={<PortalLoginPage />} />
src/App.tsx:336   <Route path="/portal/login" element={<PortalLoginPage />} />
```

Flat. `PortalLoginPage` reads `useSearchParams` exactly once, for
`reason=session_expired` (`:31`). There is no subdomain resolution anywhere in
`src/`. No edge function builds an org-scoped portal link.

So one global login surface serves all 87 businesses, and the only thing
identifying the customer is the email they type. **You are right that this needs
a product decision** — but the decision is smaller than it looks, for two
reasons.

### The mechanism already exists

`organizations.slug` is a real column, and there is already a live public
org-scoped route using it:

```
src/App.tsx:308   <Route path="/book/:orgSlug" element={<PublicBookingPage />} />
```

resolved server-side by `public-booking-submit/index.ts:102` with
`.eq('slug', organizationSlug)`. `/portal/:orgSlug` would be the same shape, the
same column, the same resolution. This is not new ground.

### And the correctness bug doesn't have to wait for it

The URL question is about *product*. The "correct password rejected" bug is about
*the query picking arbitrarily*, and that can be fixed without deciding anything
about URLs — see Option C.

---

## Three options

### Option A — `/portal/:orgSlug`

Mirror the booking form. Login posts the slug, the edge function resolves it, the
RPC filters on `organization_id`.

- **For:** correct by construction; matches an established pattern; each business
  gets a link it can put on its own site.
- **Against:** every existing customer bookmark to `/portal` breaks, and bare
  `/portal` still has to do *something*. Requires every org to have a populated,
  unique slug — unverified, see the handover queries.
- **Product decision required:** yes, and also a comms job.

### Option B — ask which business at login

Keep `/portal`. When the email matches more than one portal account, show a
picker.

- **Against:** the picker has to appear *before* the password is validated,
  which tells an unauthenticated visitor which businesses a given email belongs
  to. That is a customer-enumeration oracle, and the existing RPC has a comment
  at `20260616202614…sql:12-13` showing enumeration was deliberately designed
  out. This option walks it back. **Not recommended.**

### Option C — disambiguate by password, server-side ✅ recommended first step

Each portal account has its own `password_hash`. So the server can gather every
portal account for that email and check the supplied password against each:

| Matches | Behaviour |
|---|---|
| 0 | `invalid_credentials` — same as today, correct |
| exactly 1 | log into **that** account — deterministic, and fixes the reported bug |
| 2 or more | genuinely ambiguous: same email *and* same password at two businesses |

- **For:** no URL change, no UX change, no product decision, no comms. Fixes the
  live bug today. Preserves the anti-enumeration property completely — the
  response is identical whether the email exists once, twice, or not at all.
- **Against:** does not solve the ≥2 case, and bcrypt is deliberately slow
  (~100ms per compare), so N candidates costs N×. Two mitigations matter:
  - **Cap the candidate list** (say 5) so a pathological email can't be used to
    burn server time.
  - **Timing leak:** comparing 2 hashes takes measurably longer than 1, which
    leaks that an email exists at multiple businesses. Given the existing dummy-
    compare already accepts approximate rather than perfect timing constancy,
    I'd accept this and note it, rather than pad to a fixed count.
- **The ≥2 case still needs a rule.** Options: reject with a distinct
  `ambiguous_account` message telling them to contact their business; or pick the
  most recently used (`last_login_at`). I'd reject — silently choosing is what
  caused this, and two accounts with identical credentials is rare enough to
  handle by hand.

### Recommendation

**C now, A later.** C is a contained server-side change that makes the common
case correct and can ship without you deciding anything. A is the right long-term
shape and should be planned as its own piece of work with the bookmark migration
thought through — bare `/portal` can keep working via C's logic indefinitely, so
there is no forced cutover.

---

## Is this live today or latent? — run these first

I cannot reach the main project, so these need Lovable. **All read-only.**

```sql
-- Q1. THE ONE THAT DECIDES IT. Emails with a portal login at more than one
--     business. Every row here is a customer who can be rejected with a
--     correct password right now.
select lower(c.email)                          as email,
       count(*)                                as portal_accounts,
       count(distinct c.organization_id)       as businesses,
       string_agg(distinct o.name, ' | ')      as business_names,
       max(cpu.last_login_at)                  as most_recent_login
from public.client_portal_users cpu
join public.customers c     on c.id = cpu.customer_id
join public.organizations o on o.id = c.organization_id
where c.email is not null and c.email <> ''
group by lower(c.email)
having count(distinct c.organization_id) > 1
order by count(*) desc;

-- Q2. The latent population: shared emails among ALL customers, whether or not
--     they have a portal login yet. This is how many could become Q1 the moment
--     a second business enables portal access for them.
select count(*) as emails_shared_across_businesses
from (
  select lower(c.email)
  from public.customers c
  where c.email is not null and c.email <> ''
  group by lower(c.email)
  having count(distinct c.organization_id) > 1
) x;

-- Q3. Scale, for context.
select count(*)                                   as portal_accounts_total,
       count(distinct lower(c.email))             as distinct_emails,
       count(*) filter (where cpu.is_active)      as active_accounts
from public.client_portal_users cpu
join public.customers c on c.id = cpu.customer_id;

-- Q4. Only needed if you pick Option A: is `slug` actually usable as a public
--     key? Nulls, blanks or duplicates would each break /portal/:orgSlug.
select count(*)                                              as orgs,
       count(*) filter (where slug is null or slug = '')     as missing_slug,
       count(*) - count(distinct slug)                       as duplicate_slugs
from public.organizations;
```

**Q1 empty → latent**, fix it before it bites, no customer to contact. **Q1
non-empty → live**, and those are people who may already have given up trying to
log in. Q2 sizes how fast latent becomes live.

---

## The fix itself (Option C), when the counts come back

`validate_client_portal_login` becomes multi-candidate. Sketch, not final:

```sql
-- current, the bug:
SELECT cpu.id, cpu.password_hash, cpu.is_active
INTO v_user_id, v_stored_hash, v_is_active
FROM public.client_portal_users cpu
JOIN public.customers c ON c.id = cpu.customer_id
WHERE LOWER(c.email) = LOWER(p_email);
--   ^ no org filter, no LIMIT, and INTO without STRICT silently takes one row
```

Replace with a loop over candidates (ordered by `cpu.created_at` for
determinism, capped), counting password matches. Return `valid` only on exactly
one match; return a distinct `ambiguous_account` reason on two or more. Keep the
dummy `crypt()` on the zero-candidate path so timing stays roughly flat.

**Two things not to lose in the rewrite:**

- The `is_active` check must apply to the *matched* account, not to whichever
  candidate happened to come first.
- The existing anti-enumeration property: wrong email and wrong password must
  stay indistinguishable to the caller.

---

## The two smaller ones from the same report

### (i) The unreachable rate-limit branch

`client-portal-login` returns **429** for all three limiter tiers (`:55`, `:61`,
`:68`). `supabase.functions.invoke` sets `error` on any non-2xx, so
`ClientPortalContext.tsx:342` returns `'Invalid email or password'` and the
`rate_limited` check at `:347` is **never reached**. A customer who mistypes
twice is locked out and told their password is wrong.

Same shape as the public booking form bug, and the same fix: read the response
body off `error.context` instead of treating any error as bad credentials. The
helper already exists — `readEdgeFunctionErrorBody()` in
`src/lib/edgeFunctionError.ts`, which clones before reading so it doesn't consume
the body. This is a frontend-only change.

### (ii) Nine failure modes, one message

| Real cause | HTTP | Currently shown | Should say |
|---|---|---|---|
| Wrong password | 200 | Invalid email or password | unchanged ✅ |
| Account deactivated | 200 | Invalid email or password | "This login has been turned off — contact the business." |
| Rate limited | 429 | Invalid email or password | "Too many attempts, wait N minutes." |
| Database/RPC error | **200** | Invalid email or password | "Something went wrong at our end." |
| Portal row load failed | 200 | Invalid email or password | same as above |
| Session mint failed | 500 | Invalid email or password | same as above |
| Unhandled exception | 500 | Invalid email or password | same as above |
| Not deployed / 404 | 404 | Invalid email or password | same as above |
| Offline / CORS | — | Invalid email or password | "Can't reach us — check your connection." |

Only the first is true today.

**This needs a server change as well as a client one**, and that is the part
worth flagging: `client-portal-login:77-78` catches an RPC error and returns
**HTTP 200 with `invalid_credentials`**. The masking is deliberate and
server-side, so no amount of frontend work can tell a database outage from a
wrong password. That line has to change for (ii) to be possible at all.

**Keep `invalid_credentials` deliberately vague** — wrong email and wrong
password must stay one message, per the RPC's own anti-enumeration comment. The
goal is only to separate *"we think your credentials are wrong"* from *"we
failed"*. Those two are what a customer needs told apart; which of email or
password was wrong is not.

**Suggested order:** (i) first — frontend only, no deploy risk, and it stops the
rate-limit lie immediately. Then Option C. Then (ii), which needs the edge
function and the RPC together.
