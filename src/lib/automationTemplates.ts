/**
 * Editable automation messages — vocabulary, validation and resolution.
 *
 * ─── THE RULE THAT MATTERS MOST ────────────────────────────────────────────
 * A missing or unusable template falls back to the seeded default. It NEVER
 * falls back to silence, and it never sends a blank message. The hardcoded copy
 * that used to live in each sender is not dead code after this migration — it
 * is the default, and it is what makes every failure mode safe. If you change a
 * default here you are changing what customers receive.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * KEEP IN SYNC: `supabase/functions/_shared/automation-templates.ts` is a
 * verbatim copy, because the senders run in Deno and cannot import from `src/`.
 * The tests in automationTemplates.test.ts pin the behaviour both copies owe.
 *
 * GSM-7 ONLY IN DEFAULTS. One em dash or emoji flips a whole SMS to UCS-2 and
 * cuts the per-segment budget from 153 characters to 67, roughly tripling the
 * bill. `nonGsmCharacters()` exists so a test can enforce this; the labels are
 * UI text and may use whatever punctuation reads best.
 */

export type AutomationKey =
  // ── SMS ────────────────────────────────────────────────────────────────
  | 'booking_confirmation'
  | 'reminder_advance'
  | 'reminder_soon'
  | 'quote_stale_reengage'
  | 'rebooking_reminder'
  | 'recurring_upsell'
  | 'review_request'
  | 'seasonal_promo'
  | 'missed_call_textback'
  | 'abandoned_booking_recovery'
  // ── Email ──────────────────────────────────────────────────────────────
  | 'winback_step_1'
  | 'winback_step_2'
  | 'winback_step_3'
  | 'weekly_summary';

/**
 * Which `organization_automations.automation_type` row carries the custom body
 * for each key. Several keys can share a row — the three booking-reminder
 * messages all live on `appointment_reminder`, and the three win-back steps on
 * `winback_60day`, because that is the single automation an owner toggles.
 *
 * Editing does NOT require the row to be enabled. The row may be off, or may
 * not exist yet; the hook creates it disabled rather than silently switching an
 * automation on because somebody reworded it.
 */
export const AUTOMATION_ROW_TYPE: Record<AutomationKey, string> = {
  booking_confirmation: 'appointment_reminder',
  reminder_advance: 'appointment_reminder',
  reminder_soon: 'appointment_reminder',
  quote_stale_reengage: 'quote_stale_reengage',
  rebooking_reminder: 'rebooking_reminder',
  recurring_upsell: 'recurring_upsell',
  review_request: 'review_request',
  seasonal_promo: 'seasonal_promo',
  missed_call_textback: 'missed_call_textback',
  abandoned_booking_recovery: 'abandoned_booking_recovery',
  winback_step_1: 'winback_60day',
  winback_step_2: 'winback_60day',
  winback_step_3: 'winback_60day',
  weekly_summary: 'weekly_summary',
};

/** Marketing messages get an opt-out line appended by the sender. Not editable. */
export type MessageClass = 'marketing' | 'transactional';

/**
 * Email bodies are prose dropped into a branded HTML shell the owner does not
 * edit. Segment counting is meaningless for them, and the editor suppresses it.
 */
export type MessageChannel = 'sms' | 'email';

/** Grouping for the editor only — no behavioural meaning. */
export type AutomationGroup = 'Bookings' | 'Retention' | 'Marketing' | 'Email';

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

const CUSTOMER_NAME: TokenSpec = { token: 'customer_name', description: "The customer's first name" };
const COMPANY_NAME: TokenSpec = { token: 'company_name', description: 'Your business name' };
const SERVICE_NAME: TokenSpec = { token: 'service_name', description: 'The service involved' };

/**
 * Vocabulary is declared PER KEY, not globally, because it genuinely differs —
 * `{cleaner_name}` means something in a review request and nothing in a quote
 * nudge. A shared list would either permit tokens that cannot resolve or block
 * ones that can.
 */
