# Lovable prompt — blog quality scoring never checks that TidyWise is positioned

**Status:** not yet run. `supabase/functions/` is Lovable's, so this ships as a prompt.
**Found:** 2026-07-30.
**Also answers:** "is the generator even running?" — see the last section. **Run those queries first**; if it is paused, this fix changes nothing until it restarts.

---

## Confirmed: the premise is right, with one correction

`calcQualityScore()` (`generate-daily-blogs/index.ts:52-78`) awards 100 points across
five slots. **None of them mentions TidyWise.**

| Slot | Points | Checks |
|---|---|---|
| Words | 30 | ≥2500 / ≥1500 / ≥1000 |
| FAQ | 15 | `frequently asked` or `<h2>faq` present |
| Competitors **or** Specifics | 25 | distinct competitor names, **or** sentences containing digits |
| Structure | 20 | `<h2>` and `<h3>` present |
| Meta | 10 | `meta_title` and `meta_description` both set |

**Correction to the premise:** competitor mentions are not *enforced*, and not always
wanted. `keywordNeedsCompetitors()` (`:48-51`) only applies that slot when the keyword
matches `software|vs|alternative|app|tool`; every other topic is scored on numeric
specifics instead. So the 25-point slot is conditional, not a blanket 3+ requirement.

That does not weaken your conclusion — it sharpens it. On software/comparison topics
the model is scored on how many **rivals** it names and scored on nothing at all for
naming us. Maximum points come from a thorough competitor roundup that never
positions TidyWise. The posts read like competitor articles because that is precisely
what the rubric rewards.

**The prompt already asks for what the scorer ignores** (`:100-112`): "End with a
conclusion that includes a soft CTA mentioning TidyWise naturally", "Include 2-4
internal links… to relevant TidyWise pages", "Position TidyWise honestly". All three
are unverified, so when the model skips them nothing notices.

### Two structural constraints on any fix

1. **The rubric already totals exactly 100** and is capped by `Math.min(100, score)`.
   A new slot cannot be added without taking points from existing ones.
2. **`tooLowQuality = score < 60` only gates auto-publishing** (`:317-318`). Low
   scorers are still inserted as drafts. So scoring is the right lever for "should
   this go live", but it never prevents a bad post existing.

---

## What is checkable without making posts formulaic

The risk with brand checks is that they become templates — every post growing an
identical "Why TidyWise" section. Sorting the candidates by signal-per-rigidity:

**Strong — many valid surface forms, hard to game:**

- **Internal link to a TidyWise page.** A real conversion path, not prose. Already
  requested in the prompt, never verified. Regex on `<a href="/pricing|/features|/compare|/blog">`.
  Cannot be satisfied by a name-drop.
- **Share of voice.** On posts where competitors appear, brand occurrences ≥ competitor
  occurrences. This is the one that speaks directly to "reads like a competitor
  article" — it dictates no phrasing whatsoever, and only bites where rivals are
  already named.
- **Presence in the closing section.** Brand appears in the final ~20% of the body,
  which is where the CTA is supposed to be. Structural, not phrasal.

**Weak alone, fine as a floor:**

- **Raw mention count ≥3.** Cheap and a bare name-drop passes it. Worth having as a
  floor but not as the main signal — and pushing it higher invites stuffing, which is
  an SEO negative in its own right.

**Rejected as too formulaic:**

- Requiring a named section (`<h2>Why TidyWise</h2>`) — every post ends up identical.
- Requiring a fixed phrase or CTA wording — templating, and reads as such.
- A high mention quota — produces keyword stuffing, not positioning.

Recommendation: **all three strong checks plus the floor**, as one 15-point slot. Each
is independently satisfiable in many ways, and a post that passes all four is
genuinely positioned rather than decorated.

---

## The prompt

