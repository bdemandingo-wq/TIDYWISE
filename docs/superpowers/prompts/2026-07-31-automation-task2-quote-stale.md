# Lovable prompt — automation messages Task 2: migrate `quote_stale_reengage`

**Status:** ready to paste. Frontend half is already built and pushed.
**Gate cleared:** the `automation_steps` audit came back with zero rows across
zero orgs, so no owner has saved copy that would ship the moment senders start
reading the table.

---

## Two things that changed from the plan, both worth reading first

### 1. No migration. `message_class` belongs in code, not the schema.

The plan listed `message_class` as a missing column. Building it, that turned out
to be the wrong home. The class is a property of the **automation kind**, not of
an owner's edit — an owner must not be able to reclassify a marketing message as
transactional and shed the opt-out line. Putting it in a column invites exactly
that. It now lives in `AUTOMATION_DEFAULTS[key].message_class`, which is
tamper-proof and needs no migration.

**So Task 2 has no schema change at all.** Two files, one new, one edited.

### 2. The STOP line cannot ship alone — `quote-stale-reengage` does not check opt-outs

You approved adding the STOP sentence as "one sentence that removes a compliance
question permanently". It is one sentence, but on its own it would create a worse
question than it answers.

`quote-stale-reengage/index.ts` has **no opt-out check of any kind**. No
`isOptedOut`, no `isPhoneOptedOut`, no `marketing-guard` import — verified by
grep. Five other senders do use that guard (`process-campaign-queue`,
`process-review-sms-queue`, `process-recurring-offers`,
`followup-abandoned-booking`, `openphone-webhook`).

So shipping only the sentence would mean: we tell a customer to reply STOP, they
reply STOP, it is recorded — and the next stale quote texts them anyway. Inviting
an opt-out you then ignore is materially worse than never inviting it. **The
opt-out check is included below.** It is the other half of the same decision, not
scope creep, and if you want the sentence without it, say so and I will take both
back out.

---

## FILE 1 — create `supabase/functions/_shared/automation-templates.ts`

Verbatim copy of `src/lib/automationTemplates.ts` plus the STOP helpers. The
editor validates against the `src/` copy; this one resolves at send time. If they
drift, an owner can save a token the sender cannot resolve.

