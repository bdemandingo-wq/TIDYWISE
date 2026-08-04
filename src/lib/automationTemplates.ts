/**
 * Editable automation messages — vocabulary, validation and resolution.
 *
 * ─── THE RULE THAT MATTERS MOST ────────────────────────────────────────────
 * A missing or unusable template falls back to the seeded default. It NEVER
 * falls back to silence, and it never sends a blank message. The hardcoded copy
 * that used to live in the sender is not dead code after this migration — it is
 * the default, and it is what makes every failure mode safe. If you change a
 * default here you are changing what customers receive.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * KEEP IN SYNC: `supabase/functions/_shared/automation-templates.ts` is a
 * verbatim copy of the resolver and the defaults, because the sender runs in
 * Deno and cannot import from `src/`. Vocabulary and defaults must match, or an
 * owner will be allowed to save a token that the sender then cannot resolve.
 * The tests in automationTemplates.test.ts pin the behaviour both copies owe.
 */

export type AutomationKey =
  | 'quote_stale_reengage'
  | 'booking_confirmation'
  | 'reminder_advance'
  | 'reminder_soon';

/**
 * Which `organization_automations.automation_type` row carries the custom body
 * for each key. Several keys can share a row — the three booking-reminder
 * messages all live on `appointment_reminder` because that is the single
 * automation an owner toggles on and off.
 */
export const AUTOMATION_ROW_TYPE: Record<AutomationKey, string> = {
  quote_stale_reengage: 'quote_stale_reengage',
  booking_confirmation: 'appointment_reminder',
  reminder_advance: 'appointment_reminder',
  reminder_soon: 'appointment_reminder',
};


/** Marketing messages get an opt-out line appended by the sender. Not editable. */
export type MessageClass = 'marketing' | 'transactional';

export interface TokenSpec {
  /** Without braces: 'customer_name'. */
  token: string;
  /** Shown in the editor, so it should read as help rather than as a schema note. */
  description: string;
  /**
   * The message has no purpose without it. A template missing a required token
   * is rejected at save time, and at send time falls back to the default rather
   * than sending something useless.
   */
  required?: boolean;
}

/**
 * Vocabulary is declared PER KEY, not globally, because it genuinely differs —
 * `{cleaner_name}` means something in a review request and nothing in a quote
 * nudge. A shared list would either permit tokens that cannot resolve or block
 * ones that can.
 */
export const AUTOMATION_VOCABULARY: Record<AutomationKey, TokenSpec[]> = {
  quote_stale_reengage: [
    { token: 'customer_name', description: "The customer's first name" },
    { token: 'service_name', description: 'The service they asked about' },
    { token: 'company_name', description: 'Your business name' },
    { token: 'quote_link', description: 'Link to their quote', required: true },
  ],

  /*
   * The three booking-reminder messages share one vocabulary because they are
   * the same message at three distances from the appointment.
   *
   * `{address_line}` carries the word "Address" itself, not just the street.
   * The hardcoded originals only printed the address clause when they HAD an
   * address; a bare `{address}` token would render "Address: ." for the
   * bookings with none. The sender therefore supplies either
   * "Address: 12 Elm St." or an empty string, and the resolver collapses the
   * gap it leaves behind.
   *
   * `{time}` is required on all three — a reminder that does not say when is
   * not a reminder. `{date}` is NOT required, because the two-hour message
   * legitimately says "today" instead.
   */
  booking_confirmation: [
    { token: 'customer_name', description: "The customer's name" },
    { token: 'service_name', description: 'The service they booked' },
    { token: 'company_name', description: 'Your business name' },
    { token: 'date', description: 'The appointment date' },
    { token: 'time', description: 'The appointment time', required: true },
    { token: 'address_line', description: "The job address (blank when we don't have one)" },
  ],
  reminder_advance: [
    { token: 'customer_name', description: "The customer's name" },
    { token: 'service_name', description: 'The service they booked' },
    { token: 'company_name', description: 'Your business name' },
    { token: 'date', description: 'The appointment date' },
    { token: 'time', description: 'The appointment time', required: true },
    { token: 'address_line', description: "The job address (blank when we don't have one)" },
  ],
  reminder_soon: [
    { token: 'customer_name', description: "The customer's name" },
    { token: 'service_name', description: 'The service they booked' },
    { token: 'company_name', description: 'Your business name' },
    { token: 'date', description: 'The appointment date' },
    { token: 'time', description: 'The appointment time', required: true },
    { token: 'address_line', description: "The job address (blank when we don't have one)" },
  ],
};


export interface AutomationDefault {
  sms_body: string;
  message_class: MessageClass;
  /** Shown in the editor above the box, so an owner knows what they are changing. */
  label: string;
}

/**
 * The seeded defaults. Copied verbatim from the senders they replace, so
 * migrating changes nothing about what is sent until an owner edits it.
 *
 * `quote_stale_reengage` is classed `marketing`, which ADDS an opt-out line the
 * hardcoded version never carried. That is a deliberate change to what customers
 * receive, decided on 2026-07-31: the nudge goes to someone who asked for a
 * price and did not book, which is close enough to marketing that carrying the
 * line is cheaper than defending its absence later. The sender appends it; it is
 * not part of the editable body, so an owner cannot remove it.
 */
