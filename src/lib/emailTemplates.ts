// Shared types + defaults for the branded email template builder.
// Sections are the source of truth; the plain-text bodies are kept for legacy fallback.

import DOMPurify from 'dompurify';

export type EmailSectionKey =
  | 'intro'
  | 'reminders'
  | 'pricing'
  | 'cancellation'
  | 'payment'
  | 'satisfaction'
  | 'closing'
  | 'footer'
  | 'custom';

export interface EmailSection {
  id: string;
  key: EmailSectionKey;
  /** Optional heading rendered as an <h2> above the section body. Empty = no heading. */
  title: string;
  /** Sanitized HTML from the rich-text editor. Can contain {{variables}}. */
  html: string;
  enabled: boolean;
  order: number;
}

export interface EmailSectionMeta {
  key: EmailSectionKey;
  label: string;
  description: string;
  defaultTitle: string;
}

export const SECTION_META: EmailSectionMeta[] = [
  { key: 'intro',        label: 'Introductory message',      description: 'Warm greeting shown right below the banner.', defaultTitle: '' },
  { key: 'reminders',    label: 'Important reminders',       description: 'Prep steps or must-know notes for the visit.', defaultTitle: 'Before we arrive' },
  { key: 'pricing',      label: 'Pricing & adjustments',     description: 'How pricing works or may change on-site.',     defaultTitle: 'About your price' },
  { key: 'cancellation', label: 'Cancellation & rescheduling policy', description: 'Your window and any fees.',          defaultTitle: 'Cancellation & rescheduling' },
  { key: 'payment',      label: 'Payment information',       description: 'When and how the card is charged.',            defaultTitle: 'Payment' },
  { key: 'satisfaction', label: 'Satisfaction policy',       description: 'Your guarantee if something is missed.',       defaultTitle: 'Our satisfaction guarantee' },
  { key: 'closing',      label: 'Closing message',           description: 'Sign-off and any warm words.',                 defaultTitle: '' },
  { key: 'footer',       label: 'Footer note',               description: 'Small print at the bottom.',                   defaultTitle: '' },
  { key: 'custom',       label: 'Custom section',            description: 'Anything you want to add.',                    defaultTitle: 'Additional info' },
];

export const TEMPLATE_VARIABLES: { key: string; desc: string }[] = [
  { key: '{{customer_name}}',  desc: 'Customer full name' },
  { key: '{{booking_number}}', desc: 'Booking reference' },
  { key: '{{service_name}}',   desc: 'Service type' },
  { key: '{{scheduled_date}}', desc: 'Appointment date' },
  { key: '{{scheduled_time}}', desc: 'Appointment time' },
  { key: '{{address}}',        desc: 'Service address' },
  { key: '{{total_amount}}',   desc: 'Total (no $)' },
  { key: '{{company_name}}',   desc: 'Business name' },
];

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** DOMPurify config: rich-text formatting only, no scripts, no styles, no iframes. */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote', 'span',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^:]*$)/i,
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input'],
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
};

export function sanitizeSectionHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, SANITIZE_CONFIG) as unknown as string;
}

export function sanitizeSections(sections: EmailSection[]): EmailSection[] {
  return sections.map((s) => ({ ...s, html: sanitizeSectionHtml(s.html) }));
}

