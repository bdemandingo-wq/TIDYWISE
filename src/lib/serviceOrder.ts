/**
 * Canonical display order for cleaning services across admin + public booking
 * surfaces and dropdowns:
 *   1. Standard Clean
 *   2. Deep Clean
 *   3. Move In / Move Out
 * Anything else falls to the end, keeping its own alphabetical order.
 */

const ORDER: Array<{ id: string; match: (s: { id?: string; name?: string }) => boolean }> = [
  {
    id: 'standard_clean',
    match: (s) =>
      s.id === 'standard_clean' ||
      /standard/i.test(s.name || ''),
  },
  {
    id: 'deep_clean',
    match: (s) =>
      s.id === 'deep_clean' ||
      (/deep/i.test(s.name || '') && !/post|construction/i.test(s.name || '')),
  },
  {
    id: 'move_in_out',
    match: (s) =>
      s.id === 'move_in_out' ||
      /move\s*[-/ ]?\s*(in|out)/i.test(s.name || ''),
  },
];

function rank<T extends { id?: string; name?: string }>(svc: T): number {
  for (let i = 0; i < ORDER.length; i++) {
    if (ORDER[i].match(svc)) return i;
  }
  return ORDER.length;
}

export function sortServices<T extends { id?: string; name?: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (a.name || '').localeCompare(b.name || '');
  });
}
