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