```
Please update and DEPLOY the generate-daily-blogs edge function.

CONTEXT: calcQualityScore() awards 100 points across word count, FAQ, competitor
mentions (or numeric specifics), structure and meta tags. Nothing scores whether
TidyWise is actually positioned in the post. On software/comparison keywords the
model earns up to 25 points for naming RIVALS and zero for positioning us, so the
highest-scoring post is a competitor roundup that never makes our case. The system
prompt already asks for a closing CTA mentioning TidyWise and 2-4 internal links to
TidyWise pages, but nothing verifies either.

CHANGE 1 — add three helper functions near countCompetitorMentions (~line 38).

Note countCompetitorMentions counts DISTINCT competitor NAMES, not occurrences.
Do not change it — the existing scoring slot depends on that meaning. The new
share-of-voice check needs occurrence counts, so add separate helpers:

  const BRAND = "tidywise";

  function countBrandMentions(html: string): number {
    const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
    return (text.match(/tidywise/g) || []).length;
  }

  function countCompetitorOccurrences(html: string): number {
    const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
    let n = 0;
    for (const c of COMPETITORS) {
      const escaped = c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      n += (text.match(new RegExp(escaped, "g")) || []).length;
    }
    return n;
  }

  function hasInternalBrandLink(html: string): boolean {
    // A real conversion path, not a name-drop. Matches the internal links the
    // system prompt already asks for.
    return /<a[^>]+href=["']\/(pricing|features|compare|blog)(\/[^"']*)?["']/i.test(html);
  }

  function brandInClosing(html: string): boolean {
    // Brand appears in the final 20% of body text, where the CTA belongs.
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text) return false;
    return text.slice(Math.floor(text.length * 0.8)).includes("tidywise");
  }

CHANGE 2 — add a 15-point Positioning slot, and rebalance so the total stays 100.

The rubric currently sums to exactly 100 and is capped by Math.min(100, score), so
points must come from somewhere. Take them from the two weakest proxies: raw word
count (2500 words of filler is not better than 1800 good ones) and structure (the
H2/H3 check is satisfied by essentially every post, so it discriminates nothing).

  Words       30 -> 25   (thresholds unchanged: 25 / 18 / 10 for 2500 / 1500 / 1000)
  FAQ         15 -> 15   (unchanged)
  Comp/Spec   25 -> 20   (scale the tiers: 20 / 15 / 6)
  Structure   20 -> 15   (15 for h2+h3, 8 for h2 only)
  Meta        10 -> 10   (unchanged)
  POSITIONING  0 -> 15   (new)
                  = 100

Extend the calcQualityScore parameter object with:
  brandCount: number, hasBrandLink: boolean, brandClosing: boolean,
  competitorOccurrences: number

Score the new slot additively so partial credit is possible:

  let pos = 0;
  if (o.brandCount >= 3) { pos += 4; notes.push(`Brand x${o.brandCount} 4/4`); }
  else if (o.brandCount >= 1) { pos += 2; notes.push(`Brand x${o.brandCount} 2/4`); }
  else notes.push("Brand absent 0/4");

  if (o.hasBrandLink) { pos += 5; notes.push("Brand link 5/5"); }
  else notes.push("No internal TidyWise link 0/5");

  if (o.brandClosing) { pos += 3; notes.push("Closing CTA 3/3"); }
  else notes.push("No brand in closing 0/3");

  // Share of voice: only meaningful where competitors actually appear.
  if (o.competitorOccurrences === 0) { pos += 3; notes.push("SoV n/a 3/3"); }
  else if (o.brandCount >= o.competitorOccurrences) { pos += 3; notes.push(`SoV ${o.brandCount}:${o.competitorOccurrences} 3/3`); }
  else if (o.brandCount * 2 >= o.competitorOccurrences) { pos += 1; notes.push(`SoV ${o.brandCount}:${o.competitorOccurrences} 1/3`); }
  else notes.push(`SoV ${o.brandCount}:${o.competitorOccurrences} 0/3 — competitor-dominant`);

  score += pos;

Award the full 3 when no competitors appear rather than 0 — an operational post with
no rivals named has not failed share of voice, the test simply does not apply. Scoring
it 0 would penalise exactly the posts the rubric already routes to the Specifics slot.

CHANGE 3 — call the helpers at the call site (~line 285, beside the existing
wordCount / competitorCount / numericSentenceCount calls) and pass the four new
fields into calcQualityScore.

CHANGE 4 — a hard publish floor, separate from the score.

A post can currently clear 60 on length, FAQ, structure and meta while never naming
TidyWise once. That specific post should never go live unreviewed regardless of score:

  const noPositioning = brandCount === 0 || !hasInternalBrandLink(post.content);
  const shouldPublish = autoPublish && !similar && !tooLowQuality && !noPositioning;

and when noPositioning is true, push a note saying why it was held as a draft.

This is a floor, not a second scoring system — it only ever blocks auto-publish, and
the post is still inserted as a draft for review exactly as low scorers are today.

CHANGE 5 — tell the model what is now measured, so it can comply.

In the system prompt's "Every post MUST" list (~line 100), make the existing asks
explicit rather than adding new demands:

- Reference TidyWise at least 3 times across the post, worked into the argument
  rather than repeated as a slogan
- Include at least one internal link to /pricing, /features/*, or /compare/*
- When competitors are named, give TidyWise at least equal weight — do not write a
  roundup that never makes our case
- Keep the closing CTA mentioning TidyWise

Do NOT add a required "Why TidyWise" section or any fixed CTA wording. Every post
carrying an identically-titled brand section is the failure mode this is avoiding —
the checks above are all satisfiable in many different ways on purpose.

EXPECTED SIDE EFFECT, please confirm you understand it: adding a 15-point slot that
existing generations were never optimised for will push some borderline posts below
60, so more will land as drafts instead of auto-publishing. That is intended. Nothing
rescores or unpublishes existing posts — this is forward-only.

AFTERWARDS please paste:

  select slug, title, quality_score, status, published_at, quality_notes
  from public.blog_posts
  order by created_at desc
  limit 20;

Confirm the function is DEPLOYED, not just committed.
```

