/**
 * What the customer wrote on their own booking, and whether there is anything
 * worth rendering.
 *
 * Deliberately ZERO imports so `node:test` can load it directly.
 * Tests: src/lib/customerNotes.test.ts
 *
 * WHY THIS EXISTS. bookings.customer_notes is written by
 * ingest-external-booking:167 and, until now, read by nothing — what customers
 * typed was invisible in the CRM. Four surfaces render it, and all four need the
 * same answer to one question: is there anything here?
 *
 * That question is not `!!value`. The value crosses a public booking form on
 * another site and then an edge-function payload, so it can arrive as null, "",
 * "   ", or something that was never a string. `{booking.customer_notes && …}`
 * would render an empty labelled box for a customer who pressed the spacebar —
 * on the card a cleaner reads while deciding whether to accept a job.
 *
 * See docs/superpowers/plans/2026-08-14-surface-customer-notes.md
 */

/**
 * Whose words these are. Exported as a constant because four render sites use
 * it: three hand-typed copies is how "From the customer" and "Customer notes"
 * end up on different screens.
 *
 * Deliberately NOT "Special Instructions" — that label belongs to the admin's
 * own editable field, and the entire point of this feature is that the two are
 * distinguishable at a glance.
 */
export const CUSTOMER_NOTES_LABEL = "From the customer";

/**
 * The text to render, or null when there is nothing worth showing.
 *
 * Takes `unknown` rather than `string | null` on purpose: the caller is reading
 * a jsonb-sourced column off an API response, and a number reaching `.trim()`
 * would take down the whole job card.
 *
 * Trims the OUTSIDE only. Internal line breaks are preserved because access
 * instructions are almost always multi-line and the render sites use
 * `whitespace-pre-wrap` — collapsing them here would silently flatten exactly
 * the content this feature exists to surface.
 */
export function customerNotesToRender(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
