# `{customer_name}` is documented as a first name and resolved as a full name

**Logged:** 2026-08-12, while choosing a token for the speed-to-lead SMS copy.
**Status:** Not fixed. Customer-visible today, in live SMS.
**Related:** `2026-08-12-speed-to-lead.md` (chose `{first_name}` to avoid compounding this)

## The gap

The token's own spec says first name. `supabase/functions/_shared/automation-templates.ts:80` and its verbatim twin `src/lib/automationTemplates.ts`:

```ts
const CUSTOMER_NAME: TokenSpec = { token: 'customer_name', description: "The customer's first name" };
```

That `description` is what an org owner reads in the Automation Center's token help when they write their message copy.

`resolveTemplate` computes nothing — it does `data[name] ?? ''`, so the value is whatever each calling edge function passes. The callers disagree:

| Caller | Passed to `{customer_name}` | Result |
|---|---|---|
| `process-recurring-offers/index.ts:196` | `` `${customer.first_name \|\| ""}`.trim() \|\| "there" `` | **first name** |
| `send-deposit-request/index.ts:78` | `` `${typedCustomer.first_name} ${typedCustomer.last_name}` `` | full name |
| `process-campaign-queue/index.ts:1024` | `` `${payload.first_name ?? ''} ${payload.last_name ?? ''}`.trim() `` | full name |
| `zapier-dispatch/index.ts:324` | `fullName` | full name |
| `openphone-webhook/index.ts:684` | `local.name` | full name |
| `sync-openphone-messages/index.ts:219` | `contact?.name \|\| ...` | full name |

One of six matches the documentation.

## Why it matters

An owner reads "the customer's first name", writes **"Hi {customer_name}!"**, and their customers receive **"Hi Ada Lovelace!"** — in a text message, where the full-name greeting reads like a mail merge that misfired. It is exactly the register you do not want in a message meant to feel personal.

This is the same class of problem as the error-boundary copy that promised "reported automatically" while nothing reached Sentry: the documentation makes a promise the code does not keep, and the person misled is the customer's customer.

## Why it is not just a copy fix

Changing the description to "the customer's full name" is one line, but it makes `process-recurring-offers` wrong instead — and that one is arguably the best-behaved of the six, since it also carries the `|| "there"` fallback for a blank name.

The real question is which the product wants. In SMS, first name is almost always right. If that is the answer, the fix is:

1. Keep the description as "first name".
2. Change the five full-name callers to pass a first name.
3. Give each the `|| "there"` fallback, so a customer with a blank or single-word name does not get "Hi !" — `process-recurring-offers:196` already shows the shape.

Roughly six one-line edits across six edge functions, plus a redeploy of each. No schema, no new machinery.

## Before touching it

- **Check the email templates too.** `resolveSubject` uses the same vocabulary, and a full name in an email greeting is far less jarring than in an SMS. If email wants full and SMS wants first, one token cannot serve both and it needs splitting into `{customer_name}` and `{customer_first_name}` — a bigger change, and the reason to decide this deliberately rather than patching one caller.
- **Both template files must change together.** They carry `KEEP IN SYNC` headers (`:4` and `:12`) and are verbatim copies; nothing enforces that today. `src/lib/automationTemplates.speedToLead.test.ts` now enforces it for one automation — worth generalising to the whole registry while in here.
- **`customers.first_name` nullability is unverified.** If it is nullable, the `|| "there"` fallback is doing more work than it looks like it is.

## Related smaller finding

`AUTOMATION_VOCABULARY` is per-automation, so `{first_name}` — which does exactly what the description of `{customer_name}` claims — already exists but is only allowed in `abandoned_booking_recovery`. Several automations could simply switch to it rather than having their caller changed. Whether that is cleaner depends on whether the value being passed is genuinely "the customer's first name" or "whatever name we have for this person", which differs by caller.