---

## Is the generator actually running?

**Cannot be answered from the repo** — CLAUDE.md rule 4 — and there are four distinct
ways it could be "paused", only some of which are visible here.

What the migrations claim: `20260701233328…sql` unschedules everything matching
`blog-publisher-%`, then schedules **four** jobs — `blog-publisher-mon`, `-tue`,
`-thu`, `-sat`, all at 10:00 UTC — each POSTing `generate-daily-blogs` with
`{auto_publish: true}`. That superseded the earlier two-job version in
`20260531150000_blog_publisher_cron.sql`. No later migration unschedules them by name.

**There is no pause flag anywhere.** No `enabled` column, no setting, nothing in
`src/`. So "paused" must be one of:

1. **Jobs unscheduled or deactivated live** — done outside a migration.
2. **The queue is empty.** `:262` selects one `blog_keyword_queue` row with
   `status = 'queued'`. No queued rows means the cron fires and does nothing, quietly.
   This is the most likely form of an informal pause, since it is what the admin
   Keywords page controls.
3. **The function is erroring** — missing `cron_secret` / `supabase_url` vault
   secrets, a CRON_SECRET mismatch, or an expired model API key.
4. **A stale deploy** — the committed function is not what is running.

### Queries to settle it

```sql
-- 1. Are the four jobs there, active, and succeeding?
select j.jobid, j.jobname, j.schedule, j.active,
       r.status, r.return_message, r.start_time
from cron.job j
left join lateral (
  select status, return_message, start_time
  from cron.job_run_details d
  where d.jobid = j.jobid
  order by d.start_time desc limit 1
) r on true
where j.jobname like 'blog-publisher%'
order by j.jobname;

-- 2. Is there any work queued for it to pick up?
select status, count(*), min(created_at) as oldest, max(last_attempted_at) as last_try
from public.blog_keyword_queue
group by status
order by status;

-- 3. Has anything actually been produced lately?
select date_trunc('day', created_at)::date as day,
       count(*) as posts,
       count(*) filter (where is_published) as published,
       round(avg(quality_score)) as avg_score
from public.blog_posts
where created_at > now() - interval '90 days'
group by 1 order by 1 desc;

-- 4. Recent failures, if any
select keyword, status, error_message, last_attempted_at
from public.blog_keyword_queue
where error_message is not null
order by last_attempted_at desc nulls last
limit 10;
```

**Read them together.** Jobs active + queue empty = paused by starving the queue, and
this fix does nothing until keywords are added. Jobs active + queue full + no recent
posts = it is failing, and query 4 says why. No rows from query 1 = the jobs were
removed live, and the migration files are lying.

Query 3 is also the honest before/after baseline: note the current `avg_score` before
deploying, since the rebalance will move it.