export const AUTOMATION_VOCABULARY: Record<AutomationKey, TokenSpec[]> = {
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
    CUSTOMER_NAME,
    { token: 'service_name', description: 'The service they booked' },
    COMPANY_NAME,
    { token: 'date', description: 'The appointment date' },
    { token: 'time', description: 'The appointment time', required: true },
    { token: 'address_line', description: "The job address (blank when we don't have one)" },
  ],
  reminder_advance: [
    CUSTOMER_NAME,
    { token: 'service_name', description: 'The service they booked' },
    COMPANY_NAME,
    { token: 'date', description: 'The appointment date' },
    { token: 'time', description: 'The appointment time', required: true },
    { token: 'address_line', description: "The job address (blank when we don't have one)" },
  ],
  reminder_soon: [
    CUSTOMER_NAME,
    { token: 'service_name', description: 'The service they booked' },
    COMPANY_NAME,
    { token: 'date', description: 'The appointment date' },
    { token: 'time', description: 'The appointment time', required: true },
    { token: 'address_line', description: "The job address (blank when we don't have one)" },
  ],

  quote_stale_reengage: [
    CUSTOMER_NAME,
    { token: 'service_name', description: 'The service they asked about' },
    COMPANY_NAME,
    { token: 'quote_link', description: 'Link to their quote', required: true },
  ],

  /* The nudge is worthless without somewhere to book, so the link is required. */
  rebooking_reminder: [
    CUSTOMER_NAME,
    COMPANY_NAME,
    { token: 'booking_link', description: 'Link to your booking page', required: true },
  ],

  /*
   * No link: this one asks a question and waits for a reply, which is how the
   * conversation gets to a human. Nothing is required beyond having some text.
   */
  recurring_upsell: [
    CUSTOMER_NAME,
    COMPANY_NAME,
  ],

  /*
   * One key covers both review senders. The queued sender has no cleaner or
   * service to hand, so those two resolve to empty there — which is why neither
   * is required. `{review_link}` is: a review request with no link is spam.
   */
  review_request: [
    CUSTOMER_NAME,
    COMPANY_NAME,
    SERVICE_NAME,
    { token: 'cleaner_name', description: 'The tech who did the job (blank when unknown)' },
    { token: 'review_link', description: 'Link to your review page', required: true },
  ],

  seasonal_promo: [
    COMPANY_NAME,
    { token: 'holiday_name', description: 'The upcoming holiday, e.g. Thanksgiving', required: true },
    { token: 'booking_link', description: 'Link to your booking page', required: true },
  ],

  /* The caller has no name yet — they only rang. All we know is who we are. */
  missed_call_textback: [
    COMPANY_NAME,
  ],

  /*
   * `{first_name}`, not `{customer_name}`: the abandoned row is a half-filled
   * form, not a customer record, and that is the field it actually has.
   */
  abandoned_booking_recovery: [
    { token: 'first_name', description: "The name they typed before leaving" },
    COMPANY_NAME,
  ],

  winback_step_1: [
    CUSTOMER_NAME,
    COMPANY_NAME,
    { token: 'offer_percent', description: 'The discount percentage for this step' },
  ],
  winback_step_2: [
    CUSTOMER_NAME,
    COMPANY_NAME,
    { token: 'offer_percent', description: 'The discount percentage for this step' },
  ],
  winback_step_3: [
    CUSTOMER_NAME,
    COMPANY_NAME,
    { token: 'offer_percent', description: 'The discount percentage for this step' },
  ],

  /*
   * The weekly digest's numbers are built by the sender into a table the owner
   * cannot reword. What IS editable is the sentence above it.
   */
  weekly_summary: [
    COMPANY_NAME,
    { token: 'week_range', description: 'The dates the report covers' },
  ],
};

export interface AutomationDefault {
  sms_body: string;
  message_class: MessageClass;
  channel: MessageChannel;
  group: AutomationGroup;
  /** Shown in the editor above the box, so an owner knows what they are changing. */
  label: string;
  /** One line of context under the label. */
  hint?: string;
  /** Email only. Owners can reword it; SMS has no subject. */
  subject?: string;
}

/**
 * The seeded defaults. Copied from the senders they replace, so migrating
 * changes nothing about what is sent until an owner edits it — with ONE
 * deliberate exception per message, noted inline where it applies:
 *
 *   - em dashes became hyphens and the rebooking emoji was dropped, because
 *     each of them forced UCS-2 and roughly tripled the segment bill;
 *   - `quote_stale_reengage` and the other marketing keys get a STOP line
 *     appended by the sender, outside the editable body.
 */