```ts
/**
 * Editable automation messages — vocabulary, validation and resolution.
 *
 * ─── THE RULE THAT MATTERS MOST ────────────────────────────────────────────
 * A missing or unusable template falls back to the seeded default. It NEVER
 * falls back to silence, and it never sends a blank message. The hardcoded copy
 * that used to live in the sender is not dead code after this migration — it is
 * the default, and it is what makes every failure mode safe. If you change a
 * default here you are changing what customers receive.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * KEEP IN SYNC: this is a verbatim copy of `src/lib/automationTemplates.ts`.
 * The editor validates against that copy; this one resolves at send time. If
 * they drift, an owner will be allowed to save a token the sender cannot
 * resolve. The tests in src/lib/automationTemplates.test.ts pin the behaviour
 * both copies owe — run them after any change here.
 */

export type AutomationKey = 'quote_stale_reengage';

/** Marketing messages get an opt-out line appended by the sender. Not editable. */
export type MessageClass = 'marketing' | 'transactional';

export interface TokenSpec {
  /** Without braces: 'customer_name'. */
  token: string;
  /** Shown in the editor, so it should read as help rather than as a schema note. */
  description: string;
  /**
   * The message has no purpose without it. A template missing a required token
   * is rejected at save time, and at send time falls back to the default rather
   * than sending something useless.
   */
  required?: boolean;
}

/**
 * Vocabulary is declared PER KEY, not globally, because it genuinely differs —
 * `{cleaner_name}` means something in a review request and nothing in a quote
 * nudge. A shared list would either permit tokens that cannot resolve or block
 * ones that can.
 */
export const AUTOMATION_VOCABULARY: Record<AutomationKey, TokenSpec[]> = {
  quote_stale_reengage: [
    { token: 'customer_name', description: "The customer's first name" },
    { token: 'service_name', description: 'The service they asked about' },
    { token: 'company_name', description: 'Your business name' },
    { token: 'quote_link', description: 'Link to their quote', required: true },
  ],
};

export interface AutomationDefault {
  sms_body: string;
  message_class: MessageClass;
  /** Shown in the editor above the box, so an owner knows what they are changing. */
  label: string;
}

/**
 * The seeded defaults. Copied verbatim from the senders they replace, so
 * migrating changes nothing about what is sent until an owner edits it.
 *
 * `quote_stale_reengage` is classed `marketing`, which ADDS an opt-out line the
 * hardcoded version never carried. That is a deliberate change to what customers
 * receive, decided on 2026-07-31: the nudge goes to someone who asked for a
 * price and did not book, which is close enough to marketing that carrying the
 * line is cheaper than defending its absence later. The sender appends it; it is
 * not part of the editable body, so an owner cannot remove it.
 */
export const AUTOMATION_DEFAULTS: Record<AutomationKey, AutomationDefault> = {
  quote_stale_reengage: {
    label: 'Quote follow-up',
    message_class: 'marketing',
    sms_body:
      'Hi {customer_name} — just checking in on your {service_name} quote from {company_name}. Still interested? View it here: {quote_link}. Reply if you have questions!',
  },
};

/** `{single}` braces — the syntax all three SMS engines already use. */
const TOKEN_PATTERN = /\{([a-z0-9_]+)\}/gi;

/** Every token appearing in a body, lowercased, in order of first appearance. */
export function tokensIn(body: string): string[] {
  const found: string[] = [];
  for (const m of body.matchAll(TOKEN_PATTERN)) {
    const name = m[1].toLowerCase();
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * Save-time validation. Returns an error string, or null when the body is fine.
 *
 * Returns a message rather than a boolean so the editor names the offending
 * token. "Invalid template" tells an owner nothing they can act on; the whole
 * value of validating at save time is that the person who can fix it is present.
 */
export function validateTemplate(key: AutomationKey, body: string): string | null {
  const trimmed = (body ?? '').trim();
  if (!trimmed) {
    return 'Message cannot be empty. Clear it and save to go back to the default wording.';
  }

  const vocabulary = AUTOMATION_VOCABULARY[key] ?? [];
  const allowed = new Set(vocabulary.map((t) => t.token));
  const used = tokensIn(trimmed);

  const unknown = used.filter((t) => !allowed.has(t));
  if (unknown.length > 0) {
    const list = [...allowed].map((t) => `{${t}}`).join(', ');
    return `{${unknown[0]}} isn't a thing we can fill in. Available: ${list}`;
  }

  const missingRequired = vocabulary.filter((t) => t.required && !used.includes(t.token));
  if (missingRequired.length > 0) {
    return `Your message needs {${missingRequired[0].token}} — without it the text has no purpose.`;
  }

  return null;
}

export interface ResolveResult {
  /** Never empty. */
  text: string;
  /** True when the default was used instead of the supplied template. */
  usedDefault: boolean;
  /** Non-null when something was wrong worth logging. */
  warning: string | null;
}

/**
 * Turn a template into a message, falling back to the default whenever the
 * template cannot produce something worth sending.
 *
 * The five cases, all of which send SOMETHING:
 *
 *   1. body null/undefined (no row at all)  → default
 *   2. body empty or whitespace             → default
 *   3. required token missing               → default   (a nudge with no link
 *                                                        is worse than stock copy)
 *   4. unknown token present                → strip the braces, send the rest,
 *                                             warn (legacy rows predate validation)
 *   5. otherwise                            → the template
 *
 * Missing DATA for a known token resolves to empty string rather than blocking:
 * the sender already defaults customer_name to "there" and service_name to
 * "cleaning service", so a blank here means the sender genuinely had nothing.
 */
