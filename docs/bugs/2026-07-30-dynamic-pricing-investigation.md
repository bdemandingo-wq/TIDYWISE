# Does dynamic pricing work, and when?

**Investigated:** 2026-07-30. Read-only, nothing changed.

**Short answer: it is implemented in exactly one of the eight booking paths — and that
one path has been returning 401 on every submission since roughly 9 May.** So whatever
any org has configured, no booking has been surged in about three months.

Whether it was ever switched on by anyone is the one thing I cannot determine from here.
Query at the bottom. **Run that first** — if the answer is "nobody", everything below is
theoretical and you can close the item.

---

## 1. What it is and where it's configured

Three multiplier rules, all stored on `business_settings`, all defaulting to **off**
(`20260701215701…sql`):

| Rule | Trigger | Default multiplier |
|---|---|---|
| `surge_weekend_*` | Saturday or Sunday | ×1.15 |
| `surge_lastminute_*` | booking within N hours (default 48) | ×1.20 |
| `surge_holiday_*` | US federal holiday | ×1.25 |

Configured at **Settings → Pricing** (`SurgePricingSettings`, rendered at
`SettingsPage.tsx:844` inside `<TabsContent value="pricing">`). The component is properly
wired: it loads current values, upserts to `business_settings` on save, surfaces errors
via toast, and renders each multiplier as a friendly percentage (`pct()` → "+15%").

So the configuration surface is real and reachable. The problem is entirely downstream.

## 2. Which paths apply it — one, and it is the broken one

**`PublicBookingPage.calculateTotal:517-519` is the only place surge is ever applied:**

```ts
// Apply surge multiplier
const surge = getSurgeMultiplier();
if (surge > 1) total = total * surge;
```

Verified against everything else that prices a booking:

- **`src/lib/pricingEngine.ts` — the shared engine — contains no surge logic at all.**
  Grep for `surge|multiplier|holiday|weekend` returns nothing.
- **`BookingFormContext`** (the admin booking stepper) imports that same engine and never
  applies surge. So an admin booking a Saturday job by phone charges the base rate.
- **No edge function mentions surge anywhere.** `grep -rl surge supabase/functions/`
  is empty. That rules out `external-booking-webhook`, `ingest-external-booking`,
  `booking-chatbot`, quote conversion, recurring generation and migration import in one
  stroke.

So the same house, on the same Saturday, is priced differently depending on how the
booking was taken. And a recurring series regenerates at the base rate indefinitely —
every Saturday clean for a year, none surged.

### The finding that matters most

**The one path that applies surge is the public booking form**, which we established
earlier tonight has been rejecting every submission with a 401 since the
`x-webhook-secret` check went live around **9 May 2026**
(`docs/bugs/2026-07-30-public-booking-form-trace.md`).

**Dynamic pricing's only live path is a path that does not work.** Even for an org that
has it switched on, nothing has been surged since May — because nothing has been booked
through that form since May.

That also means the two items are coupled: fixing the booking form is what would make
dynamic pricing start charging money again. Worth knowing before that fix ships, so it
is a decision rather than a surprise on someone's invoice.

### And it was forgeable even when it worked

The multiplier is computed **in the browser** and sent as `total_amount`.
`external-booking-webhook:288` does `total_amount: payload.total_amount || 0` — it trusts
the client's figure. So a customer who edited the request could have submitted the
un-surged price and the server would have accepted it. Same root cause as
`docs/security/2026-07-29-booking-price-authority.md`; surge just makes the gap worth
more.

## 3. Which rules are live, which are dead config

**All three are read**, by the same function, from the same settings object. None is
configured-but-ignored. But four behaviours are undocumented anywhere a user would see:

**Rules do not stack — highest wins.** `getSurgeMultiplier` uses
`multiplier = Math.max(multiplier, …)` for each rule. A last-minute booking on a holiday
weekend charges **×1.25**, not ×1.15 × ×1.20 × ×1.25. That looks deliberate and is
probably the right call, but nothing states it — an owner setting all three would
reasonably expect them to compound.

**Last-minute silently requires a time.** `if (surge_lastminute_enabled && selectedTime)`
— if the flow reaches pricing without `selectedTime` set, the rule cannot fire. Worth
checking against arrival-window mode, where the customer picks a window rather than a
time.

**Past/now bookings never surge.** `hoursUntil > 0` excludes a booking placed for the
current moment or earlier — which is arguably the *most* last-minute case there is.

