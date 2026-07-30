# No server-side price authority on booking creation

**Status:** Open — needs one fact from you to fix severity
**Found:** 2026-07-29, while investigating loyalty tiers (Finding 3)
**Scope:** Independent of loyalty. Affects booking creation on every org.
**Related:** `docs/superpowers/plans/2026-07-29-loyalty-tiers-only.md` (this is why Part 2 was cut)

---

## The claim, stated precisely

**No code path in this codebase recomputes a booking's price server-side.** The price is calculated in the browser and written to the database as supplied.

This is not a loyalty problem. It exists today, on live bookings, with no tier feature in play.

## Evidence

`calculateBasePrice` lives in `src/lib/pricingEngine.ts` — frontend-only TypeScript. It has exactly two consumers, both in the browser:

- `src/components/admin/booking-form/BookingFormContext.tsx:12`
- `src/pages/PublicBookingPage.tsx:45`

No edge function imports it. Verified: `grep -rln "calculateBasePrice" supabase/functions/` returns nothing.

The public booking form computes the total and submits it (`src/pages/PublicBookingPage.tsx:572-610`):

```ts
const { data: webhookResult, error: webhookError } = await supabase.functions.invoke('external-booking-webhook', {
  body: {
    …
    total_amount: calculateTotal(),
    …
```

The receiving function validates only the *shape and range* of that number — never its correctness (`supabase/functions/external-booking-webhook/index.ts:26`):

```ts
total_amount: z.number().min(0).max(100000).optional().nullable(),
```

and writes it straight through (`:288`):

```ts
total_amount: payload.total_amount || 0,
```

So the accepted price is any number in `[0, 100000]`. A booking can be created for `$0.01` — or `$0` — regardless of the org's configured service pricing, square-footage tiers, frequency discounts, extras, or surge pricing. `bookings.subtotal` and `bookings.discount_amount` are likewise client-supplied.

The same is true of the second ingest path, `supabase/functions/ingest-external-booking/index.ts:138`:

```ts
total_amount: Number.isFinite(+body.total_amount) ? +body.total_amount : 0,
```

## Severity depends on one fact I could not determine

`external-booking-webhook` **does** authenticate — but with a per-org shared secret, checked at `:113-129`:

```ts
const providedSecret = req.headers.get("x-webhook-secret") ?? "";
if (!providedSecret) {
  return … "Missing x-webhook-secret header" …
}
const { data: secretOk, error: secretErr } = await supabase.rpc(
  "verify_external_booking_secret",
  { _org_id: organizationId, _secret: providedSecret }
);
if (secretErr || !secretOk) { … "Invalid webhook secret" … }
```

**But the public booking form sends no such header.** The `functions.invoke` call at `:572-610` passes only `body` — no `headers` option. `supabase-js` attaches the anon `apikey` and `Authorization` automatically; it does not attach `x-webhook-secret`.

Per the repository, therefore, every public booking submission should fail with `401 Missing x-webhook-secret header`. Public booking is a live production feature. Both cannot be true.

### The two possibilities

**(A) The deployed function predates the secret check.** This is CLAUDE.md's single most-documented failure mode: a git push changes files and deploys nothing. The secret check exists in the repo but was never deployed, so the live endpoint is anonymously callable.
→ **Severity: high.** Anyone who can read the public booking page can call the endpoint with any `total_amount`. No credential needed. Forgeable pricing on live bookings.

**(B) The secret check is deployed and public booking is currently broken.**
→ **Severity: low for pricing** (exposure limited to holders of a per-org secret — i.e. legitimate integrations, which is a trust problem rather than an anonymous one). **But then your public booking form is down**, which is worse commercially than the pricing bug.

### How to tell, without probing

I deliberately did not probe the live endpoint to find out. The only payload that discriminates between (A) and (B) is a *valid* org slug with no secret — and if the answer is (A), that call **creates a real booking**. The checks run in this order: Zod parse (`:66`) → org resolution (`:81-107`) → secret check (`:113`), so a deliberately-invalid org fails before reaching the secret check and tells you nothing.

**You already have the answer:** are public bookings arriving? If yes → (A), the secret check is not deployed. If public booking is failing at the final step → (B).

That single fact sets the priority. Please confirm it before anyone starts on this.

## Why the fix is not small

The correct fix is a **server-side price authority** — one place that computes a booking's price from the org's stored pricing configuration, which all creation paths must go through. Today that place does not exist, and the logic that would go in it lives in browser TypeScript (`src/lib/pricingEngine.ts`, plus `src/data/pricingData.ts`, `usePricing`, surge/frequency-discount settings loaded separately at `PublicBookingPage.tsx:216`).

