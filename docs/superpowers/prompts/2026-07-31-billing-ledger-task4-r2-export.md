# Lovable prompt — Task 4: scheduled billing export to R2, with an email heartbeat

**Status:** ready to paste, one message.
**Depends on:** Tasks 1 and 2, both live and verified.
**Schema source:** `src/integrations/supabase/types.ts` (regenerated after Task 1),
not the migration files — per CLAUDE.md rule 4b.
**Signer verified:** the SigV4 code in section 5 was run against both of AWS's
published test vectors before this was written — the signing-key derivation
(`c4afb1cc…a4b9`) and the full end-to-end `iam:ListUsers` signature
(`5d672d79…b5d7`). Both match exactly, and the `amzDate` formatting produces
`20260731T160000Z`. That is the part most likely to be silently wrong, and it
isn't.

---

## ADD THESE SECRETS FIRST — five new, two already exist

Add these in Lovable **before** pasting the prompt, or the first run fails at
runtime rather than at deploy:

| Secret | What it is | Where to get it |
|---|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account id | R2 dashboard → the `<id>.r2.cloudflarestorage.com` endpoint |
| `R2_ACCESS_KEY_ID` | R2 API token access key | R2 → Manage API Tokens → Create (**Object Read & Write**) |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret | Shown **once** at token creation |
| `R2_BUCKET` | Bucket name | e.g. `tidywise-billing` — create it first, it is not auto-created |
| `BILLING_EXPORT_EMAIL_TO` | Your personal address | The heartbeat recipient. Deliberately **not** a jointidywise.com address — if the domain or Resend breaks, a same-domain heartbeat breaks with it |

**Already present, do not re-add:** `RESEND_API_KEY` (27 uses), `CRON_SECRET`
(8 uses). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

**Optional, both have defaults** — only add to override:
`R2_PREFIX` (default `billing`), `BILLING_EXPORT_EMAIL_FROM` (default
`TidyWise Billing <billing@jointidywise.com>`, already a verified sender).

Two things worth knowing before you create the bucket:

- **Make it private.** The export contains customer emails and revenue. Nothing in
  this design needs public access; the email carries a manifest, not a link.
- **Turn on object versioning** if R2 offers it on your plan. Keys are dated so
  overwrites shouldn't happen, but versioning is the difference between a bad
  export overwriting a good one and not.

---

## Design decisions worth stating, since they're load-bearing

**Export and email are the same event, monthly.** A weekly export with a monthly
email would leave three of four runs unwitnessed, which defeats the point of a
heartbeat. Monthly RPO is acceptable here specifically because `billing_events`
is a *mirror* of Stripe, rebuildable with `billing-backfill` — the export is
protection against losing Supabase, not against losing Stripe.

**Nothing new in the database.** The MRR series is derived in TypeScript inside
the function. No new view, no migration except the cron schedule.

**`raw` is excluded from every CSV.** It is the full Stripe object per row; it
would multiply file size several-fold and destroy the "open it and read it"
property that is the whole acceptance test.

**Every money column appears twice** — `*_cents` (integer, authoritative) and
`*_usd` (decimal, readable). The acceptance test is a human opening a file, and
`4900` is not an answer to "what was MRR in March".

---

## The prompt

````
Please create a new edge function `billing-export` on the main project
(slwfkaqczvwvvvavkgpr), deploy it, and add one migration to schedule it.

PURPOSE: a monthly self-contained dump of the billing ledger to Cloudflare R2,
plus an email that acts as a heartbeat. Object storage fails silently; an email
that stops arriving is how I find out.

ACCEPTANCE TEST — design to this, it is not decoration:
Someone opens the exported files on a laptop with no access to Supabase, no
access to Stripe, and no access to this repo, and answers "what was MRR in
March?" from the files alone. If that needs a join they can't do, or a column
whose meaning isn't written down, the export has failed.

SECRETS — all of these are already added, do not create or rename them:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
  BILLING_EXPORT_EMAIL_TO, RESEND_API_KEY, CRON_SECRET
Optional with defaults: R2_PREFIX (default "billing"),
BILLING_EXPORT_EMAIL_FROM (default 'TidyWise Billing <billing@jointidywise.com>').

Add `billing-export` to config.toml with verify_jwt = false — it authorises
itself with the shared secret below.

──────────────────────────────────────────────────────────────────────────
1. AUTHORISATION — mirror billing-export on billing-backfill's existing shape
──────────────────────────────────────────────────────────────────────────
Accept EITHER:
  - header `x-cron-secret` equal to CRON_SECRET  (this is what pg_cron sends), OR
  - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
Anything else → 401. Do NOT add a public path and do NOT accept an anon JWT.

──────────────────────────────────────────────────────────────────────────
2. READ THE DATA — paging is mandatory
──────────────────────────────────────────────────────────────────────────
Use the service-role client.

