// What the customer wrote on their own booking — and whether there is anything
// worth rendering.
//
// Runner: node:test (vitest is not installed; 15 other specs in src/lib use it):
//
//   node --experimental-strip-types --test src/lib/customerNotes.test.ts
//
// WHY THIS EXISTS. bookings.customer_notes is written by
// ingest-external-booking:167 and read by nothing — what customers type is
// currently invisible in the CRM. Four surfaces will render it, and all four
// need the same answer to one question: is there anything here?
//
// That question is not `!!value`. The value crosses two system boundaries — a
// public booking form on another site, then a jsonb-ish edge-function payload —
// so it arrives as `unknown` and can be null, "", "   ", or something that was
// never a string. `{booking.customer_notes && ...}` would render an empty
// labelled box for a customer who pressed space, on the surface where a cleaner
// is deciding whether to accept a job.
//
// See docs/superpowers/plans/2026-08-14-surface-customer-notes.md
import { test } from "node:test";
import assert from "node:assert/strict";
import { customerNotesToRender, CUSTOMER_NOTES_LABEL } from "./customerNotes.ts";

// ─── absence, in all the forms it actually arrives in ───────────────────────

test("a null column renders nothing — the common case", () => {
  // Most bookings have no customer note and never will. This is the default
  // path, not an edge case.
  assert.equal(customerNotesToRender(null), null);
  assert.equal(customerNotesToRender(undefined), null);
});

test("an empty string renders nothing", () => {
  assert.equal(customerNotesToRender(""), null);
});

test("whitespace-only renders nothing", () => {
  // The case `{value && ...}` gets wrong. A customer who typed a space, or whose
  // textarea submitted a stray newline, must not produce an empty labelled block
  // on a cleaner's job card.
  for (const junk of ["   ", "\n", "\t", " \n\t  \r\n "]) {
    assert.equal(customerNotesToRender(junk), null, `failed on ${JSON.stringify(junk)}`);
  }
});

test("a non-string renders nothing rather than throwing", () => {
  // It arrives as `unknown` from an edge function. A number here must not reach
  // .trim() and take down the job card with it.
  for (const junk of [0, 42, true, false, {}, [], { text: "hi" }]) {
    assert.equal(customerNotesToRender(junk), null, `failed on ${JSON.stringify(junk)}`);
  }
});

// ─── presence ───────────────────────────────────────────────────────────────

test("a real note is returned", () => {
  assert.equal(customerNotesToRender("Gate code 4417"), "Gate code 4417");
});

test("surrounding whitespace is trimmed", () => {
  assert.equal(customerNotesToRender("  Gate code 4417\n"), "Gate code 4417");
});

test("internal line breaks survive", () => {
  // Access instructions are the reason this feature exists and they are almost
  // always multi-line. The render sites use whitespace-pre-wrap, so collapsing
  // newlines here would silently flatten exactly the content that matters most.
  const note = "Gate code 4417\nDog in the yard — friendly\nFocus on the kitchen";
  assert.equal(customerNotesToRender(note), note);
});

test("a single non-whitespace character counts as present", () => {
  // The boundary of the whitespace rule, stated so it cannot drift into a
  // minimum-length check nobody asked for.
  assert.equal(customerNotesToRender("?"), "?");
});

// ─── the labelling contract ─────────────────────────────────────────────────

test("the label names whose words these are", () => {
  // Two unlabelled note blocks would be worse than one. The label is exported as
  // a constant so all four render sites are literally the same string — three
  // hand-typed copies is how "From the customer" and "Customer notes" end up on
  // different screens.
  assert.equal(CUSTOMER_NOTES_LABEL, "From the customer");
});

test("the customer label is not the staff label", () => {
  // The whole point of the change: the admin's own field stays "Special
  // Instructions" and is editable; this one is the customer's and is read-only.
  // If these ever collapse to one string the distinction is gone.
  assert.notEqual(CUSTOMER_NOTES_LABEL, "Special Instructions");
});

// ─── purity ─────────────────────────────────────────────────────────────────

test("same input, same answer, no mutation", () => {
  const input = { customer_notes: "  Gate code 4417  " };
  const snapshot = JSON.parse(JSON.stringify(input));
  assert.equal(customerNotesToRender(input.customer_notes), customerNotesToRender(input.customer_notes));
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
});
