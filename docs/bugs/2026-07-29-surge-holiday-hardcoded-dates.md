# Surge holiday list uses hardcoded month/day for holidays that move every year

**Status:** Open
**Found:** 2026-07-29, while investigating booking price authority
**File:** `src/pages/PublicBookingPage.tsx:546`
**Severity:** Low today, wrong from 1 Jan 2027, and silent when it breaks.

---

## The defect

```ts
const holidays = ['1/1','7/4','11/11','12/25','12/24','11/28','12/31','1/15','2/19','5/27','9/2','10/14'];
const key = `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`;
if (surge_holiday_enabled) { if (holidays.includes(key)) multiplier = Math.max(multiplier, surge_holiday_multiplier); }
```

Six of those twelve are **observed-date** US holidays — they fall on a different
calendar date every year:

| Entry | Holiday | 2026 | 2027 |
|---|---|---|---|
| `11/28` | Thanksgiving | Thu 26 Nov (list says 28) | Thu 25 Nov |
| `1/15` | MLK Day | Mon 19 Jan | Mon 18 Jan |
| `2/19` | Presidents' Day | Mon 16 Feb | Mon 15 Feb |
| `5/27` | Memorial Day | Mon 25 May | Mon 31 May |
| `9/2` | Labor Day | Mon 7 Sep | Mon 6 Sep |
| `10/14` | Columbus Day | Mon 12 Oct | Mon 11 Oct |

The other six (`1/1`, `7/4`, `11/11`, `12/24`, `12/25`, `12/31`) are fixed-date and
are fine.

So the list appears to have been written against **one specific year's** calendar
and frozen. Even for 2026 several entries look off by a day or two.

## Why it matters

Two symmetrical failures, both invisible:

1. **A customer is surcharged on an ordinary day.** Book for 28 November 2027 — a
   Sunday, not Thanksgiving — and holiday surge applies. If weekend surge is also
   on, the customer cannot tell which multiplier hit them, only that the price is
   higher than the page implied earlier.
2. **The real holiday gets no surge.** Thanksgiving 2027 is 25 November, which is
   not in the list, so the org loses the premium it configured.

Nothing logs either case. The only way it surfaces is a customer querying a price,
which means it is found by complaint rather than by monitoring.

## Fix options

1. **Compute observed dates** from a nth-weekday-of-month rule (4th Thursday of
   November, 3rd Monday of January, last Monday of May, …). Self-maintaining, no
   data entry, and correct for every year. Preferred.
2. **Per-org configurable holiday dates** in `business_settings`. More flexible —
   an org may want Christmas Eve but not Columbus Day — but someone has to
   maintain it annually, which is how the current list got stale.
3. **A dated lookup table** with explicit years. Correct but needs topping up.

Option 1 plus option 2 as an override is probably the right end state: correct by
default, adjustable per org.

## Notes for whoever fixes it

- The list is **client-side only**, so this is a `src/` change, not Lovable's.
- It sits inside `getSurgeMultiplier()`, which also depends on `Date.now()` for
  last-minute surge — see the disagreement discussion in
  `docs/security/2026-07-29-booking-price-authority.md`. If surge logic ever moves
  to a shared server module, fix this at the same time rather than porting the bug.
- `surge_holiday_multiplier` and `surge_holiday_enabled` come from
  `get_public_booking_settings`, so the multiplier is already per-org — only the
  *dates* are hardcoded.