export const AUTOMATION_DEFAULTS: Record<AutomationKey, AutomationDefault> = {
  quote_stale_reengage: {
    label: 'Quote follow-up',
    message_class: 'marketing',
    sms_body:
      'Hi {customer_name} — just checking in on your {service_name} quote from {company_name}. Still interested? View it here: {quote_link}. Reply if you have questions!',
  },

  /*
   * Copied verbatim from send-booking-reminder. An org that never edits must
   * receive byte-identical text to what it received before this feature
   * existed, so do not "improve" the wording here.
   *
   * All three are transactional: the customer booked a job and is being told
   * about that job. No opt-out line is appended.
   */
  booking_confirmation: {
    label: 'Booking confirmation',
    message_class: 'transactional',
    sms_body:
      'Hi {customer_name}! Your {service_name} appointment with {company_name} is confirmed for {date} at {time}. {address_line} Reply to this message with any questions!',
  },
  reminder_advance: {
    label: 'Reminder — 48 hours or more before',
    message_class: 'transactional',
    sms_body:
      'Hi {customer_name}! Friendly reminder — your {service_name} appointment with {company_name} is coming up on {date} at {time}. {address_line} Reply with any questions!',
  },
  reminder_soon: {
    label: 'Reminder — 2 hours or less before',
    message_class: 'transactional',
    sms_body:
      'Hi {customer_name}! Your {service_name} with {company_name} is starting soon — today at {time}. {address_line} See you shortly!',
  },
};


/** `{single}` braces — the syntax all three SMS engines already use. */
const TOKEN_PATTERN = /\{([a-z0-9_]+)\}/gi;

/** Every token appearing in a body, lowercased, in order of first appearance. */
export function tokensIn(body: string): string[] {
  const found: string[] = [];
  for (const m of body.matchAll(TOKEN_PATTERN)) {
    const name = m[1].toLowerCase();
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * Save-time validation. Returns an error string, or null when the body is fine.
 *
 * Returns a message rather than a boolean so the editor names the offending
 * token. "Invalid template" tells an owner nothing they can act on; the whole
 * value of validating at save time is that the person who can fix it is present.
 */
export function validateTemplate(key: AutomationKey, body: string): string | null {
  const trimmed = (body ?? '').trim();
  if (!trimmed) {
    return 'Message cannot be empty. Clear it and save to go back to the default wording.';
  }

  const vocabulary = AUTOMATION_VOCABULARY[key] ?? [];
  const allowed = new Set(vocabulary.map((t) => t.token));
  const used = tokensIn(trimmed);

  const unknown = used.filter((t) => !allowed.has(t));
  if (unknown.length > 0) {
    const list = [...allowed].map((t) => `{${t}}`).join(', ');
    return `{${unknown[0]}} isn't a thing we can fill in. Available: ${list}`;
  }

  const missingRequired = vocabulary.filter((t) => t.required && !used.includes(t.token));
  if (missingRequired.length > 0) {
    return `Your message needs {${missingRequired[0].token}} — without it the text has no purpose.`;
  }

  return null;
}

export interface ResolveResult {
  /** Never empty. */
  text: string;
  /** True when the default was used instead of the supplied template. */
  usedDefault: boolean;
  /** Non-null when something was wrong worth logging. */
  warning: string | null;
}

/**
 * Turn a template into a message, falling back to the default whenever the
 * template cannot produce something worth sending.
 *
 * The five cases, all of which send SOMETHING:
 *
 *   1. body null/undefined (no row at all)  → default
 *   2. body empty or whitespace             → default
 *   3. required token missing               → default   (a nudge with no link
 *                                                        is worse than stock copy)
 *   4. unknown token present                → strip the braces, send the rest,
 *                                             warn (legacy rows predate validation)
 *   5. otherwise                            → the template
 *
 * Missing DATA for a known token resolves to empty string rather than blocking:
 * the sender already defaults customer_name to "there" and service_name to
 * "cleaning service", so a blank here means the sender genuinely had nothing.
 */
export function resolveTemplate(
  key: AutomationKey,
  body: string | null | undefined,
  data: Record<string, string>,
): ResolveResult {
  const fallback = AUTOMATION_DEFAULTS[key];
  const vocabulary = AUTOMATION_VOCABULARY[key] ?? [];
  const allowed = new Set(vocabulary.map((t) => t.token));

  const trimmed = (body ?? '').trim();
  let warning: string | null = null;
  let usedDefault = false;
  let template = trimmed;

  if (!trimmed) {
    template = fallback.sms_body;
    usedDefault = true;
  } else {
    const used = tokensIn(trimmed);
    const missingRequired = vocabulary.filter((t) => t.required && !used.includes(t.token));
    if (missingRequired.length > 0) {
      template = fallback.sms_body;
      usedDefault = true;
      warning = `template missing required {${missingRequired[0].token}}, used default`;
    } else {
      const unknown = used.filter((t) => !allowed.has(t));
      if (unknown.length > 0) {
        warning = `template has unknown token(s): ${unknown.map((t) => `{${t}}`).join(', ')}`;
      }
    }
  }

  const text = template.replace(TOKEN_PATTERN, (_match, rawName: string) => {
    const name = rawName.toLowerCase();
    if (allowed.has(name)) return data[name] ?? '';
    // Unknown token: strip the braces rather than shipping literal {braces} to
    // a customer. Save-time validation stops new ones; this is for rows written
    // before validation existed.
    return rawName;
  });

  // Collapse the gap an empty token leaves behind. `{address_line}` is blank
  // for bookings with no address, and "at 9am.  Reply" reads as a mistake.
  const finalText = text.replace(/[ \t]{2,}/g, ' ').trim();

  if (!finalText) {
    // Belt and braces: a template of nothing but tokens, all of which resolved
    // empty. Never send blank.
    return {
      text: fallback.sms_body.replace(TOKEN_PATTERN, (_m, n: string) => data[n.toLowerCase()] ?? ''),
      usedDefault: true,
      warning: 'template resolved to empty, used default',
    };
  }

  return { text: finalText, usedDefault, warning };
}
