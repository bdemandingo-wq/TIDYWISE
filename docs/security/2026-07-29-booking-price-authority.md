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
