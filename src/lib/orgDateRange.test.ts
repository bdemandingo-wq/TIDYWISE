import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orgStartOfDay, orgEndOfDay, isSameOrgDay, isOrgToday, orgDayOfWeek,
  orgStartOfWeek, orgEndOfWeek, orgStartOfMonth, orgEndOfMonth,
  orgDateKey, parseWeekStartDay, orgYMD, orgAddDays, orgDaysBetween, offsetFromParts,
} from './orgDateRange.ts';

const NY = 'America/New_York';
const MANILA = 'Asia/Manila';
const LONDON = 'Europe/London';

// ─── the reported bug ─────────────────────────────────────────────────────
test('THE BUG: a Manila device no longer changes what "today" means for a NY org', () => {
  // 31 Jul 2026 18:00 EDT = 1 Aug 06:00 Manila. Device zone is irrelevant now:
  // the booking is on 31 July for a New York business, full stop.
  const evening = new Date('2026-07-31T22:00:00Z'); // 18:00 EDT
  const nyNow    = new Date('2026-07-31T23:00:00Z'); // 19:00 EDT, still Jul 31
  assert.equal(isOrgToday(evening, NY, nyNow), true);
  assert.equal(orgDateKey(evening, NY), '2026-07-31');
  // Same instant, read as Manila wall time, is already 1 August.
  assert.equal(orgDateKey(evening, MANILA), '2026-08-01');
});

test('a NY morning booking is NOT in the Manila-device band that caused $616', () => {
  const nyMorning = new Date('2026-07-31T13:00:00Z'); // 09:00 EDT
  const nyNow     = new Date('2026-07-31T23:00:00Z');
  assert.equal(isOrgToday(nyMorning, NY, nyNow), true);   // counted, correctly
  // The phone's broken window began at 12:00 EDT and would have excluded it.
  assert.ok(nyMorning < new Date('2026-07-31T16:00:00Z'));
});

// ─── day boundaries ───────────────────────────────────────────────────────
test('orgStartOfDay / orgEndOfDay land on local midnight', () => {
  const t = new Date('2026-07-31T22:00:00Z');
  assert.equal(orgStartOfDay(t, NY).toISOString(), '2026-07-31T04:00:00.000Z'); // 00:00 EDT
  assert.equal(orgEndOfDay(t, NY).toISOString(),   '2026-08-01T03:59:59.999Z'); // 23:59:59.999 EDT
});

test('the same instant gives different day bounds per zone — the whole point', () => {
  const t = new Date('2026-07-31T22:00:00Z');
  assert.notEqual(orgStartOfDay(t, NY).getTime(), orgStartOfDay(t, MANILA).getTime());
});

// ─── DST, which is why this cannot be fixed with fixed offsets ────────────
test('DST: US spring forward, 8 Mar 2026', () => {
  const before = new Date('2026-03-07T17:00:00Z'); // 12:00 EST (UTC-5)
  const after  = new Date('2026-03-09T16:00:00Z'); // 12:00 EDT (UTC-4)
  assert.equal(orgStartOfDay(before, NY).toISOString(), '2026-03-07T05:00:00.000Z');
  assert.equal(orgStartOfDay(after,  NY).toISOString(), '2026-03-09T04:00:00.000Z');
});