**The holiday rule is US-only, and nothing gates it on country.** `isUsHoliday` computes
US federal holidays. `organizations.country_code` exists, but is not consulted — so a
non-US org that enables holiday surge gets *American* holidays applied to its customers.

**A fifth, and this one is a real inconsistency:** the two date-sensitive rules use
different time bases.

```ts
const dow = selectedDate.getDay();                                    // LOCAL time
…
new Date(`${selectedDate.toISOString().split('T')[0]}T${selectedTime}`) // UTC date
```

The weekend check reads the local day; the last-minute check builds its timestamp from
the **UTC** date string. For any org east of UTC, a date picked as local-midnight
Saturday serialises to Friday in UTC, so the two rules disagree about which day it is.
Harmless for US orgs (negative offsets keep the same date), which is presumably why it
has never surfaced — but it is wrong, and it is wrong in the same direction as the
holiday gap: the feature is implicitly US-only without saying so.

## 4. Does the customer see why? No

**Nothing in the booking UI mentions surge, weekends, holidays or last-minute.**
`getSurgeMultiplier` feeds `calculateTotal` and nothing else — no badge, no line item, no
tooltip, no note on the confirmation.

The asymmetry is stark: `SurgePricingSettings` renders each multiplier as "+15%" for the
**admin**, so the person setting it sees a clear percentage. The **customer** sees only a
total that is higher than the quoted service price, with no line explaining it.

From the customer's side that reads exactly as you said — as a bug. And it is the kind
that produces a chargeback rather than a support ticket, because there is nothing to ask
about; the number is simply wrong as far as they can tell.

This would need fixing *before* the booking form is repaired, not after — the moment the
form works again, surge starts appearing on real prices with no explanation attached.

## 5. Is it on for anyone?

**Cannot be determined from the repo.** All three flags default to `false`, so the
answer is "only if someone deliberately switched it on in Settings → Pricing".

```sql
-- Is dynamic pricing switched on anywhere, and with what multipliers?
select o.name                        as organization,
       bs.organization_id,
       bs.surge_weekend_enabled,     bs.surge_weekend_multiplier,
       bs.surge_lastminute_enabled,  bs.surge_lastminute_hours, bs.surge_lastminute_multiplier,
       bs.surge_holiday_enabled,     bs.surge_holiday_multiplier,
       o.country_code
from public.business_settings bs
join public.organizations o on o.id = bs.organization_id
where bs.surge_weekend_enabled
   or bs.surge_lastminute_enabled
   or bs.surge_holiday_enabled
order by o.name;

-- One-line summary
select
  count(*)                                          as orgs_with_settings,
  count(*) filter (where surge_weekend_enabled)     as weekend_on,
  count(*) filter (where surge_lastminute_enabled)  as lastminute_on,
  count(*) filter (where surge_holiday_enabled)     as holiday_on,
  count(*) filter (where surge_weekend_enabled
                      or surge_lastminute_enabled
                      or surge_holiday_enabled)     as any_on
from public.business_settings;

-- Non-US orgs with holiday surge on — they are getting American holidays
select o.name, o.country_code, bs.surge_holiday_multiplier
from public.business_settings bs
join public.organizations o on o.id = bs.organization_id
where bs.surge_holiday_enabled
  and coalesce(o.country_code, 'US') <> 'US';
```

**How to read `any_on`:**

- **`any_on = 0`** → the feature is theoretical. Nobody has ever been surged, nothing is
  at risk, and this can be a backlog item rather than a bug. It also means the booking-form
  repair carries no pricing surprise.
- **`any_on > 0`** → those orgs believe they are charging more at weekends and holidays,
  and have not been since May. They should be told, and the missing customer-facing
  explanation becomes a blocker on the booking-form fix rather than a nice-to-have.

---

## Summary

| | |
|---|---|
| **What it does** | three multipliers — weekend ×1.15, last-minute ×1.20, holiday ×1.25 — highest wins, never stacked |
| **Where configured** | Settings → Pricing; the UI is properly wired and saves correctly |
| **Which paths apply it** | **one of eight** — the public booking form only |
| **Admin bookings** | never surged, despite sharing the same pricing engine |
| **Recurring series** | never surged, ever, on any occurrence |
| **Server-side** | no edge function knows surge exists; the multiplier is client-computed and trusted |
| **Is it firing?** | **No** — its only path has 401'd on every submission since ~9 May |
| **Customer explanation** | none at all |
| **On for anyone?** | unknown — run the query |
