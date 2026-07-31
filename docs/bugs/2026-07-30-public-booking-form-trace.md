# Does the public booking form work end to end?

**Investigated:** 2026-07-30. Read-only, nothing changed.

**Finding: as committed, every public booking submission returns 401 and no booking is
created.** The customer sees an error rather than a false success, so this is loud
rather than silent — but it means the form has been a dead end for whoever hit it.

**I cannot prove from the repo whether the 401 is live.** One query settles it
definitively, and it is at the bottom. Run that before anything else.

---

## 1. What happens when someone completes the form

Route `/book/:orgSlug` → `PublicBookingPage`. Five steps; step 4 is the card step, and
submission fires after the card is saved.

`PublicBookingPage.tsx:575` — the only call:

```ts
const { data: webhookResult, error: webhookError } =
  await supabase.functions.invoke('external-booking-webhook', {
    body: { first_name, last_name, email, phone, address, city, state, zip_code,
            latitude, longitude, service_name, scheduled_at, duration,
            total_amount, frequency, notes, extras, organization_id,
            organization_slug, square_footage, has_pets, room_reductions,
            …arrival window, …referral_code },
  });
```

**No custom headers.** `functions.invoke` sends the anon key and content-type; nothing
else. Remember that — it is the whole of §2.

The function is `verify_jwt = false` in `config.toml`, so the gateway lets it through
unauthenticated by design.

On success it writes three things:
- **customer** — found by `email + organization_id`, created if absent (`:151`)
- **booking** — `status: 'pending'`, `payment_status: 'pending'` (`:282-308`)
- **lead** — `source: 'booking_form'`, notes `"Auto-created from public booking form (BK-{n})"` (`:338-345`)

That third one is the fingerprint that makes this answerable. See the query.

## 2. The x-webhook-secret question — settled, as far as code can settle it

`external-booking-webhook/index.ts:112-131`:

```ts
// SECURITY: require x-webhook-secret matching this organization's per-org secret
const providedSecret = req.headers.get("x-webhook-secret") ?? "";
if (!providedSecret) {
  return new Response(
    JSON.stringify({ success: false, error: "Missing x-webhook-secret header" }),
    { status: 401, … }
  );
}
const { data: secretOk } = await supabase.rpc("verify_external_booking_secret", …);
if (secretErr || !secretOk) { return 401 "Invalid webhook secret"; }
```

**It is unconditional, and it short-circuits before the RPC.** There is no branch for
"request came from our own booking page", no allowlist, no origin check, no
`if (!secret_configured) skip`. An absent header is a 401 on its own, without even
consulting the org's secret.

The browser sends no such header. **So the code as committed rejects every submission
from the public form**, for every org, before touching the database.

### Which of your two possibilities is it?

You framed it as "either that check isn't deployed, or every public submission
returns 401". The code cannot distinguish those — CLAUDE.md rule 4 — but the
circumstantial evidence leans one way:

- The check was added by **Lovable** (`gpt-engineer-app[bot]`) on **2026-05-09**,
  touched again 2026-01-15 and last modified 2026-07-27. **Lovable commits *and*
  deploys** — that is its operating model, so a Lovable-authored change is far more
  likely to be live than a hand-committed one.
- The commit of 2026-07-27 did not touch the auth block, so nothing has removed it
  since.
- **The one apparent drift signal is not one.** `PublicBookingPage.tsx:650` says
  "external-booking-webhook does not return total_amount yet — the Lovable prompt for
  that is queued, not deployed". I checked: the **committed** webhook does not return
  `total_amount` either (`:454-458` returns `booking_id`, `booking_number`,
  `customer_id`, `message`). So that comment describes a change never made, not a
  deployed version lagging the repo. It is not evidence of drift for this function.

**My read: the check is probably live and the form is probably broken.** But "probably"
is not good enough for lead capture, and the query below turns it into a fact.

### What would settle it, exactly

**Leads are the fingerprint.** Every successful run creates a lead with
`source = 'booking_form'`. So:

- Newest such lead **before ~2026-05-09** → the form broke when the check landed.
- Newest such lead **recent** → the deployed function differs from the repo, and the
  form works.
- **No such leads ever** → it has never worked, or no one has ever completed the form.

Supabase edge-function logs for `external-booking-webhook` would also show the 401s
directly, but retention is short and the leads table is permanent.

## 3. What the customer sees on failure — an error, not a false success

**This is the good news, and it rules out the worst case you described.**

`PublicBookingPage.tsx:615-627`:

```ts
if (webhookError) {
  console.error('Booking creation error:', webhookError);
  if (webhookResult?.conflict) { … } else {
    toast.error('Failed to create booking. Please try again.');
  }
  setIsSubmitting(false);
  return;          // ← returns BEFORE setStep(5)
}
```

A 401 populates `webhookError` (`functions.invoke` sets it on any non-2xx), so the
customer gets an error toast and **stays on step 4**. No confirmation number, no step 5,
no "thanks, we'll be in touch". The success screen is unreachable on failure.

So this is not the silent-lie shape. It is a visible dead end.

**Two things that make it worse than a plain error, though:**

1. **They have already entered card details.** Step 4 is the card step and submission
   happens *after* the card is saved, so a customer reaching the failure has handed over
   payment details and then been told it failed. That is the point at which people
   abandon and do not come back.
