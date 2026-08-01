/**
 * Wall-clock ↔ instant conversion for campaign scheduling.
 *
 * The picker collects a calendar date and an "HH:MM" time. Those are wall-clock
 * values in the ORGANISATION's timezone, not the browser's: an owner scheduling
 * from another zone must not shift when their customers get texted.
 *
 * Deliberately dependency-free (Intl only) and JSX-free so it can be unit
 * tested with `node --test`. date-fns cannot do this without date-fns-tz, which
 * is not installed.
 */

/**
 * How far the given zone is from UTC at that instant, in ms.
 * Positive east of UTC.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  // hour12:false can render midnight as "24" in some ICU versions.
  const asIfUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second"),
  );
  return asIfUtc - instant.getTime();
}

/**
 * Resolve a wall-clock date+time in `timeZone` to an absolute instant.
 *
 * Two passes: the offset itself depends on the instant, so the first pass
 * guesses and the second corrects. That matters across DST boundaries, where a
 * single-pass conversion lands an hour out.
 *
 * Returns null for an unparseable time or an invalid zone rather than a wrong
 * instant — a campaign scheduled to the wrong hour is worse than one that
 * refuses to be scheduled.
 */
export function zonedWallClockToIso(
  date: Date,
  timeOfDay: string,
  timeZone: string | null | undefined,
): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  const match = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay?.trim() ?? "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  // The picker's Date carries the chosen calendar day in the browser's zone;
  // only its Y/M/D are meaningful here.
  /* eslint-disable local/no-device-local-dates -- WALL-CLOCK CARRIER: this module
     exists to convert a picked calendar date plus an "HH:MM" string into an
     instant in a named zone. Reading the picker token's own calendar fields is
     the input to that conversion, and converting them first would double-apply
     an offset. See the module header. */
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    const naive = Date.UTC(y, m, d, hour, minute);
    let utc = naive - zoneOffsetMs(new Date(naive), zone);
    utc = naive - zoneOffsetMs(new Date(utc), zone);
    const result = new Date(utc);
    return Number.isNaN(result.getTime()) ? null : result.toISOString();
  } catch {
    return null;
  }
}

/** "Tue 4 Aug at 9:00 AM (America/New_York)" — the zone is named so it cannot be misread. */
export function describeScheduledInstant(iso: string, timeZone: string | null | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an unknown time";
  const zone = timeZone || undefined;
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    }).format(date);
    return zone ? `${formatted} (${zone})` : formatted;
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    }).format(date);
  }
}

/** True when the resolved instant is already behind us — a schedule that would fire immediately. */
export function isInPast(iso: string, now: Date = new Date()): boolean {
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime();
}

/** The wall-clock hour and minute a zone is showing at that instant. */
export function wallClockInZone(instant: Date, timeZone: string | null | undefined): { hour: number; minute: number } {
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false, hour: "2-digit", minute: "2-digit",
    }).formatToParts(instant);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    return { hour: get("hour") % 24, minute: get("minute") };
  } catch {
    return { hour: instant.getHours(), minute: instant.getMinutes() };
  /* eslint-enable local/no-device-local-dates */
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Is every possible time on this calendar day already behind us?
 *
 * This is the correct predicate for disabling a day in the picker: a day is
 * selectable if ANY time on it is still in the future. Comparing the day's
 * midnight against now — which the picker used to do — disables today from
 * 00:01 onwards, so same-day scheduling was impossible all day.
 *
 * Evaluated in the organisation's zone, so a browser in a different zone
 * cannot grey out a day the business can still send on.
 */
export function isDayFullyPast(
  day: Date,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const endOfDay = zonedWallClockToIso(day, "23:59", timeZone);
  if (!endOfDay) return false; // never disable on a conversion failure
  return isInPast(endOfDay, now);
}

/**
 * The earliest time still schedulable on this day, as "HH:MM", rounded up to
 * the next `stepMinutes` boundary. Returns "00:00" for a wholly future day and
 * null when the day has no remaining slot.
 */
export function earliestTimeOnDay(
  day: Date,
  timeZone: string | null | undefined,
  now: Date = new Date(),
  stepMinutes = 15,
): string | null {
  const startOfDay = zonedWallClockToIso(day, "00:00", timeZone);
  if (!startOfDay) return null;
  if (!isInPast(startOfDay, now)) return "00:00";
  if (isDayFullyPast(day, timeZone, now)) return null;

  // Today in the org's zone: round the current wall clock up to the next slot.
  const { hour, minute } = wallClockInZone(now, timeZone);
  let slot = Math.ceil((minute + 1) / stepMinutes) * stepMinutes;
  let h = hour;
  if (slot >= 60) { h += Math.floor(slot / 60); slot %= 60; }
  if (h > 23) return null;
  return `${pad(h)}:${pad(slot)}`;
}

/** Clamp a chosen time forward to the day's earliest remaining slot. */
export function clampTimeToDay(
  day: Date,
  timeOfDay: string,
  timeZone: string | null | undefined,
  now: Date = new Date(),
  stepMinutes = 15,
): string | null {
  const earliest = earliestTimeOnDay(day, timeZone, now, stepMinutes);
  if (!earliest) return null;
  const chosen = zonedWallClockToIso(day, timeOfDay, timeZone);
  if (!chosen) return earliest;
  return isInPast(chosen, now) ? earliest : timeOfDay;
}