function textToParagraphs(text: string): string {
  if (!text) return '';
  return text
    .split(/\n{2,}/)
    .map((p) => {
      const lines = p.split(/\n/).map((l) =>
        l
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;'),
      );
      // Bullet-like lines beginning with "- "
      if (lines.every((l) => l.trim().startsWith('- '))) {
        return `<ul>${lines.map((l) => `<li>${l.replace(/^\s*-\s+/, '')}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.join('<br/>')}</p>`;
    })
    .join('');
}

/** Build the canonical branded default template for confirmations. */
export function defaultConfirmationSections(): EmailSection[] {
  const base: Array<Omit<EmailSection, 'id' | 'order'>> = [
    { key: 'intro', enabled: true, title: '',
      html:
        `<p>Hi <strong>{{customer_name}}</strong>,</p>` +
        `<p>Thanks for booking with <strong>{{company_name}}</strong>! You're all set for <strong>{{scheduled_date}}</strong> at <strong>{{scheduled_time}}</strong>. The full appointment details are below.</p>` },
    { key: 'reminders', enabled: true, title: 'Before we arrive',
      html:
        `<ul>` +
        `<li>Please make sure someone 18+ is available, or leave clear entry instructions.</li>` +
        `<li>Secure pets in a comfortable area away from the work zone.</li>` +
        `<li>Move small valuables and fragile items you'd like us to skip.</li>` +
        `</ul>` },
    { key: 'pricing', enabled: true, title: 'About your price',
      html:
        `<p>Your quoted total is <strong>\${{total_amount}}</strong>. If we discover the home is significantly larger, dirtier, or has extra rooms compared to what was booked, we'll contact you first before making any adjustment.</p>` },
    { key: 'cancellation', enabled: true, title: 'Cancellation & rescheduling',
      html:
        `<p>Need to reschedule? Just reply to this email at least <strong>24 hours</strong> before your appointment and we'll take care of it — no fee.</p>` +
        `<p>Cancellations inside 24 hours may be subject to a late-cancel fee.</p>` },
    { key: 'payment', enabled: true, title: 'Payment',
      html:
        `<p>Your card on file will be charged after service is complete. You'll receive a receipt by email as soon as the payment goes through.</p>` },
    { key: 'satisfaction', enabled: true, title: 'Our satisfaction guarantee',
      html:
        `<p>If anything isn't up to your standards, let us know within 24 hours and we'll come back to make it right — on us.</p>` },
    { key: 'closing', enabled: true, title: '',
      html:
        `<p>We can't wait to see you on <strong>{{scheduled_date}}</strong>. Reply to this email anytime — a real person on our team will get right back to you.</p>` +
        `<p>Warmly,<br/>The {{company_name}} team</p>` },
    { key: 'footer', enabled: false, title: '',
      html: `<p>Booking reference: {{booking_number}}</p>` },
  ];
  return base.map((s, i) => ({ ...s, id: uid(), order: i }));
}

export function defaultReminderSections(): EmailSection[] {
  const base: Array<Omit<EmailSection, 'id' | 'order'>> = [
    { key: 'intro', enabled: true, title: '',
      html:
        `<p>Hi <strong>{{customer_name}}</strong>,</p>` +
        `<p>Just a friendly reminder that your <strong>{{service_name}}</strong> is scheduled for <strong>{{scheduled_date}}</strong> at <strong>{{scheduled_time}}</strong>.</p>` },
    { key: 'reminders', enabled: true, title: 'A quick checklist',
      html:
        `<ul>` +
        `<li>Confirm someone 18+ will be home or leave entry instructions.</li>` +
        `<li>Secure pets and clear the areas you'd like us to focus on.</li>` +
        `<li>Let us know about any last-minute changes.</li>` +
        `</ul>` },
    { key: 'cancellation', enabled: true, title: 'Need to reschedule?',
      html:
        `<p>Reply to this email as soon as possible so we can update your appointment without any late-cancel fees.</p>` },
    { key: 'payment', enabled: false, title: 'Payment',
      html: `<p>Your card on file will be charged after service is complete.</p>` },
    { key: 'satisfaction', enabled: false, title: 'Our satisfaction guarantee',
      html: `<p>If anything isn't right, tell us within 24 hours and we'll return to fix it.</p>` },
    { key: 'closing', enabled: true, title: '',
      html:
        `<p>See you soon!<br/>The {{company_name}} team</p>` },
    { key: 'footer', enabled: false, title: '',
      html: `<p>Booking reference: {{booking_number}}</p>` },
  ];
  return base.map((s, i) => ({ ...s, id: uid(), order: i }));
}

/**
 * If the org has no rich sections yet but has a legacy plain-text body, seed a single
 * "intro" section containing that content so nothing is lost.
 */
export function migratePlainTextToSections(
  plainText: string,
  templateType: 'confirmation' | 'reminder',
): EmailSection[] {
  const defaults =
    templateType === 'confirmation' ? defaultConfirmationSections() : defaultReminderSections();
  if (!plainText || !plainText.trim()) return defaults;
  const introHtml = textToParagraphs(plainText);
  // Return a single intro section containing the legacy content so admins see exactly
  // what customers were previously receiving. They can add branded sections back with Reset.
  return [
    { id: uid(), key: 'intro', title: '', html: sanitizeSectionHtml(introHtml), enabled: true, order: 0 },
    ...defaults.filter((s) => s.key !== 'intro').map((s, i) => ({ ...s, order: i + 1, enabled: false })),
  ];
}

export function normalizeSections(input: unknown): EmailSection[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: EmailSection[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    out.push({
      id: typeof r.id === 'string' ? r.id : uid(),
      key: (typeof r.key === 'string' ? r.key : 'custom') as EmailSectionKey,
      title: typeof r.title === 'string' ? r.title : '',
      html: sanitizeSectionHtml(typeof r.html === 'string' ? r.html : ''),
      enabled: r.enabled !== false,
      order: typeof r.order === 'number' ? r.order : out.length,
    });
  }
  return out.sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i }));
}

export function newSection(key: EmailSectionKey = 'custom'): EmailSection {
  const meta = SECTION_META.find((m) => m.key === key);
  return {
    id: uid(),
    key,
    title: meta?.defaultTitle ?? '',
    html: '<p></p>',
    enabled: true,
    order: 999,
  };
}