export const AUTOMATION_DEFAULTS: Record<AutomationKey, AutomationDefault> = {
  /*
   * Copied verbatim from send-booking-reminder apart from the em dashes.
   * All three are transactional: the customer booked a job and is being told
   * about that job. No opt-out line is appended.
   */
  booking_confirmation: {
    label: 'Booking confirmation',
    hint: 'Sent as soon as a booking is confirmed.',
    channel: 'sms',
    group: 'Bookings',
    message_class: 'transactional',
    sms_body:
      'Hi {customer_name}! Your {service_name} appointment with {company_name} is confirmed for {date} at {time}. {address_line} Reply to this message with any questions!',
  },
  reminder_advance: {
    label: 'Reminder - 48 hours or more before',
    channel: 'sms',
    group: 'Bookings',
    message_class: 'transactional',
    sms_body:
      'Hi {customer_name}! Friendly reminder - your {service_name} appointment with {company_name} is coming up on {date} at {time}. {address_line} Reply with any questions!',
  },
  reminder_soon: {
    label: 'Reminder - 2 hours or less before',
    channel: 'sms',
    group: 'Bookings',
    message_class: 'transactional',
    sms_body:
      'Hi {customer_name}! Your {service_name} with {company_name} is starting soon - today at {time}. {address_line} See you shortly!',
  },

  /*
   * `quote_stale_reengage` is classed `marketing`, which ADDS an opt-out line
   * the hardcoded version never carried. Deliberate, decided 2026-07-31: the
   * nudge goes to someone who asked for a price and did not book, which is
   * close enough to marketing that carrying the line is cheaper than defending
   * its absence later.
   */
  quote_stale_reengage: {
    label: 'Quote follow-up',
    hint: 'Sent 3-4 days after a quote is sent and still unanswered.',
    channel: 'sms',
    group: 'Marketing',
    message_class: 'marketing',
    sms_body:
      'Hi {customer_name} - just checking in on your {service_name} quote from {company_name}. Still interested? View it here: {quote_link}. Reply if you have questions!',
  },

  /*
   * The original carried a house emoji and an em dash, which together forced
   * UCS-2 on a message already over 300 characters — five segments where three
   * would do. The emoji is gone and the wording is otherwise unchanged.
   */
  rebooking_reminder: {
    label: 'Rebooking nudge',
    hint: 'Sent 28 days after a completed job when nothing is on the books.',
    channel: 'sms',
    group: 'Retention',
    message_class: 'marketing',
    sms_body:
      "Hi {customer_name}! {company_name} here. We loved making your home sparkle! Here's our EXCLUSIVE returning client offer: Book your next cleaning in the next 48 hours and get priority scheduling + our premium deep-clean checklist at NO extra charge. Book now: {booking_link}",
  },

  recurring_upsell: {
    label: 'Recurring plan offer',
    hint: 'Sent 2 hours after a one-time customer\'s first completed job.',
    channel: 'sms',
    group: 'Retention',
    message_class: 'marketing',
    sms_body:
      'Hi! This is {company_name}. Most of our recurring clients never have to worry about cleaning again and also get priority scheduling and lower pricing than one-time bookings.\n\nWant us to lock in a regular cleaning every 2 or 4 weeks so your home stays taken care of automatically?',
  },

  /*
   * Merged default for BOTH review senders. The queued sender's original
   * wording is kept, since it is the one that fires automatically; the manual
   * sender's older `business_settings.review_sms_template` is migrated into
   * this store on first read so the two paths stop disagreeing.
   */
  review_request: {
    label: 'Review request',
    hint: 'Sent 30 minutes after a job is marked complete.',
    channel: 'sms',
    group: 'Retention',
    message_class: 'transactional',
    sms_body:
      "Hi {customer_name}! This is {company_name}. If you enjoyed your cleaning today, we'd really appreciate a quick review here: {review_link}. Thank you for supporting our small business!",
  },

  /*
   * The original ended with a hardcoded "Reply STOP to opt out." Because this
   * key is marketing, the sender now appends that line itself and the default
   * body no longer carries it — `withStopSentence` is idempotent, so an owner
   * who types their own does not get two.
   */
  seasonal_promo: {
    label: 'Seasonal promo',
    hint: 'Sent 3 days before each major holiday.',
    channel: 'sms',
    group: 'Marketing',
    message_class: 'marketing',
    sms_body:
      '{company_name}: {holiday_name} is around the corner! Book your cleaning before {holiday_name} - reply to this message or visit {booking_link} to schedule.',
  },

  missed_call_textback: {
    label: 'Missed-call textback',
    hint: 'Sent instantly when an inbound call goes unanswered. Once per caller per 24 hours.',
    channel: 'sms',
    group: 'Bookings',
    message_class: 'transactional',
    sms_body:
      "Hi, this is {company_name} - sorry we missed your call! Reply to this text and we'll help you get scheduled or answer any questions.",
  },

  abandoned_booking_recovery: {
    label: 'Abandoned booking recovery',
    hint: 'Sent to someone who started a booking and did not finish.',
    channel: 'sms',
    group: 'Marketing',
    message_class: 'marketing',
    sms_body:
      "Hi {first_name}! We noticed you started booking with {company_name} but didn't finish. We'd love to help you complete your reservation! Reply to this message or visit our booking page.",
  },

  /*
   * Email keys. `sms_body` holds the prose paragraph that drops into the
   * branded HTML shell — the shell, header, offer block and footer are not
   * editable, because breaking them breaks rendering in Outlook.
   */
  winback_step_1: {
    label: 'Win-back email 1 (30 days)',
    channel: 'email',
    group: 'Email',
    message_class: 'marketing',
    subject: "We miss you - here's 10% off your next clean",
    sms_body:
      "It's been a month since we last cleaned your home, and we've been thinking about you! We'd love to welcome you back.",
  },
  winback_step_2: {
    label: 'Win-back email 2 (60 days)',
    channel: 'email',
    group: 'Email',
    message_class: 'marketing',
    subject: 'Still thinking of you - 15% off inside',
    sms_body:
      "It's been two months and your home deserves the care it got before. We're still here and ready to help!",
  },
  winback_step_3: {
    label: 'Win-back email 3 (90 days)',
    channel: 'email',
    group: 'Email',
    message_class: 'marketing',
    subject: 'Last chance - 20% off before we stop reaching out',
    sms_body:
      "It's been three months since your last clean. This is our final check-in - we'd love one more chance to earn your business.",
  },
  weekly_summary: {
    label: 'Weekly business summary (intro)',
    hint: 'Goes to you, not customers. The numbers below the intro are generated.',
    channel: 'email',
    group: 'Email',
    message_class: 'transactional',
    subject: 'Weekly Report for {company_name}',
    sms_body: "Here's how {company_name} did during {week_range}.",
  },
};