export function resolveTemplate(
  key: AutomationKey,
  body: string | null | undefined,
  data: Record<string, string>,
): ResolveResult {
  const fallback = AUTOMATION_DEFAULTS[key];
  const vocabulary = AUTOMATION_VOCABULARY[key] ?? [];
  const allowed = new Set(vocabulary.map((t) => t.token));

  const trimmed = (body ?? '').trim();
  let warning: string | null = null;
  let usedDefault = false;
  let template = trimmed;

  if (!trimmed) {
    template = fallback.sms_body;
    usedDefault = true;
  } else {
    const used = tokensIn(trimmed);
    const missingRequired = vocabulary.filter((t) => t.required && !used.includes(t.token));
    if (missingRequired.length > 0) {
      template = fallback.sms_body;
      usedDefault = true;
      warning = `template missing required {${missingRequired[0].token}}, used default`;
    } else {
      const unknown = used.filter((t) => !allowed.has(t));
      if (unknown.length > 0) {
        warning = `template has unknown token(s): ${unknown.map((t) => `{${t}}`).join(', ')}`;
      }
    }
  }

  const text = template.replace(TOKEN_PATTERN, (_match, rawName: string) => {
    const name = rawName.toLowerCase();
    if (allowed.has(name)) return data[name] ?? '';
    // Unknown token: strip the braces rather than shipping literal {braces} to
    // a customer. Save-time validation stops new ones; this is for rows written
    // before validation existed.
    return rawName;
  });

  const finalText = text.trim();
  if (!finalText) {
    // Belt and braces: a template of nothing but tokens, all of which resolved
    // empty. Never send blank.
    return {
      text: fallback.sms_body.replace(TOKEN_PATTERN, (_m, n: string) => data[n.toLowerCase()] ?? ''),
      usedDefault: true,
      warning: 'template resolved to empty, used default',
    };
  }

  return { text: finalText, usedDefault, warning };
}


/* ─── STOP compliance ──────────────────────────────────────────────────────
 * Ported from src/components/admin/campaigns/stopCompliance.ts. Case-SENSITIVE
 * on purpose: lowercase "stop" is ordinary English ("we'll stop by Tuesday")
 * and would pass a case-insensitive check while containing no opt-out
 * instruction at all — a false pass that lets a non-compliant message through
 * while appearing validated.
 */
export const STOP_SENTENCE = 'Reply STOP to opt out.';

export function hasStopLanguage(body: string | null | undefined): boolean {
  if (!body) return false;
  return /\bSTOP\b/.test(body);
}

/** Idempotent — safe to call twice, will not stack duplicate sentences. */
export function withStopSentence(body: string): string {
  if (hasStopLanguage(body)) return body;
  const trimmed = body.trimEnd();
  if (!trimmed) return STOP_SENTENCE;
  const needsSpace = !/[.!?]$/.test(trimmed);
  return `${trimmed}${needsSpace ? '.' : ''} ${STOP_SENTENCE}`;
}
```

---

## FILE 2 — edit `supabase/functions/quote-stale-reengage/index.ts`

Currently at `:116`:

```ts
const message = `Hi ${customerName} — just checking in on your ${serviceName} quote from ${companyName}. Still interested? View it here: ${quoteLink}. Reply if you have questions!`;
```

Replace that single line with the block below. **Everything else in the function
stays as it is** — the dedupe check, the `send-openphone-sms` call, the summary
counters and the `automation_fire_log` insert are all unchanged except for two
added metadata fields.

```ts
// ── template lookup ────────────────────────────────────────────────────
// One join, once per org — hoist this ABOVE the per-quote loop, not inside
// it. Fetching per quote would be N queries for one row that cannot change
// mid-run.
//
// A missing definition, a missing step, or a query error ALL leave
// templateBody null, which resolveTemplate turns into the seeded default.
// There is deliberately no path here that skips a customer: a lookup
// failure must degrade to the stock wording, never to silence.
let templateBody: string | null = null;
{
  const { data: def, error: defErr } = await supabase
    .from("automation_definitions")
    .select("id, enabled")
    .eq("organization_id", orgId)
    .eq("automation_key", "quote_stale_reengage")
    .maybeSingle();

  if (defErr) {
    console.warn(`[quote-stale-reengage] template lookup failed org=${orgId}, using default:`, defErr);
  } else if (def && def.enabled !== false) {
    const { data: step, error: stepErr } = await supabase
      .from("automation_steps")
      .select("sms_body")
      .eq("automation_id", def.id)
      .in("channel", ["sms", "both"])
      .eq("recipient_client", true)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (stepErr) {
      console.warn(`[quote-stale-reengage] step lookup failed org=${orgId}, using default:`, stepErr);
    } else {
      templateBody = step?.sms_body ?? null;
    }
  }
}
```

Then, inside the per-quote loop, replacing the old `const message = ...`:

```ts
const customerName = quote.customer.first_name ?? "there";
const serviceName = quote.service?.name ?? "cleaning service";
const quoteLink = `${QUOTE_LINK_BASE}/${quote.id}`;

