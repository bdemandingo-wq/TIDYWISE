// Single source of truth for demo booking availability. Seeded into
// platform_settings (key 'demo_availability'); this module's DEFAULT_*
// values are the fallback when the setting is missing or malformed.

export type DayAvailability = { start: number; end: number } | null;
export type WeeklyAvailability = Record<number, DayAvailability>;

export const WEEKDAY_LABELS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

// The values previously hardcoded in both components (EST wall-clock hours).
export const DEFAULT_AVAILABILITY: WeeklyAvailability = {
  0: { start: 13, end: 22 },
  1: { start: 19, end: 22 },
  2: null,
  3: { start: 19, end: 22 },
  4: null,
  5: null,
  6: { start: 10, end: 22 },
};

function validDay(v: unknown): DayAvailability | undefined {
  if (v === null) return null;
  if (v && typeof v === 'object') {
    const s = (v as { start?: unknown }).start;
    const e = (v as { end?: unknown }).end;
    if (
      Number.isInteger(s) && Number.isInteger(e) &&
      (s as number) >= 0 && (s as number) <= 23 &&
      (e as number) >= 1 && (e as number) <= 24 &&
      (e as number) > (s as number)
    ) {
      return { start: s as number, end: e as number };
    }
  }
  return undefined; // malformed -> caller substitutes the default
}

// Parse the JSONB setting into a full week, falling back to DEFAULT_AVAILABILITY
// wholesale (missing/non-object) or per-day (a single malformed weekday).
export function parseAvailability(raw: unknown): WeeklyAvailability {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AVAILABILITY };
  const src = raw as Record<string, unknown>;
  const out = {} as WeeklyAvailability;
  for (let d = 0; d <= 6; d++) {
    const parsed = validDay(src[d] ?? src[String(d)]);
    out[d] = parsed === undefined ? DEFAULT_AVAILABILITY[d] : parsed;
  }
  return out;
}

// Half-hour slots for a weekday (end-exclusive), e.g. 19..22 -> 7:00..9:30.
export function slotsForDay(availability: WeeklyAvailability, dayOfWeek: number): string[] {
  const avail = availability[dayOfWeek];
  if (!avail) return [];
  const slots: string[] = [];
  for (let h = avail.start; h < avail.end; h++) {
    slots.push(`${h}:00`);
    slots.push(`${h}:30`);
  }
  return slots;
}