test('DST: the 23-hour day still starts at local midnight', () => {
  const dstDay = new Date('2026-03-08T18:00:00Z'); // during the transition day
  assert.equal(orgStartOfDay(dstDay, NY).toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(orgDateKey(dstDay, NY), '2026-03-08');
});

test('DST: London, which shifts on different dates from New York', () => {
  const t = new Date('2026-07-15T12:00:00Z'); // BST, UTC+1
  assert.equal(orgStartOfDay(t, LONDON).toISOString(), '2026-07-14T23:00:00.000Z');
});

test('Manila has no DST — offset is stable year round', () => {
  const jan = new Date('2026-01-15T04:00:00Z');
  const jul = new Date('2026-07-15T04:00:00Z');
  assert.equal(orgStartOfDay(jan, MANILA).toISOString(), '2026-01-14T16:00:00.000Z');
  assert.equal(orgStartOfDay(jul, MANILA).toISOString(), '2026-07-14T16:00:00.000Z');
});

// ─── weeks, incl. the configurable start ─────────────────────────────────
test('orgStartOfWeek defaults to Monday, matching the old hardcoded value', () => {
  const wed = new Date('2026-07-29T16:00:00Z'); // Wed 29 Jul, 12:00 EDT
  assert.equal(orgDateKey(orgStartOfWeek(wed, NY), NY), '2026-07-27'); // Mon
});

test('orgStartOfWeek honours a Sunday-start business', () => {
  const wed = new Date('2026-07-29T16:00:00Z');
  assert.equal(orgDateKey(orgStartOfWeek(wed, NY, 0), NY), '2026-07-26'); // Sun
});

test('on the start day itself the week begins that day, not seven back', () => {
  const mon = new Date('2026-07-27T16:00:00Z');
  assert.equal(orgDateKey(orgStartOfWeek(mon, NY, 1), NY), '2026-07-27');
});

test('week key is stable across a DST change inside the week', () => {
  const beforeShift = new Date('2026-03-09T16:00:00Z'); // Mon 9 Mar, after spring forward
  const key = orgDateKey(orgStartOfWeek(beforeShift, NY), NY);
  assert.equal(key, '2026-03-09');
  assert.equal(orgDayOfWeek(orgStartOfWeek(beforeShift, NY), NY), 1); // still Monday
});

test('orgEndOfWeek is six days after the start, at end of day', () => {
  const wed = new Date('2026-07-29T16:00:00Z');
  assert.equal(orgDateKey(orgEndOfWeek(wed, NY), NY), '2026-08-02'); // Sun
});

// ─── months ───────────────────────────────────────────────────────────────
test('month bounds, including a month whose last day varies', () => {
  const feb = new Date('2026-02-15T12:00:00Z');
  assert.equal(orgDateKey(orgStartOfMonth(feb, NY), NY), '2026-02-01');
  assert.equal(orgDateKey(orgEndOfMonth(feb, NY), NY),   '2026-02-28');
  const leap = new Date('2028-02-15T12:00:00Z');
  assert.equal(orgDateKey(orgEndOfMonth(leap, NY), NY),  '2028-02-29');
});

test('month boundary is where a device in another zone disagrees', () => {
  // 1 Aug 03:00 UTC is 31 Jul 23:00 EDT — still July for a NY business.
  const t = new Date('2026-08-01T03:00:00Z');
  assert.equal(orgDateKey(orgStartOfMonth(t, NY), NY), '2026-07-01');
  assert.equal(orgDateKey(orgStartOfMonth(t, MANILA), MANILA), '2026-08-01');
});

// ─── the week-start setting ───────────────────────────────────────────────
test('parseWeekStartDay reads payroll_week_start_day, defaulting to Monday', () => {
  assert.equal(parseWeekStartDay('monday'), 1);
  assert.equal(parseWeekStartDay('SUNDAY'), 0);
  assert.equal(parseWeekStartDay(' Friday '), 5);
  assert.equal(parseWeekStartDay(3), 3);
  for (const bad of [null, undefined, '', 'someday', 9, -1, {}]) {
    assert.equal(parseWeekStartDay(bad), 1, String(bad));
  }
});

// ─── misc ─────────────────────────────────────────────────────────────────
test('isSameOrgDay across a UTC midnight that is not a local midnight', () => {
  const a = new Date('2026-07-31T23:00:00Z'); // 19:00 EDT Jul 31 | 07:00 Manila Aug 1
  const b = new Date('2026-08-01T02:00:00Z'); // 22:00 EDT Jul 31 | 10:00 Manila Aug 1
  // Same NY day despite straddling UTC midnight — and also the same Manila day,
  // just a different one. Both zones agree internally; they disagree with
  // each other, which is exactly why the zone has to be chosen deliberately.
  assert.equal(isSameOrgDay(a, b, NY), true);
  assert.equal(isSameOrgDay(a, b, MANILA), true);
  assert.equal(orgDateKey(a, NY), '2026-07-31');
  assert.equal(orgDateKey(a, MANILA), '2026-08-01');
});

test('two instants in the same NY day fall in DIFFERENT Manila days', () => {
  const morning = new Date('2026-07-31T13:00:00Z'); // 09:00 EDT Jul 31 | 21:00 Manila Jul 31
  const evening = new Date('2026-07-31T23:00:00Z'); // 19:00 EDT Jul 31 | 07:00 Manila Aug 1
  assert.equal(isSameOrgDay(morning, evening, NY), true);
  assert.equal(isSameOrgDay(morning, evening, MANILA), false);
  // This split is precisely the $888 / $616 discrepancy.
});

test('orgYMD reads the wall clock, not the UTC date', () => {
  const t = new Date('2026-08-01T02:00:00Z');
  assert.deepEqual(orgYMD(t, NY), { y: 2026, m: 7, d: 31 });
  assert.deepEqual(orgYMD(t, MANILA), { y: 2026, m: 8, d: 1 });
});

// ─── day arithmetic across DST ────────────────────────────────────────────
test('orgAddDays steps calendar days, not 86400000ms', () => {
  // 7 Mar 2026 → 9 Mar crosses US spring-forward. Millisecond arithmetic would
  // land at 23:00 on the 8th; calendar stepping lands on the 9th.
  const mar7 = new Date('2026-03-07T17:00:00Z');
  assert.equal(orgDateKey(orgAddDays(mar7, 2, NY), NY), '2026-03-09');
  assert.equal(orgDateKey(orgAddDays(mar7, -2, NY), NY), '2026-03-05');
  assert.equal(orgDateKey(orgAddDays(mar7, 0, NY), NY), '2026-03-07');
});

test('orgAddDays over a 13-day biweekly span crossing DST', () => {
  const start = new Date('2026-03-02T17:00:00Z'); // Mon 2 Mar
  assert.equal(orgDateKey(orgAddDays(start, 13, NY), NY), '2026-03-15');
});

test('orgDaysBetween counts calendar days, DST or not', () => {
  const a = new Date('2026-03-07T17:00:00Z');
  const b = new Date('2026-03-09T16:00:00Z'); // one hour "shorter" in real time
  assert.equal(orgDaysBetween(a, b, NY), 2);
  assert.equal(orgDaysBetween(b, a, NY), -2);
});

// ─── finding 1: the WebKit hour-24 day-slip ───────────────────────────────
// These drive offsetFromParts directly with hand-written parts. Node's Intl
// never emits hour "24", so a test using the real formatter CANNOT fail before
// the fix and therefore cannot prove it. Testing the transform can.
test('offsetFromParts: WebKit hour-24 midnight resolves to the same offset as V8', () => {
  // 2026-08-01T04:00Z is 00:00 EDT on 1 Aug. V8 renders it as 1 Aug 00:00;
  // WebKit can render it as 31 Jul 24:00 — the day that is ENDING.
  const instant = Date.parse('2026-08-01T04:00:00Z');
  const v8     = { year:'2026', month:'08', day:'01', hour:'00', minute:'00', second:'00' };
  const webkit = { year:'2026', month:'07', day:'31', hour:'24', minute:'00', second:'00' };
  assert.equal(offsetFromParts(v8, instant), -240);
  // Before the fix this returned -1680: exactly 1440 minutes — one day — out.
  assert.equal(offsetFromParts(webkit, instant), -240);
});

test('offsetFromParts: hour-24 rolls correctly over a month end', () => {
  const instant = Date.parse('2026-09-01T04:00:00Z'); // 00:00 EDT 1 Sep
  const webkit = { year:'2026', month:'08', day:'31', hour:'24', minute:'00', second:'00' };
  assert.equal(offsetFromParts(webkit, instant), -240);
});

test('offsetFromParts: hour-24 rolls correctly over a year end', () => {
  const instant = Date.parse('2027-01-01T05:00:00Z'); // 00:00 EST 1 Jan
  const webkit = { year:'2026', month:'12', day:'31', hour:'24', minute:'00', second:'00' };
  assert.equal(offsetFromParts(webkit, instant), -300);
});

test('offsetFromParts: ordinary hours are unaffected by the guard', () => {
  const instant = Date.parse('2026-08-01T16:00:00Z'); // 12:00 EDT
  const parts = { year:'2026', month:'08', day:'01', hour:'12', minute:'00', second:'00' };
  assert.equal(offsetFromParts(parts, instant), -240);
});

// ─── finding 2: DST gap at local midnight ─────────────────────────────────
// Zones whose spring-forward is AT midnight, so 00:00 does not exist that day.
test('DST gap: orgStartOfDay never returns the previous day', () => {
  const cases: [string, string][] = [
    ['America/Havana',  '2026-03-08'],
    ['Africa/Cairo',    '2026-04-24'],
    ['Asia/Beirut',     '2026-03-29'],
    ['America/Santiago','2026-09-06'],
    ['Atlantic/Azores', '2026-03-29'],
  ];
  for (const [zone, date] of cases) {
    const noon = new Date(`${date}T12:00:00Z`);
    const start = orgStartOfDay(noon, zone);
    assert.equal(orgDateKey(start, zone), date, `${zone} start-of-day landed on the wrong date`);
  }
});

test('DST gap: the returned instant is the first that exists on that day', () => {
  // Havana skips 00:00→01:00 on 2026-03-08, so the day begins at 01:00 local.
  const start = orgStartOfDay(new Date('2026-03-08T12:00:00Z'), 'America/Havana');
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Havana', hour: '2-digit', hour12: false, hourCycle: 'h23',
  }).format(start);
  assert.equal(hour, '01');
});

test('DST gap: a normal day is still exactly midnight', () => {
  const start = orgStartOfDay(new Date('2026-06-15T12:00:00Z'), 'America/Havana');
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Havana', hour: '2-digit', hour12: false, hourCycle: 'h23',
  }).format(start);
  assert.equal(hour, '00');
});
