# Lovable batch — four read-only questions in one message

**Paste:** `2026-07-31-readonly-batch.PASTE.txt` (14 queries, labelled A1–A4, B1–B3, C1–C4, D1–D3).
**Status:** read-only. Nothing in it writes, and it says so three times.
**Why bundled:** each Lovable message costs credits, and none of these four needs
a code change — they are all "tell me what's there" before deciding anything.

Deliberately NOT bundled: the blog-generator pricing fix. That one is a code
change with a deadline (the publisher cron runs Mon/Tue/Thu/Sat at 10:00), and
mixing it with fourteen unrelated queries invites a sloppier job on the part that
actually matters. Send it on its own.

## What each answer unblocks

| Section | Question | What the answer decides |
|---|---|---|
| **A** `estimate.sent` | Who is subscribed to an event that has never fired? | **A1 is a gate.** If `estimate.sent` appears in either dispatch log, the finding is wrong and nobody should be contacted. If it's absent, A4 is the outreach list. |
| **B** tier ladders | Which orgs have a hole between tiers, and is anyone standing in it? | B1 empty → gaps are theoretical, fix at leisure. B2 non-empty → real customers holding no tier. **Do not bulk-repair**: closing a hole promotes whoever is in it, which changes what they see in the portal. That's a business call. |
| **C** `automation_steps` | Has any owner written copy into the editor that no sender reads? | C1 empty → the editable-messages plan is unblocked. C1 non-empty → every one of those messages goes live the moment a sender starts reading the table. C2 needs human eyes, not a count. **Do not delete anything** — it's their work even if it never sent. |
| **D** refunds | How much refund history is actually recoverable? | Decision gate on the backfill. High `tier_c_lost` or high `undecidable` → fix forward with a documented cut-off instead. D3 should be ~0; if it isn't, restoring sale prices moves what payroll would pay. |

## Two schema corrections made while writing this

1. **`ghl_dispatch_log` has no `success` column.** It has `status text CHECK (status IN
   ('success','failed','retrying'))`. `zapier_dispatch_log` *does* have a boolean
   `success`. A1 unions the two, so the mismatch would have errored the one query
   the rest of Section A depends on. Fixed here and in the source prompt
   (`2026-07-30-find-estimate-sent-subscribers.md`) so a future re-send isn't wrong too.
2. **`?` is the JSONB key-existence operator** but also a bind-parameter placeholder in
   several drivers. A3 carries the `jsonb_exists(...)` substitution inline in case it clashes.

Column names verified against `src/integrations/supabase/types.ts` rather than the
migrations — per CLAUDE.md rule 4b, a migration file is a hypothesis about live schema.
That check is what caught #1.