Sketch of the options, worst to best:

1. **Range-check harder.** Useless — the attacker picks a plausible number.
2. **Recompute in `external-booking-webhook` only.** Covers the public form, leaves the admin stepper and `ingest-external-booking` inconsistent, and duplicates pricing logic in Deno.
3. **Port pricing to a Postgres function, call it from a `BEFORE INSERT` trigger on `bookings`.** Authoritative, covers every path including both webhooks, cannot be bypassed. Requires porting `calculateBasePrice` to SQL/plpgsql and keeping the browser copy in sync for display — or having the browser fetch a quote via RPC instead of computing.
4. **Quote-token flow.** Server issues a signed quote (price + inputs + expiry); the client submits the token, not a number. Strongest, most work.

**Recommendation: (3), with the browser fetching a quote for display rather than keeping a second implementation.** That was the same architecture recommended for tier discounts, which is not a coincidence — a tier discount is just another input to the price, and it needs the same authority that doesn't exist yet.

This is the reason Part 2 of the loyalty plan was cut. Building tier discounts on top of client-computed pricing would have added a second forgeable input to an already-forgeable total.

## Constraints for whoever picks this up

- `supabase/` is Lovable's. Schema and function changes ship as paste-ready Lovable prompts ending in "confirm deployed, not just committed."
- **Verify the deployed function, not the repo.** This item exists because those diverged.
- `bookings.subtotal`, `.total_amount`, `.discount_amount`, `.discount_id` exist live (verified 2026-07-29 by PostgREST probe). `bookings.total_price`, `.discount_percent` do **not**.
- Prices must never come from the offline query cache (CLAUDE.md rule 1 — `service-pricing` is already excluded from persistence for exactly this reason: a stale cached price can mis-charge a customer).
- Any change here touches money on every booking. It needs a Playwright spec covering the admin stepper, the public form, and both ingest paths before it ships.

## Related loose ends found alongside this

- `external-booking-webhook` is `verify_jwt = false` (`supabase/config.toml:44-45`), so it authorizes internally — correct pattern, but that makes the deployed-vs-repo question above the whole ballgame.
- `ingest-external-booking` uses a shared `x-api-key` against `EXTERNAL_BOOKING_INGEST_KEY` (documented at `:2-3`) — not browser-reachable, so lower exposure, but it has the same no-recompute defect.
- `PublicBookingPage.tsx:632` fires a Meta Pixel / GA4 `Purchase` conversion with `value: calculateTotal()` — the client-computed number. If the total is forgeable, so is your reported ad revenue.

---

# Investigation, 2026-07-29 (read-only)

Answers to the five questions, then two costed options. **No code changed.**

## 1. Every path that creates a booking with a price

Eight, not four. The original writeup listed the surfaces that *compute* a price;
these are the ones that *write* one.

| # | Path | Price comes from | Auth |
|---|---|---|---|
| 1 | Public form → `external-booking-webhook` | `calculateTotal()` in the browser (`PublicBookingPage:587`) | anon + `x-webhook-secret` (deployment state unconfirmed) |
| 2 | **Admin stepper → `useCreateBooking`** (`useBookings.ts`) → **direct browser insert** | `finalPrice` from `BookingFormContext` (`BookingStepper:648`), plus client-computed `discount_amount` (`:650`) | authenticated |
| 3 | `external-booking-webhook` (3rd-party callers) | payload, `z.number().min(0).max(100000)` (`:26`), written at `:288` | per-org secret |
| 4 | `ingest-external-booking` | payload, `Number.isFinite` only (`:138`) | `x-api-key` |
| 5 | **`RecurringBookingsPage:485`, `:533`** | `recurring.total_amount` copied from the template (`:451`, `:515`) | authenticated, direct browser insert |
| 6 | **`process-migration-import:286`, `:357`** | `normalizeMoney(data.total_amount)` from an uploaded CSV | service_role — **bypasses RLS entirely** |
| 7 | **Quote → booking conversion** (`QuotesTabContent:169`, `:212`, `:302`) | `quote.total_amount` | authenticated |
| 8 | `BookingStepper:368` writes a `quotes` row | `quoteAmount` (browser) | authenticated |
| — | Portal request page | **does not price.** Creates a request; an admin prices it later via path 2 | — |

**The structural point:** paths 2, 5 and 7 insert **directly from the browser**.
Any check placed in an edge function cannot see them. Only a database-level
guard covers all eight.

## 2. Can `calculateBasePrice` actually be shared? Yes — but it is not the problem

