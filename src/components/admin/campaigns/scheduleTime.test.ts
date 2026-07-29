/**
 * Run with:
 *   node --test src/components/admin/campaigns/scheduleTime.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { zonedWallClockToIso, describeScheduledInstant, isInPast } from "./scheduleTime.ts";

/** A local Date carrying just the calendar day the picker would produce. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

test("9am New York in winter is 14:00 UTC", () => {
  const iso = zonedWallClockToIso(day(2026, 1, 15), "09:00", "America/New_York");
  assert.equal(iso, "2026-01-15T14:00:00.000Z");
});

test("9am New York in summer is 13:00 UTC — DST is applied, not assumed", () => {
  const iso = zonedWallClockToIso(day(2026, 8, 4), "09:00", "America/New_York");
  assert.equal(iso, "2026-08-04T13:00:00.000Z");
});

test("the same wall clock in two zones is two different instants", () => {
  const ny = zonedWallClockToIso(day(2026, 8, 4), "09:00", "America/New_York");
  const la = zonedWallClockToIso(day(2026, 8, 4), "09:00", "America/Los_Angeles");
  assert.notEqual(ny, la);
  // LA is three hours behind NY, so the same wall clock happens later in UTC.
  assert.ok(new Date(la!).getTime() > new Date(ny!).getTime());
});

test("a zone east of UTC resolves earlier than UTC", () => {
  const iso = zonedWallClockToIso(day(2026, 8, 4), "09:00", "Europe/Berlin");
  assert.equal(iso, "2026-08-04T07:00:00.000Z");
});

test("midnight is a valid time, not a falsy one", () => {
  const iso = zonedWallClockToIso(day(2026, 8, 4), "00:00", "America/New_York");
  assert.equal(iso, "2026-08-04T04:00:00.000Z");
});

test("the day after a spring-forward boundary still lands on the requested hour", () => {
  // US DST begins 2026-03-08. 09:00 on the 9th must still be 09:00 local.
  const iso = zonedWallClockToIso(day(2026, 3, 9), "09:00", "America/New_York")!;
  const backAgain = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", hour12: false,
  }).format(new Date(iso));
  assert.equal(Number(backAgain) % 24, 9);
});

test("round-trips: whatever hour we ask for is the hour that zone shows", () => {
  for (const zone of ["America/New_York", "America/Los_Angeles", "Europe/Berlin", "Asia/Tokyo", "UTC"]) {
    for (const time of ["00:00", "09:00", "13:30", "20:00", "23:59"]) {
      const iso = zonedWallClockToIso(day(2026, 8, 4), time, zone)!;
      assert.ok(iso, `${zone} ${time} produced nothing`);
      const shown = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(iso));
      const [h, m] = shown.split(":").map(Number);
      const [wantH, wantM] = time.split(":").map(Number);
      assert.equal(h % 24, wantH, `${zone} ${time} -> hour ${h}`);
      assert.equal(m, wantM, `${zone} ${time} -> minute ${m}`);
    }
  }
});

// ── refuses rather than guessing ─────────────────────────────────────────────

test("an unparseable time returns null instead of a wrong instant", () => {
  for (const bad of ["", "9", "9am", "25:00", "09:60", "abc", "::"]) {
    assert.equal(zonedWallClockToIso(day(2026, 8, 4), bad, "UTC"), null, `accepted "${bad}"`);
  }
});

test("an invalid date returns null", () => {
  assert.equal(zonedWallClockToIso(new Date("nope"), "09:00", "UTC"), null);
});

test("a null timezone falls back to the viewer's zone rather than failing", () => {
  assert.ok(zonedWallClockToIso(day(2026, 8, 4), "09:00", null));
});

// ── presentation ─────────────────────────────────────────────────────────────

test("the described instant names its zone", () => {
  const out = describeScheduledInstant("2026-08-04T13:00:00.000Z", "America/New_York");
  assert.match(out, /America\/New_York/);
  assert.match(out, /9:00/);
});

test("an invalid instant describes itself as unknown rather than throwing", () => {
  assert.equal(describeScheduledInstant("nope", "UTC"), "an unknown time");
});

test("isInPast distinguishes past from future", () => {
  const now = new Date("2026-07-29T12:00:00Z");
  assert.equal(isInPast("2026-07-29T11:59:00Z", now), true);
  assert.equal(isInPast("2026-07-29T12:01:00Z", now), false);
  assert.equal(isInPast("2026-07-29T12:00:00Z", now), true, "exactly now counts as past");
});

// ── same-day scheduling: a day is selectable if ANY time on it is future ─────

import { isDayFullyPast, earliestTimeOnDay, clampTimeToDay, wallClockInZone } from "./scheduleTime.ts";

const TZ = "America/New_York";
// 11:39 local New York on 29 July 2026 = 15:39 UTC (EDT, UTC-4).
const NOW = new Date("2026-07-29T15:39:00Z");

test("the reported bug: today is NOT fully past at 11:39am", () => {
  assert.equal(isDayFullyPast(day(2026, 7, 29), TZ, NOW), false);
});

test("yesterday is fully past; tomorrow is not", () => {
  assert.equal(isDayFullyPast(day(2026, 7, 28), TZ, NOW), true);
  assert.equal(isDayFullyPast(day(2026, 7, 30), TZ, NOW), false);
});

test("today stays selectable until the last minute of the day", () => {
  const lateNight = new Date("2026-07-30T03:50:00Z"); // 23:50 NY on the 29th
  assert.equal(isDayFullyPast(day(2026, 7, 29), TZ, lateNight), false);
});

test("today becomes unselectable only once the day is actually over", () => {
  const afterMidnight = new Date("2026-07-30T04:05:00Z"); // 00:05 NY on the 30th
  assert.equal(isDayFullyPast(day(2026, 7, 29), TZ, afterMidnight), true);
});

test("earliest slot today rounds up to the next quarter hour", () => {
  assert.equal(earliestTimeOnDay(day(2026, 7, 29), TZ, NOW), "11:45");
});

test("a wholly future day starts at midnight", () => {
  assert.equal(earliestTimeOnDay(day(2026, 7, 30), TZ, NOW), "00:00");
});

test("exactly on a boundary advances to the next slot, never to now", () => {
  const onTheDot = new Date("2026-07-29T15:45:00Z"); // 11:45 NY exactly
  assert.equal(earliestTimeOnDay(day(2026, 7, 29), TZ, onTheDot), "12:00");
});

test("late enough in the day, no slot remains", () => {
  const almostMidnight = new Date("2026-07-30T03:52:00Z"); // 23:52 NY
  assert.equal(earliestTimeOnDay(day(2026, 7, 29), TZ, almostMidnight), null);
});

test("clamping pushes a past time forward and leaves a future one alone", () => {
  // The 09:00 default is behind 11:39 and must not silently resolve to the past.
  assert.equal(clampTimeToDay(day(2026, 7, 29), "09:00", TZ, NOW), "11:45");
  assert.equal(clampTimeToDay(day(2026, 7, 29), "18:00", TZ, NOW), "18:00");
  assert.equal(clampTimeToDay(day(2026, 7, 30), "09:00", TZ, NOW), "09:00");
});

test("the org's zone decides which day is still open, not the browser's", () => {
  // 02:00 UTC on the 30th is still 22:00 on the 29th in New York.
  const lateUtc = new Date("2026-07-30T02:00:00Z");
  assert.equal(isDayFullyPast(day(2026, 7, 29), TZ, lateUtc), false, "NY can still send");
  assert.equal(isDayFullyPast(day(2026, 7, 29), "Europe/Berlin", lateUtc), true, "Berlin cannot");
});

test("wallClockInZone reads the hour the zone is showing", () => {
  assert.deepEqual(wallClockInZone(NOW, TZ), { hour: 11, minute: 39 });
  assert.deepEqual(wallClockInZone(NOW, "UTC"), { hour: 15, minute: 39 });
});
