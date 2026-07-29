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