`src/lib/pricingEngine.ts` is **pure**: no React, no DOM, no browser API. Its only
import is `squareFootageRanges` from `src/data/pricingData.ts`, a static table of
label/maxSqFt pairs with no business config in it.

Deno can import TypeScript directly, so this is portable. Three mechanical
blockers, all small:

- the `@/` path alias is Vite-only → needs a relative import
- Deno requires explicit `.ts` extensions
- `squareFootageRanges` must move to the shared module, or be duplicated

**But `calculateBasePrice` only computes the BASE.** The number actually being
forged is `calculateTotal()` in `PublicBookingPage:455-521`, which is a
**component-local function** and applies eight further steps:

1. base (via `calculateBasePrice`)
2. `+ extras` (sum of selected extra prices)
3. `+ petFee` when `hasPets`
4. `− room reductions` (per-type count × price, minus excluded types, floored at service minimum)
5. `+ home condition fee`
6. `× (1 − frequency discount)` — custom frequencies take precedence via their own `discount_pct`
7. `× surge multiplier` (weekend / last-minute / holiday)
8. `Math.round()`

So sharing the engine buys ~15% of the problem. **The real work is extracting
`calculateTotal` out of the component into a shared, pure module** — and that is
also the honest answer to the drift worry: if it is extracted rather than
reimplemented, there is one implementation and no drift. Reimplementing in
plpgsql would create two.

## 3. What pricing depends on — and the good news

Everything the total needs is **already server-readable**:

| Input | Source | Server-readable? |
|---|---|---|
| sqft prices, bedroom grid, minimum price | `service_pricing` (`public-booking-data:96-97`) | yes |
| extras, home_condition_options, pet_options | **also `service_pricing`** — same row | yes |
| surge (weekend/last-minute/holiday), recurring discount config, custom frequencies | `get_public_booking_settings` RPC | yes |
| room reduction prices, excluded room types, pet fee | `business_settings` / `organization_pricing_settings` | yes |
| coupons / discounts | `discounts` table; redemption already server-side via `increment_coupon_use` | yes |
| tier benefits (future) | `client_tier_settings` + `resolve_customer_tier` | yes |

Two things live **only in the browser**:

- **`squareFootageRanges`** (`pricingData.ts:3`) — static, must move with the engine.
- **The surge holiday list** — hardcoded inline at `PublicBookingPage:546`:
  `['1/1','7/4','11/11','12/25','12/24','11/28','12/31','1/15','2/19','5/27','9/2','10/14']`

  **That list is a latent bug independent of this work.** Several of those are
  observed-date holidays that move every year — 11/28 (Thanksgiving), 1/15 (MLK),
  2/19 (Presidents), 5/27 (Memorial), 9/2 (Labor), 10/14 (Columbus). Hardcoded
  month/day means holiday surge fires on the wrong dates from 2027 onward. Worth
  its own ticket.

`src/data/pricingData.ts` also carries hardcoded `cleaningServices`, `extras`,
`homeConditionOptions`, `bedroomPricing` — but those are **fallbacks** used when
the DB has nothing, not the live source.

## 4. Meta Pixel — yes, send the server-confirmed number

`PublicBookingPage:632` fires the conversion with the client-computed value:

```ts
trackConversion('Purchase', { value: calculateTotal(), ... });
```

A forged total therefore forges reported ad revenue, which corrupts ROAS in Meta
and GA4 and any decision made from them. `:650` and `:658` do the same for `Lead`
and `InitiateCheckout`.

**Fix: fire `Purchase` from the value the server returned**, not from
`calculateTotal()`. The webhook response is already awaited at `:572-610` and
already returns `booking_number` — returning the persisted `total_amount`
alongside it is a small change and makes the pixel report what was actually
booked.

`Lead` and `InitiateCheckout` fire before submission, so no server number exists
yet; they can keep the client estimate. That is defensible — they are funnel
signals, not revenue.

## 5. Server vs browser disagreement — the product decision, named

**This will happen without any attacker**, and the reason is specific: the
last-minute surge multiplier depends on `Date.now()` (`PublicBookingPage:536-540`).
A customer who sees a price at T and submits at T+20min may cross
`surge_lastminute_hours` and be recomputed **higher**. Slow form-fills,
background tabs, and re-verification after payment all cause honest mismatch.

Three options:

- **A — Reject on any mismatch.** Safest financially, worst commercially. Honest
  time-based drift becomes a failed booking with no explanation the customer can
  act on.
- **B — Server number always wins, silently.** Cheapest to build, and the
  behaviour you already rejected elsewhere today: a customer who saw $180 and is
  charged $195 experiences a bait-and-switch, and cannot tell it from a bug.