CRITICAL (CLAUDE.md rule 3): every paged read MUST have a deterministic order
including a UNIQUE tiebreaker, or .range() will skip and duplicate rows across
pages. This has already caused a live bug in this codebase. For each table page
in blocks of 1000 with BOTH order clauses:

  billing_events:
    .select('*').order('occurred_at', {ascending:true}).order('id', {ascending:true})
  billing_subscription_periods:
    .select('*').order('effective_from', {ascending:true}).order('id', {ascending:true})
  billing_revenue_by_confidence:
    .select('*').order('month', {ascending:true}).order('stream', {ascending:true})
      .order('confidence', {ascending:true})
    (this one is a small aggregate view; a single read is fine, but keep the order)

Do NOT swallow a read error into an empty array (CLAUDE.md rule 5). If any read
fails, abort the upload, and STILL SEND THE EMAIL with the failure in it — see
section 6. An export that silently writes an empty CSV over a good one is the
worst possible outcome here.

──────────────────────────────────────────────────────────────────────────
3. DERIVE THE MRR SERIES — this is what makes the acceptance test pass
──────────────────────────────────────────────────────────────────────────
billing_subscription_periods holds periods, not months. Nobody can answer "MRR in
March" from that without writing a window query, so compute it here.

For each subscription period, normalise unit_amount_cents to a MONTHLY figure:

  months_per_period =
      billing_interval === 'month' ? interval_count
    : billing_interval === 'year'  ? interval_count * 12
    : billing_interval === 'week'  ? interval_count / 4.345
    : billing_interval === 'day'   ? interval_count / 30.44
    : null   // unknown interval — see below

  gross_monthly = (unit_amount_cents * quantity) / months_per_period
  after_percent = discount_percent ? gross_monthly * (1 - discount_percent/100)
                                   : gross_monthly
  monthly_cents = Math.round(
      after_percent - ((discount_amount_cents ?? 0) / months_per_period))

If billing_interval is anything other than month/year/week/day, do NOT guess:
emit the row with monthly_cents empty and interval_recognised = false, and count
those rows in the email. A silently-wrong MRR is worse than a visible gap.

Then build a month-by-month grid. Months run from the earliest effective_from to
the current month inclusive, as 'YYYY-MM'. A period belongs to month M when:

  effective_from < first_day_of_next_month(M)
  AND (effective_to IS NULL OR effective_to >= first_day_of(M))

Emit ONE ROW PER (month, subscription) — not a pre-aggregated total. Aggregating
here would bake in my definition of which statuses count, and whoever opens this
file in two years may need a different one. Keep `status` on every row so they
can recut it.

──────────────────────────────────────────────────────────────────────────
4. BUILD SIX FILES
──────────────────────────────────────────────────────────────────────────
CSV rules, applied to every file:
  - Prepend a UTF-8 BOM (﻿). Without it Excel mangles non-ASCII business
    names, and this file is meant to be opened by a human.
  - RFC4180 quoting: wrap a field in double quotes if it contains a comma, a
    double quote, a newline or a carriage return; escape embedded quotes by
    doubling them. Write null as an EMPTY field, never the text "null".
  - Timestamps as full ISO-8601 UTC, exactly as they come from Postgres.
  - Every money column twice: <name>_cents (integer) and <name>_usd (cents/100,
    two decimals).
  - EXCLUDE the `raw` column from every file. It is the entire Stripe object and
    would bloat the export and ruin readability.

FILE 1 — billing_events.csv
  All columns of billing_events EXCEPT raw, in this order:
    id, occurred_at, event_type, revenue_stream, revenue_stream_corrected,
    stream_effective, correction_confidence, correction_basis, corrected_at,
    counts_as_cash, is_proration, amount_cents, amount_usd, fee_cents, fee_usd,
    net_cents, net_usd, currency, organization_id, organization_name,
    customer_email, description, stripe_object_id, stripe_charge_id,
    stripe_invoice_id, stripe_payment_intent_id, stripe_subscription_id,
    stripe_customer_id, synced_at

  `stream_effective` is a DERIVED column you must add:
    coalesce(revenue_stream_corrected, revenue_stream)
  Include it because that coalesce is the documented way to read this table, and
  a standalone reader has no way to know that. Keep the two source columns too so
  the correction stays visible.

FILE 2 — billing_subscription_periods.csv
  All columns EXCEPT raw:
    id, stripe_subscription_id, status, effective_from, effective_to,
    plan_label, billing_interval, interval_count, quantity,
    unit_amount_cents, unit_amount_usd, discount_percent,
    discount_amount_cents, discount_amount_usd, currency, revenue_stream,
    organization_id, organization_name, customer_email, stripe_customer_id,
    stripe_price_id, cancellation_reason, cancellation_detail, synced_at