/** Every key, in the order the editor should show them. */
export const AUTOMATION_KEYS = Object.keys(AUTOMATION_DEFAULTS) as AutomationKey[];

/* ─── GSM-7 ────────────────────────────────────────────────────────────────
 * Duplicated deliberately from src/lib/smsSegments.ts: the Deno copy of this
 * file cannot import from `src/`, and the alternative — no check on the sender
 * side at all — is how the em dash survived three releases.
 */
const GSM_CHARSET = new Set(
  ('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà' +
    '^{}\\[~]|€').split(''),
);

/** The characters in `body` that would force a whole SMS to UCS-2. */
export function nonGsmCharacters(body: string): string[] {
  const found: string[] = [];
  for (const ch of body ?? '') {
    if (!GSM_CHARSET.has(ch) && !found.includes(ch)) found.push(ch);
  }
  return found;
}

/**
 * ANYTHING brace-wrapped, not just well-formed token names.
 *
 * This was `/\{([a-z0-9_]+)\}/gi`, which has no dot — so a GoHighLevel paste
 * like `{contact.first_name}` was not recognised as a token at all. tokensIn
 * returned nothing for it, validateTemplate found no unknown tokens and allowed
 * the save, resolveTemplate logged no warning, and the literal text went out in
 * a customer's SMS. Regal Rest Cleaning shipped exactly that in their live
 * review request; ADD Bhutan wrapped a raw Google review URL in braces the same
 * way. Neither was a validation failure — both were invisible to it.
 *
 * A token this pattern does not recognise is a token nothing can reject, so it
 * matches greedily and lets the vocabulary check decide. Surveyed across every
 * stored template on the platform, there is no legitimate use of braces in
 * ordinary copy, so widening cannot produce a false positive on real wording.
 *
 * `+` rather than `*`: a literal `{}` is not a mistyped token and reporting
 * "{} isn't a thing we can fill in" would only confuse.
 */
const TOKEN_PATTERN = /\{([^}]+)\}/g;

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

/**
 * Email subject, resolved the same way. Falls back to the default subject; an
 * email with a blank subject line lands in spam, so there is no path to one.
 */
export function resolveSubject(
  key: AutomationKey,
  subject: string | null | undefined,
  data: Record<string, string>,
): string {
  const fallback = AUTOMATION_DEFAULTS[key].subject ?? '';
  const chosen = (subject ?? '').trim() || fallback;
  const text = chosen
    .replace(TOKEN_PATTERN, (_m, rawName: string) => data[rawName.toLowerCase()] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return text || fallback;
}

/* ─── STOP compliance ──────────────────────────────────────────────────────
 * Ported from src/components/admin/campaigns/stopCompliance.ts. Case-SENSITIVE
 * on purpose: lowercase "stop" is ordinary English ("we'll stop by Tuesday")
 * and would pass a case-insensitive check while containing no opt-out
 * instruction at all — a false pass that lets a non-compliant message through
 * while appearing validated.
 */
export const STOP_SENTENCE = 'Reply STOP to opt out.';

export function hasStopLanguage(body: string | null | undefined): boolean {
  if (!body) return false;
  return /\bSTOP\b/.test(body);
}

/** Idempotent — safe to call twice, will not stack duplicate sentences. */
export function withStopSentence(body: string): string {
  if (hasStopLanguage(body)) return body;
  const trimmed = body.trimEnd();
  if (!trimmed) return STOP_SENTENCE;
  const needsSpace = !/[.!?]$/.test(trimmed);
  return `${trimmed}${needsSpace ? '.' : ''} ${STOP_SENTENCE}`;
}
