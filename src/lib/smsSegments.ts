/**
 * SMS segment counting.
 *
 * Why this is not `Math.ceil(len / 160)`: a single character outside the GSM
 * 03.38 alphabet — a curly apostrophe pasted from Word, an emoji, an en dash —
 * switches the ENTIRE message to UCS-2, which holds 70 characters instead of
 * 160. A 90-character message can therefore be one segment or two depending on
 * one invisible punctuation mark, and the org pays per segment.
 *
 * So the editor has to name the cause, not just the number. "2 segments" is a
 * fact; "a curly apostrophe pushed this to 2 segments" is something an owner
 * can act on in five seconds.
 */

/** GSM 03.38 basic set. */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/** These cost TWO GSM characters each (escape + char). */
const GSM_EXTENDED = '^{}\\[~]|€';

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SegmentInfo {
  encoding: SmsEncoding;
  /** Billable character units, not `String.length`. */
  units: number;
  segments: number;
  /** Units left before another segment starts. */
  remaining: number;
  /**
   * The first non-GSM character found, when the encoding flipped. Null on
   * GSM-7. This is the thing worth showing the user.
   */
  culprit: string | null;
}

const GSM_LIMITS = { single: 160, multi: 153 };
const UCS2_LIMITS = { single: 70, multi: 67 };

export function analyzeSms(body: string): SegmentInfo {
  const text = body ?? '';

  let units = 0;
  let culprit: string | null = null;

  // Iterate by code point so an emoji is not counted as two stray surrogates.
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) {
      units += 1;
    } else if (GSM_EXTENDED.includes(ch)) {
      units += 2;
    } else {
      culprit ??= ch;
    }
  }

  if (culprit !== null) {
    // UCS-2 bills per UTF-16 unit, so an emoji outside the BMP costs two.
    const ucsUnits = text.length;
    const limits = UCS2_LIMITS;
    const segments = ucsUnits === 0 ? 0 : Math.ceil(ucsUnits / (ucsUnits <= limits.single ? limits.single : limits.multi));
    const capacity = segments <= 1 ? limits.single : segments * limits.multi;
    return {
      encoding: 'UCS-2',
      units: ucsUnits,
      segments,
      remaining: Math.max(0, capacity - ucsUnits),
      culprit,
    };
  }

  const limits = GSM_LIMITS;
  const segments = units === 0 ? 0 : Math.ceil(units / (units <= limits.single ? limits.single : limits.multi));
  const capacity = segments <= 1 ? limits.single : segments * limits.multi;
  return {
    encoding: 'GSM-7',
    units,
    segments,
    remaining: Math.max(0, capacity - units),
    culprit: null,
  };
}

/** Human-readable name for the character that forced UCS-2. */
export function describeCulprit(ch: string): string {
  const named: Record<string, string> = {
    '\u2019': "a curly apostrophe (\u2019)",
    '\u2018': "a curly quote (\u2018)",
    '\u201C': 'a curly quote (")',
    '\u201D': 'a curly quote (")',
    '\u2013': 'an en dash (–)',
    '\u2014': 'an em dash (—)',
    '\u2026': 'an ellipsis (…)',
    '\u00A0': 'a non-breaking space',
  };
  if (named[ch]) return named[ch];
  if (/\p{Extended_Pictographic}/u.test(ch)) return `an emoji (${ch})`;
  return `"${ch}"`;
}