FILE 3 — billing_revenue_by_confidence.csv
  The view as-is, plus USD columns:
    month, stream, confidence, events, payment_events, reversal_events,
    gross_cents, gross_usd, reversal_cents, reversal_usd,
    net_cash_cents, net_cash_usd

FILE 4 — mrr_by_month.csv        ← the acceptance test lives here
  One row per (month, subscription):
    month, stripe_subscription_id, organization_id, organization_name,
    customer_email, plan_label, status, billing_interval, interval_count,
    quantity, unit_amount_cents, unit_amount_usd, discount_percent,
    discount_amount_cents, monthly_cents, monthly_usd, interval_recognised,
    effective_from, effective_to
  Sort by month, then organization_name, then stripe_subscription_id.

FILE 5 — manifest.csv
  One row per exported file: filename, row_count, byte_size, sha256_hex,
  generated_at. This is what makes a truncated or empty file detectable later.

FILE 6 — README.txt          ← without this the export does NOT pass
  Plain text. It must contain, in full sentences:

  a) When it was generated (ISO timestamp) and which project it came from.
  b) What each file is, one paragraph each.
  c) A column glossary for every column in every CSV. Explicitly define:
       - amount_cents is an INTEGER NUMBER OF CENTS; divide by 100 for dollars.
         Negative values are refunds, disputes and chargebacks.
       - counts_as_cash: only rows where this is true represent money that moved.
         Every revenue figure in these files is filtered on it.
       - stream_effective = coalesce(revenue_stream_corrected, revenue_stream).
         Use this, not revenue_stream, which is the original uncorrected label.
       - correction_confidence: certain / probable / inferred. NEVER add inferred
         rows into a headline figure without saying so.
       - the four revenue_stream values, and that `plan`, `ai_credits` and
         `ad_management` are TidyWise's own SaaS revenue while
         `merchant_cleaning` is money the cleaning businesses' own customers paid
         them. THESE TWO MUST NEVER BE SUMMED TOGETHER. They are two different
         businesses that share one Stripe account.
  d) A worked example, verbatim, using the real numbers from this run:

       HOW TO ANSWER "WHAT WAS MRR IN MARCH 2026"
       1. Open mrr_by_month.csv
       2. Filter month = 2026-03
       3. Filter status to the ones you want to count. `active` is billed and
          paying. `trialing` is not yet paying. `past_due` is billed but the
          payment failed. Most people want active + past_due.
       4. Sum the monthly_usd column.
       For this export that gives: active = $<X>, active+past_due = $<Y>,
       including trialing = $<Z>.
       This is CONTRACTED recurring revenue, not cash received. For cash, use
       billing_revenue_by_confidence.csv, which is what actually settled. The two
       differ by prorations, refunds and timing, and they are supposed to differ.

  Compute X, Y and Z at run time and write the real figures in. A worked example
  with placeholder numbers is worth nothing to someone reading it in two years.

──────────────────────────────────────────────────────────────────────────
5. UPLOAD TO R2 — SigV4 by hand, no SDK
──────────────────────────────────────────────────────────────────────────
Keys: `${R2_PREFIX}/${YYYY-MM-DD}/${filename}`, and ALSO write every file to
`${R2_PREFIX}/latest/${filename}`. Dated keys are the archive; `latest/` is what
you grab in a hurry.