2. **The message is generic.** "Failed to create booking. Please try again." Retrying
   produces the identical 401 forever. Nothing tells the customer or the org that
   retrying is futile.

## 4. Does anything record the attempt? No

**A failed submission leaves no trace in the database at all.**

The 401 returns at `:113-119`, before the customer insert, before the booking insert,
before the lead insert. Grepping the function for any abuse/attempt/failure logging
returns nothing — there is no equivalent of `org_email_send_failures` here.

What exists:
- `console.error` inside the function → Supabase edge logs only, short retention
- `console.error('Booking creation error:', webhookError)` in the browser → the
  customer's own devtools, which nobody reads

So a lost booking is unrecoverable: no name, no email, no phone, no record it was ever
attempted. **Every submission that 401s is a lead you cannot follow up**, because you
never learn it happened.

That, rather than the 401 itself, is why this could run for months without anyone
raising it: the org owner sees no failures, only an absence of bookings, which looks
identical to not having demand.

## 5. The embed path — identical, not different

There is **no separate embed route, widget script, or iframe-specific entry point.**
`/book/:orgSlug` is the only public booking route (`App.tsx:307` and `:418`, once per
routing branch).

Embedding is nonetheless anticipated: `PublicBookingPage.tsx:812-814` uses
`target="_top"` on the org logo link specifically so that "embedded it breaks the
customer out of the iframe instead of loading the site inside the booking widget."

So orgs *can* iframe the hosted page, and when they do it runs the same component,
calls the same function, sends the same headers, and **fails in exactly the same way**.
No separate investigation needed — and no separate fix, if one is needed.

---

## The query that settles it

```sql
-- 1. Has the public booking form EVER worked, and when did it last work?
select l.created_at, o.name as organization, l.name, l.email, l.phone, l.notes
from public.leads l
join public.organizations o on o.id = l.organization_id
where l.source = 'booking_form'
order by l.created_at desc
limit 25;

-- 2. Same question, summarised
select date_trunc('month', created_at)::date as month, count(*)
from public.leads
where source = 'booking_form'
group by 1 order by 1 desc;

-- 3. Cross-check against bookings the webhook would have made
select b.created_at, o.name, b.booking_number, b.status, b.total_amount
from public.bookings b
join public.organizations o on o.id = b.organization_id
where b.status = 'pending' and b.payment_status = 'pending'
order by b.created_at desc
limit 25;

-- 4. Do orgs even have a webhook secret configured? If none do, the check
--    cannot ever pass for anyone, from any caller.
select count(*) as orgs_total,
       count(*) filter (where external_booking_secret is not null) as with_secret
from public.organizations;
--    ^ adjust the column name if the secret lives elsewhere; find it with:
--    select pg_get_functiondef('public.verify_external_booking_secret(uuid,text)'::regprocedure);
```

**Reading it:**

- **Query 2 showing a gap starting around May 2026** → confirms the check went live then
  and killed the form. That is the expected shape if my read is right.
- **Query 2 showing recent months** → the deployed function is older than the repo, the
  form works, and the committed secret check is a landmine waiting for the next deploy
  of that function. That is arguably more dangerous, because the next unrelated Lovable
  edit to this file ships it.
- **Query 1 empty entirely** → either it has never worked, or nobody has completed the
  form. Query 3 distinguishes those: pending bookings with no matching lead would mean
  the booking insert worked and the lead insert did not.
- **Query 4 showing `with_secret = 0`** → nobody could pass the check even if they sent
  a header, which means it was never usable by any caller and is not just a
  browser-can't-send-headers problem.

## Coupled item: repairing this switches dynamic pricing back on

`docs/bugs/2026-07-30-dynamic-pricing-investigation.md` found that surge pricing is
applied in exactly one place — `PublicBookingPage.calculateTotal` — i.e. **this form and
nowhere else**. So no booking has been surged since this broke, whatever any org has
configured.

Two consequences for the repair:

- **Fixing the form starts charging surge again**, for any org that has it enabled. That
  should be a decision, not a surprise on a customer's card.
- **The customer is shown no explanation of the surcharge at all** — no badge, no line
  item, no note. That is tolerable while the form is dead; it becomes a live chargeback
  risk the moment it works. Worth fixing in the same release rather than after.

Run the "is it on for anyone" query in that document before scheduling this one — if no
org has surge enabled, neither consequence applies.

## If it needs fixing, the shape of the decision

Not designing it, but the options are not equivalent and one is a trap:

- **Sending the secret from the browser is not an option.** Anything the page can send,
  any visitor can read and replay. It would be security theatre and would also put a
  per-org secret in public JavaScript.
- The real question is what that check was *for*: protecting a **server-to-server**
  integration path (partner sites, Zapier) that shares an endpoint with the public form.
  If so, the answer is to split them — keep the secret requirement for the
  integration path and give the public form its own path with different, appropriate
  protections (origin/rate limits/captcha), rather than weakening one endpoint to serve
  both.
- Note the same endpoint already trusts `payload.total_amount` (`:288`), so the price
  floor trigger is the only thing standing between a forged body and a $0 booking —
  see `docs/security/2026-07-29-booking-price-authority.md`. Whatever replaces the
  secret check should be decided with that in view, not separately.
