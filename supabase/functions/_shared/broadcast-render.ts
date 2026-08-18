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
 *
 * The signature is appended at render time too, but it is NOT the same kind of
 * value. The unsubscribe sentence is a constant this module owns and emits
 * unescaped; the signature arrives from the compose form, so it is untrusted
 * input and goes through escapeHtml like the body. That is why it cannot carry
 * its own markup — no hand-written <a>, no bold. Mail clients auto-linkify bare
 * addresses and phone numbers, which covers the actual use.
 *
 * The signature also applies to BOTH classes, unlike the unsubscribe footer.
 * It is deliberately a separate parameter rather than something derived from
 * `unsubscribeUrl`, because deriving it would silently make it marketing-only.
 */

export const UNSUBSCRIBE_SENTENCE = "You're receiving this because you own a TidyWise account.";

export const MAX_SUBJECT = 200;

// A signature is a name and contact details, not a second body. The cap exists
// so a paste accident cannot quietly become the bulk of the email.
export const MAX_SIGNATURE = 500;

export type MessageClass = 'transactional' | 'marketing';

export interface BroadcastInput {
  subject?: unknown;
  bodyText?: unknown;
  messageClass?: unknown;
  signature?: unknown;
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

  // Optional by design — an empty signature is a valid broadcast, so absence is
  // not an error. Only a present-but-oversized one is.
  if (typeof input.signature === 'string' && input.signature.trim().length > MAX_SIGNATURE) {
    errors.push(`signature must be ${MAX_SIGNATURE} characters or fewer`);
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
  signature?: string | null;
}): string {
  const { bodyText, unsubscribeUrl, signature } = args;

  // Above the <hr>, so it reads as part of the message rather than as footer
  // boilerplate — and so the CONTROL test that asserts the two classes are
  // byte-identical before the <hr> covers it. Put it below the rule and that
  // test stops guarding the signature entirely.
  //
  // paragraphs() rather than a raw interpolation: it is the one place escaping
  // and newline handling live, so the signature cannot drift from the body on
  // either. A blank or whitespace-only signature yields '' and emits nothing —
  // no stray margin, no empty block.
  const signatureBlock = signature && signature.trim()
    ? `\n<div style="margin-top:24px">\n${paragraphs(signature)}\n</div>`
    : '';

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
${paragraphs(bodyText)}${signatureBlock}
${footer}
</div>`;
}

export function renderBroadcastText(args: {
  bodyText: string;
  unsubscribeUrl: string | null;
  signature?: string | null;
}): string {
  const { bodyText, unsubscribeUrl, signature } = args;
  // Same order as the HTML: body, signature, then the unsubscribe separator.
  const withSignature = signature && signature.trim()
    ? `${bodyText.trim()}\n\n${signature.trim()}`
    : bodyText.trim();
  if (!unsubscribeUrl) return withSignature;
  return `${withSignature}\n\n---\n${UNSUBSCRIBE_SENTENCE}\nUnsubscribe: ${unsubscribeUrl}`;
}
