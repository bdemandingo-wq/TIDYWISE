/**
 * Pure rendering + validation for platform broadcast emails.
 *
 * Deliberately ZERO imports and no Deno globals, so Node v24 can strip the
 * types natively and the colocated test needs no bundler.
 *
 * KEEP IN SYNC: this is a verbatim copy of `src/lib/broadcast-render.ts`
 * below this header. That copy is canonical and is what
 * src/lib/broadcast-render.test.ts tests.
 *
 * The load-bearing rule encoded here: the unsubscribe line is appended at
 * RENDER time from a url the caller supplies, and is never part of the stored
 * body. This mirrors withStopSentence() on the SMS side, and for the same
 * reason — an operator rewording their copy must not be able to drop it.
 */

export const UNSUBSCRIBE_SENTENCE = "You're receiving this because you own a TidyWise account.";

export const MAX_SUBJECT = 200;

export type MessageClass = 'transactional' | 'marketing';

export interface BroadcastInput {
  subject?: unknown;
  bodyText?: unknown;
  messageClass?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateBroadcastInput(input: BroadcastInput): ValidationResult {
  const errors: string[] = [];

  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.bodyText === 'string' ? input.bodyText.trim() : '';

  if (!subject) errors.push('subject is required');
  else if (subject.length > MAX_SUBJECT) errors.push(`subject must be ${MAX_SUBJECT} characters or fewer`);

  if (!body) errors.push('body is required');

  // Absent and invalid are separate errors: "required" is what the UI shows
  // when nothing is picked, and there is deliberately no default to fall back
  // to — a wrong class mislabels either a service notice or an ad.
  if (input.messageClass === undefined || input.messageClass === null || input.messageClass === '') {
    errors.push('message_class is required');
  } else if (input.messageClass !== 'transactional' && input.messageClass !== 'marketing') {
    errors.push('message_class must be transactional or marketing');
  }

  return { ok: errors.length === 0, errors };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Split on blank lines into paragraphs; single newlines become <br>. */
function paragraphs(bodyText: string): string {
  return bodyText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export function renderBroadcastHtml(args: {
  bodyText: string;
  unsubscribeUrl: string | null;
}): string {
  const { bodyText, unsubscribeUrl } = args;

  // UNSUBSCRIBE_SENTENCE is NOT escaped. It is a compile-time constant we own,
  // not an injection surface, and escaping it turns "You're" into "You&#39;re"
  // — which renders fine but makes the constant unmatchable in the source, so
  // any assertion that the footer contains it can never pass. escapeHtml stays
  // on bodyText and unsubscribeUrl, which are the values that actually arrive
  // from outside. renderBroadcastText already emits the constant unescaped, so
  // this also keeps the two renderers consistent.
  const footer = unsubscribeUrl
    ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5">
${UNSUBSCRIBE_SENTENCE}
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a>.
</p>`
    : '';

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#111827;max-width:560px;margin:0 auto;padding:24px">
${paragraphs(bodyText)}
${footer}
</div>`;
}

export function renderBroadcastText(args: {
  bodyText: string;
  unsubscribeUrl: string | null;
}): string {
  const { bodyText, unsubscribeUrl } = args;
  if (!unsubscribeUrl) return bodyText.trim();
  return `${bodyText.trim()}\n\n---\n${UNSUBSCRIBE_SENTENCE}\nUnsubscribe: ${unsubscribeUrl}`;
}
