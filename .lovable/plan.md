
# Per-Organization AI Credit System

Big change with real cost implications. Two decisions I need you to confirm before I write code, then the full build plan.

---

## Decisions I need from you

### 1. Which Stripe account collects the $10 top-ups?

You wrote "each org's existing Stripe setup on our platform account" — those are two different things, and it matters:

- **Option A — Platform Stripe (recommended).** The $10 goes to *your* Stripe (TidyWise). Orgs are buying a TidyWise product (AI credits). This needs a `STRIPE_SECRET_KEY` secret on the platform (separate from the per-org OAuth Connect keys you already have for org→customer billing). Clean accounting, one product, one webhook.
- **Option B — Each org's own connected Stripe.** The $10 goes to the org. That means the org is charging *itself* for a service you're providing — doesn't make business sense; you'd be giving away AI compute and letting them collect the fee. Only do this if you literally want orgs to self-fund without you seeing revenue.

I'll build **Option A** unless you say otherwise. That means I'll ask for a platform `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (if you don't already have platform-level ones separate from the Connect OAuth flow).

### 2. `plan_type` source of truth

`organizations.plan_type` currently holds values like `lifetime`, and `has_active_subscription()` also considers Stripe subscriptions, lifetime grants, and hardcoded creator emails. The values you listed (`basic` / `pro` / `custom` / `trial`) don't exist in the codebase today.

Options:
- **A.** Add a `plan_tier` column to `organizations` (nullable, defaults to `trial`), and let you set it manually / on signup. I'll map `lifetime` + creator-bypass emails to `custom` (250/day) automatically.
- **B.** Derive tier from existing signals (Stripe subscription price ID → basic/pro, lifetime → custom, else trial). Needs you to tell me which Stripe price IDs map to which tier.

I'll go with **A** unless you say B.

---

## Build plan (assuming A + A above)

### Database (one migration)

```text
ai_usage_daily
  organization_id uuid, usage_date date, credits_used int
  PK (organization_id, usage_date)

ai_credit_ledger
  organization_id uuid PK, balance int (>=0), updated_at
  + ai_credit_ledger_entries (org, delta, reason, stripe_session_id, created_at)  -- audit trail

organizations.plan_tier text  -- 'trial'|'basic'|'pro'|'custom', default 'trial'
```

RPCs (all `SECURITY DEFINER`, `service_role` only):
- `get_ai_credit_status(org)` → `{ used_today, daily_limit, purchased_balance, resets_at }`
- `consume_ai_credit(org)` → atomic:
  1. `INSERT ... ON CONFLICT DO UPDATE SET credits_used = credits_used + 1 RETURNING credits_used` — same race-free pattern the rate limiter uses.
  2. If `credits_used <= daily_limit` → allowed.
  3. Else `UPDATE ai_credit_ledger SET balance = balance - 1 WHERE org = $1 AND balance > 0 RETURNING balance` — atomic decrement, only succeeds if balance > 0.
  4. If neither succeeded → rollback the daily increment and return `{allowed: false, ...}` so the failed attempt doesn't burn the daily row.
- `credit_ai_purchase(org, amount, stripe_session_id)` → idempotent by session id, `INSERT ... ON CONFLICT DO NOTHING` into a `processed_stripe_sessions` guard row so double-webhooks don't double-credit.

**UTC reset:** `usage_date` = `(now() at time zone 'utc')::date`. `resets_at` = start of next UTC day. Same in the RPC and the UI. Never touch `business_settings.timezone` for this.

### Edge functions

- `supabase/functions/_shared/ai-credits.ts` — helper `enforceAiCredit(supabase, { orgId, corsHeaders })`. Calls `consume_ai_credit`. On denial, returns 402 with:
  ```json
  { "error": "daily_limit_reached", "used": N, "limit": N, "purchasedBalance": 0, "resetsAt": "2026-07-07T00:00:00Z" }
  ```
- Wire into: `ai-message-assist`, `ai-sms-reply`, `ai-analysis-center`, `admin-help-chat`, `generate-campaign-templates`, `parse-pricing-file`, and the Copilot chat + inbox summary paths.
- **Skip:** `generate-daily-blogs` (platform-run, keeps the global rate limit only).
- Order: run **after** the per-minute rate limiter, **before** the AI Gateway call. Both layers stay.
- `ai-sms-reply` runs on inbound webhooks with no user. It still consumes 1 org credit per AI reply — this is the right default (an org that runs out stops auto-replying until they top up). Confirm if you'd rather have SMS auto-reply bypass the credit system.

- `buy-ai-credits` (new) — creates a Stripe Checkout session, `mode: payment`, price = a Stripe Price you'll create ($10 → 500 credits). Metadata: `organization_id`, `credits: 500`. Success/cancel URLs go to the AI Intelligence page with `?credits=success|cancel`.
- `stripe-ai-credits-webhook` (new) — verifies signature, on `checkout.session.completed` calls `credit_ai_purchase`. Idempotent by session id.

### Frontend

- `useAiCreditStatus(orgId)` React Query hook — polls `get_ai_credit_status` (staleTime 30s, refetch on window focus).
- `<AiCreditsMeter />` — small "AI credits: X left today · Y purchased" chip. Drop into the Copilot panel header and AI Intelligence page header.
- Central handler in `supabase.functions.invoke` wrappers for AI functions: detect `error.context` → parse JSON → if `code === 'daily_limit_reached'`, show a modal:
  > "You've used today's free AI actions (N/N). Resets at midnight UTC (in Xh Ym) — or buy 500 credits for $10."
  > [Buy 500 credits — $10]  [Wait until reset]
- Buy button → invokes `buy-ai-credits` → opens Checkout in a new tab.

### On your two check-questions

- **UTC consistency:** yes, all usage/reset math will use UTC. `usage_date` column is a plain `date` derived from `now() at time zone 'utc'`, the RPC returns `resetsAt` as a UTC ISO string, and the UI countdown converts from that ISO for display only — no per-org timezone anywhere in the credit path.
- **Trial 10/day "wow":** 10 is tight. Copilot chat is ~1 credit per user turn, inbox summary is 1, insights refresh is 1 — a trial user exploring the app can easily hit 10 in five minutes and then everything AI goes dark before onboarding lands. Options I'd prefer over 10:
  - **10/day + a one-time 50-credit onboarding grant** deposited into `ai_credit_ledger` on org creation (uses the same balance mechanism, no special code path). Gives them ~60 actions on day 1, then 10/day of steady drip.
  - Or bump trial to 25/day (same as basic).
  I'll do the **50-credit onboarding grant + 10/day** unless you'd rather bump the daily number.

### Order of operations if you approve

1. Confirm decisions 1 & 2 and the two sub-questions (SMS auto-reply billing + trial grant).
2. If Option A: I'll request `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for the platform account (if not already stored separately from your per-org Connect setup).
3. You create the $10 / 500-credit Price in your platform Stripe dashboard and paste me the `price_...` id (or I can create it via the Stripe tool once the key is in).
4. I ship the migration → helper → wire all 8 functions → buy/webhook functions → UI meter + 402 handler.

---

Reply with:
- Stripe: **A** or **B**
- Plan tier: **A** or **B** (with price-id mapping if B)
- SMS auto-reply: **bill** or **bypass**
- Trial: **10/day + 50 onboarding grant**, **25/day**, or **keep 10/day flat**

Then I'll build.