Use Web Crypto only. Here is the signer — please use it as written, this is the
part that is fiddly to get right:

  const enc = new TextEncoder();
  const hex = (b: Uint8Array) =>
    [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

  async function sha256Hex(data: Uint8Array | string): Promise<string> {
    const buf = typeof data === "string" ? enc.encode(data) : data;
    return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)));
  }

  async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
    const k = await crypto.subtle.importKey(
      "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
  }

  async function putToR2(key: string, body: Uint8Array, contentType: string) {
    const account = Deno.env.get("R2_ACCOUNT_ID")!;
    const bucket  = Deno.env.get("R2_BUCKET")!;
    const akid    = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const secret  = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const host    = `${account}.r2.cloudflarestorage.com`;
    const region  = "auto";      // R2 requires exactly "auto"
    const service = "s3";

    // 20260731T160000Z  — strip dashes, colons and milliseconds
    const amzDate   = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const canonicalUri =
      "/" + [bucket, ...key.split("/")].map(encodeURIComponent).join("/");
    const payloadHash = await sha256Hex(body);

    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      "PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash,
    ].join("\n");

    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest),
    ].join("\n");

    let k = enc.encode("AWS4" + secret);
    for (const part of [dateStamp, region, service, "aws4_request"]) {
      k = await hmac(k, part);
    }
    const signature = hex(await hmac(k, stringToSign));

    const res = await fetch(`https://${host}${canonicalUri}`, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        "Authorization":
          `AWS4-HMAC-SHA256 Credential=${akid}/${scope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`R2 PUT ${key} failed: ${res.status} ${await res.text()}`);
    }
  }

Content types: "text/csv; charset=utf-8" for .csv, "text/plain; charset=utf-8"
for README.txt.

Upload files SEQUENTIALLY, not with Promise.all — collect per-file success or
failure rather than letting one rejection abandon the rest. Every file that CAN
be written should be written, and the email reports which weren't.

──────────────────────────────────────────────────────────────────────────
6. THE EMAIL — the heartbeat, and it must always send
──────────────────────────────────────────────────────────────────────────
Send via the Resend REST API (POST https://api.resend.com/emails with
`Authorization: Bearer ${RESEND_API_KEY}`), from BILLING_EXPORT_EMAIL_FROM to
BILLING_EXPORT_EMAIL_TO.

SEND IT ON EVERY RUN, INCLUDING FAILED ONES. Wrap the whole export in try/catch
and send from the finally path. The only thing that should ever stop this email
is the function not running at all — that is precisely the signal I want.

Subject:
  success  → `TidyWise billing export OK — <YYYY-MM-DD> — MRR $<active+past_due>`
  failure  → `TidyWise billing export FAILED — <YYYY-MM-DD>`
Putting the figure in the subject line means a wrong number is visible without
opening anything, and a subject that stops changing is itself a symptom.

Body (plain text is fine) must include:
  - the R2 bucket and the dated prefix written to
  - a table of file / rows / bytes
  - MRR for the most recent COMPLETE month: active, active+past_due, and the
    trialing figure separately
  - cash for that same month from billing_revenue_by_confidence, split
    certain+probable vs inferred, and SaaS vs merchant_cleaning shown as two
    separate figures that are never added together
  - the count of rows with interval_recognised = false, if any
  - any per-file upload failures, with the error text
  - the newest occurred_at in billing_events, so staleness is visible: if that
    date stops moving, the backfill has stopped even though the export works

──────────────────────────────────────────────────────────────────────────
7. SCHEDULE IT — one migration
──────────────────────────────────────────────────────────────────────────
Match the existing pg_cron pattern in this project exactly, including the vault
secret names (lowercase `supabase_url` and `cron_secret`) and the header name:

  select cron.unschedule('billing-export-monthly')
  where exists (select 1 from cron.job where jobname = 'billing-export-monthly');

  select cron.schedule('billing-export-monthly', '0 6 1 * *',
    $$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
               where name='supabase_url') || '/functions/v1/billing-export',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets
                          where name='cron_secret')),
      body := jsonb_build_object('source','cron')
    );$$);

06:00 UTC on the 1st. The month that just ended is complete by then in every
timezone, so "most recent complete month" is never ambiguous.

──────────────────────────────────────────────────────────────────────────
8. RETURN VALUE
──────────────────────────────────────────────────────────────────────────
JSON: { ok, generated_at, bucket, prefix, files:[{name,rows,bytes,uploaded}],
mrr:{month,active_usd,active_plus_past_due_usd,trialing_usd},
newest_event_at, errors:[] }. HTTP 200 when everything uploaded, 500 when
anything failed — but send the email either way.

──────────────────────────────────────────────────────────────────────────
AFTERWARDS
──────────────────────────────────────────────────────────────────────────
1. Confirm the function is DEPLOYED, not merely committed, and that the
   migration RAN.
2. Invoke it once manually so I get the first email immediately rather than
   waiting until the 1st. Paste the JSON it returns.
3. Paste:
     select jobname, schedule, active from cron.job
     where jobname = 'billing-export-monthly';
````

---

## What I could not verify from here, and what to check on the first run

**Memory.** The function builds every file in memory before uploading. That is
fine at the current size — `billing_events` is in the low thousands of rows — but
it is not fine forever. The first email reports byte sizes; if
`billing_events.csv` approaches ~50 MB, this needs converting to a streamed
multipart upload, which is a different and considerably more annoying function.
Worth watching the number rather than waiting for an out-of-memory failure.

**The R2 token's permissions.** "Object Read & Write" is required. A read-only
token deploys fine and fails at the first PUT with a 403, which the email will
report — but it is a wasted month if the first run is the 1st. This is why step
2 of the handover invokes it manually.

**`interval_recognised`.** I specified month/year/week/day. If Stripe returns
anything else the row is emitted with an empty `monthly_cents` and counted in the
email rather than guessed at. If that count is non-zero on the first run, the
normalisation needs extending before the MRR figure can be trusted.

**Timezone on month boundaries.** Months are cut on UTC. Everything in
`billing_revenue_by_confidence` is already `date_trunc('month', occurred_at)` in
UTC, so the two agree — but it does mean a payment at 23:00 on 31 March in a
US timezone lands in March, not April. That's consistent, not correct, and the
README should not claim otherwise.