- **C — Asymmetric: server wins downward, quoted price honoured upward, flag the
  gap.** *(recommended)*
  - `server < client` → charge the server's lower number. Nobody complains about
    paying less, and it kills the forgery ceiling.
  - `server > client` → **honour the price the customer was shown**, persist both,
    and flag for owner review. The gap is capped (see below) so this cannot be
    exploited for a large discount.
  - `|gap| > tolerance` → reject, because that is not clock drift, that is a
    forged input.

C matches the rule already applied to tier resolution today — fail in the
customer's favour, but never silently. It needs two new columns
(`quoted_total_amount`, `price_check_status`) and an owner-visible flag.

**The tolerance is the actual product decision** and should be set deliberately,
not inferred: a percentage, a dollar cap, or the max configured surge multiplier.
My suggestion is the largest single surge multiplier configured for the org, since
that bounds the only legitimate source of upward drift.

---

# Option 1 — Smallest change that stops a forged price being accepted

**A `BEFORE INSERT` trigger on `bookings` enforcing a price floor.**

Not an edge-function check: paths 2, 5 and 7 insert directly from the browser and
would bypass it. A trigger covers all eight paths, including the service-role
migration importer.

Three rungs, increasing cost:

### Rung 0 — floor at the service minimum (hours)

```
if NEW.service_id is not null:
    minimum := (select minimum_price from service_pricing where service_id = NEW.service_id)
    if minimum is not null and NEW.total_amount < minimum: reject
```

One lookup, one comparison, no pricing logic. **Stops the $0.01 and $0 booking**,
which is the actual attack. Does not stop $180 → $150.

Watch: `service_id` is null for recleans (`BookingStepper:641`) and may be null in
webhook payloads — the trigger must skip rather than reject when it cannot resolve
a service, or it will block legitimate bookings.

### Rung 1 — floor at a recomputed base, minus max plausible discount (days)

Port `calculateBasePrice` (it is pure — see Q2) to a shared module, recompute the
base from `service_pricing`, and reject below
`base × (1 − max_configured_discount)`. Needs the booking's pricing inputs to be
persisted or passed, which several paths do not currently send — that is the real
cost here, not the maths.

### Rung 2 — full authority (see Option 2)

**What Rung 0 buys:** absurd forgery becomes impossible on every path, today,
with no shared-code extraction and no product decision required. **What it does
not buy:** shaving within plausible range, and it does nothing for the pixel.

---

# Option 2 — Full server-side price authority

## Shape

1. **Extract `calculateTotal` from `PublicBookingPage` into a shared pure module**
   alongside `calculateBasePrice`, taking all inputs explicitly (no component
   state, no `Date.now()` — pass `now` in).
2. **One `quote` edge function** that loads `service_pricing` +
   `get_public_booking_settings`, calls the shared module, and returns
   `{ total, breakdown, inputs_hash, expires_at }`.
3. **Clients display the quote's number** rather than computing their own, so
   browser and server cannot disagree by construction.
4. **A `BEFORE INSERT` trigger** re-runs the quote server-side and applies the
   Q5 policy. This is what makes it an authority rather than a suggestion —
   without it, paths 2/5/6/7 still write whatever they like.
5. **Pixel fires the server number** (Q4).

## Cost, honestly

- Extracting `calculateTotal`: it reads ~12 pieces of component state. Mechanical
  but wide, and it touches the highest-traffic revenue path in the product.
- Deno/Vite dual-import of the shared module: solvable, and the reason to extract
  rather than reimplement — **one implementation, no drift.** Reimplementing in
  plpgsql would guarantee drift and is not recommended.
- The trigger needs pricing inputs available at insert time. Today
  `external-booking-webhook` receives `extras` as `{ names: [...] }`
  (`PublicBookingPage:590`) and `square_footage` as a **label string** (`:593`) —
  neither is a stable id. Persisting structured inputs on `bookings` is a schema
  change and is probably the single largest piece of work.
- Every one of the eight paths must supply those inputs, including the CSV
  importer, which has none.
- Needs the Q5 tolerance decided before it can ship.
- Highest-risk area in the codebase: it touches money on every booking, and the
  QA suite that would catch a regression is currently unrunnable (see
  `docs/superpowers/plans/2026-07-29-qa-fixture-rebuild.md`, parked).

## Recommended sequencing

Rung 0 now — it is small, covers all paths, needs no decisions, and removes the
exploitable case. Then Q4's pixel fix, which is independent and cheap. Then decide
Q5's policy, and only then take on Option 2, ideally after the QA suite runs
again.

**Do not build tier discounts on top of this until at least Rung 0 is in.** That
was the original reason Part 2 of the loyalty plan was cut, and it still holds.