// ── opt-out check — see the note above; the STOP line requires this ────
// Checked per customer, not per org. A quote nudge is classed marketing, so
// someone who has opted out must not receive it however the copy is worded.
if (quote.customer.id) {
  const optedOut = await isOptedOut(supabase, quote.customer.id, orgId);
  if (optedOut) {
    summary.skipped += 1;
    continue;
  }
} else if (quote.customer.phone) {
  const optedOut = await isPhoneOptedOut(supabase, quote.customer.phone, orgId);
  if (optedOut) {
    summary.skipped += 1;
    continue;
  }
}

// ── resolve ────────────────────────────────────────────────────────────
const resolved = resolveTemplate("quote_stale_reengage", templateBody, {
  customer_name: customerName,
  service_name: serviceName,
  company_name: companyName,
  quote_link: quoteLink,
});
if (resolved.warning) {
  console.warn(`[quote-stale-reengage] org=${orgId} quote=${quote.id}: ${resolved.warning}`);
}

// ── STOP line — appended by code, never part of the editable body ──────
// AUTOMATION_DEFAULTS says this key is 'marketing'. withStopSentence is
// idempotent, so an owner who types their own STOP sentence does not get
// two.
const message =
  AUTOMATION_DEFAULTS.quote_stale_reengage.message_class === "marketing"
    ? withStopSentence(resolved.text)
    : resolved.text;
```

Add the import at the top:

```ts
import {
  resolveTemplate,
  withStopSentence,
  AUTOMATION_DEFAULTS,
} from "../_shared/automation-templates.ts";
import { isOptedOut, isPhoneOptedOut } from "../_shared/marketing-guard.ts";
```

And extend the existing `automation_fire_log` metadata with two fields so a
future run can tell which wording went out without re-deriving it:

```ts
metadata: {
  customer_name: customerName,
  service_name: serviceName,
  used_default: resolved.usedDefault,   // ADD
  template_warning: resolved.warning,   // ADD
  sent_at: new Date().toISOString(),
  // ...whatever else is already here, unchanged
},
```

**Check `isOptedOut`'s actual signature before wiring it** — I read its exports
but not its parameter order, and five callers already exist to copy from. If it
takes `(supabase, customerId, orgId)` the above is right; if not, match the
existing callers rather than the sketch.

---

## AFTERWARDS please confirm

1. Both functions **DEPLOYED**, not just committed.
2. Paste one test send: pick an org with a stale quote, and show the message body
   that went out, so I can see the STOP line present exactly once.
3. Paste:

```sql
-- Should still be zero rows: nobody has edited anything yet, so every send
-- this run used the seeded default.
select count(*) as steps_rows from public.automation_steps;

-- And the fire log should show used_default = true for everything in this run.
select metadata->>'used_default'   as used_default,
       metadata->>'template_warning' as warning,
       count(*)
from public.automation_fire_log
where automation_type = 'quote_stale_reengage'
  and created_at > now() - interval '1 day'
group by 1, 2;
```
