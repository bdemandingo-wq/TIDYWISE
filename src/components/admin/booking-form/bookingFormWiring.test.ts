// Wiring invariants for the admin booking-form stepper.
//
//   node --experimental-strip-types --test src/components/admin/booking-form/bookingFormWiring.test.ts
//
// WHY THIS IS A STATIC TEST AND NOT A UNIT TEST. There is no logic to unit-test
// here — the whole change is state plumbing, and the pure part
// (customerNotesToRender) already has its own 11-test spec. What actually broke
// is a WIRING class of bug, and it is invisible to type-checking:
//
//   `bathrooms` had an interface entry, a useState, and a provider-value entry,
//   but setBathrooms was NEVER CALLED. Not in resetForm, not in
//   prefillFromBooking. So a booking whose row held "2.5" rendered "1 ba" — the
//   useState default — and tsc was perfectly happy, because every declaration
//   was present and consistent. The only thing missing was a call.
//
// A component test would catch it, but vitest and @testing-library are not
// installed in this repo. So this reads the source as text and asserts the calls
// exist. That is a blunt instrument and it is deliberately blunt: it fails on
// the exact defect we just spent a booking's worth of debugging on, and it would
// have failed on it before it shipped.
//
// If this file breaks because someone renamed resetForm or prefillFromBooking,
// the fix is to update the anchors below — not to delete the test.
//
// See docs/superpowers/plans/2026-08-14-bathrooms-and-customer-notes-wiring.md
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CONTEXT_SRC = readFileSync(
  new URL("./BookingFormContext.tsx", import.meta.url),
  "utf8",
);
const PAYMENT_STEP_SRC = readFileSync(
  new URL("./steps/PaymentStep.tsx", import.meta.url),
  "utf8",
);

/**
 * Body of an arrow function assigned to `const <name> = `, from its opening
 * brace to the matching close. Brace-counted rather than regex-matched, because
 * both of these bodies contain nested braces and object literals.
 */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = `);
  assert.notEqual(start, -1, `could not find "const ${name} = " — was it renamed?`);
  const open = src.indexOf("{", start);
  assert.notEqual(open, -1, `no opening brace after ${name}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const RESET = functionBody(CONTEXT_SRC, "resetForm");
const PREFILL = functionBody(CONTEXT_SRC, "prefillFromBooking");

/**
 * Fields derived from a booking row. Each must be settable from BOTH paths:
 * prefill (so an existing booking's value is shown) and reset (so it does not
 * leak into the next booking in the same session).
 *
 * `notes` is included as the control — it was already correctly wired, so if it
 * ever fails, the anchors above have drifted rather than the wiring regressed.
 */
const BOOKING_DERIVED_SETTERS = [
  "setNotes",
  "setBedrooms",
  "setBathrooms",
  "setSquareFootage",
  "setCustomerNotes",
] as const;

// ─── the invariant that would have caught the bathrooms bug ─────────────────

test("every booking-derived field is set in BOTH prefill and reset", () => {
  const missing: string[] = [];
  for (const setter of BOOKING_DERIVED_SETTERS) {
    if (!PREFILL.includes(`${setter}(`)) missing.push(`${setter} missing from prefillFromBooking`);
    if (!RESET.includes(`${setter}(`)) missing.push(`${setter} missing from resetForm`);
  }
  assert.deepEqual(missing, [], missing.join("; "));
});

test("setNotes is wired in both paths — the control", () => {
  // If this fails, functionBody() found the wrong region. Every other assertion
  // in this file becomes meaningless, so check this before believing them.
  assert.ok(PREFILL.includes("setNotes("), "control: setNotes absent from prefill");
  assert.ok(RESET.includes("setNotes("), "control: setNotes absent from reset");
});

// ─── bathrooms specifically ─────────────────────────────────────────────────

test("prefillFromBooking reads bathrooms off the booking row", () => {
  // Not just "setBathrooms is called" — called with the ROW's value. A
  // setBathrooms('1') in prefill would satisfy the invariant above and still
  // render the wrong number.
  assert.match(
    PREFILL,
    /setBathrooms\(\s*booking\.bathrooms/,
    "prefill must set bathrooms from booking.bathrooms, not a literal",
  );
});

test("resetForm clears bathrooms to the same default as its useState", () => {
  // The default is '1' in three places now (useState, reset, prefill fallback).
  // They must agree, or resetting produces a value the Select cannot render.
  assert.match(CONTEXT_SRC, /const \[bathrooms, setBathrooms\] = useState\('1'\)/);
  assert.match(RESET, /setBathrooms\('1'\)/);
});

// ─── customerNotes ──────────────────────────────────────────────────────────

test("customerNotes has state, and prefill reads it off the row", () => {
  assert.match(CONTEXT_SRC, /const \[customerNotes, setCustomerNotes\] = useState/);
  assert.match(PREFILL, /setCustomerNotes\(/);
});

test("customerNotes is exposed on the context value", () => {
  // The provider's value object is the only way PaymentStep can reach it.
  assert.match(CONTEXT_SRC, /^\s+customerNotes,\s*$/m, "customerNotes missing from provider value");
});

test("setCustomerNotes is NOT exposed on the context", () => {
  // Read-only enforced at the type level, not by convention. This is the
  // customer's own words; no admin surface should be able to overwrite them, and
  // the save path writes `notes` only — so an exposed setter would be a trap
  // that silently discards edits.
  assert.doesNotMatch(
    CONTEXT_SRC,
    /^\s+setCustomerNotes:/m,
    "setCustomerNotes must not be declared on the context interface",
  );
  assert.doesNotMatch(
    CONTEXT_SRC,
    /^\s+setCustomerNotes,\s*$/m,
    "setCustomerNotes must not be passed in the provider value",
  );
});

// ─── the render site ────────────────────────────────────────────────────────

test("PaymentStep renders the shared CustomerNotesBlock", () => {
  assert.match(PAYMENT_STEP_SRC, /import \{ CustomerNotesBlock \}/);
  assert.match(PAYMENT_STEP_SRC, /<CustomerNotesBlock/);
});

test("PaymentStep does not reimplement the block — no fifth copy", () => {
  // The label lives in one constant in src/lib/customerNotes.ts. A hand-typed
  // copy here is how four consistent surfaces become five inconsistent ones.
  assert.doesNotMatch(
    PAYMENT_STEP_SRC,
    /From the customer/,
    "PaymentStep must not hardcode the label — use CustomerNotesBlock",
  );
});

test("the customer block sits ABOVE the Special Instructions field", () => {
  // Context for what the admin is about to type, not a footnote after it.
  const block = PAYMENT_STEP_SRC.indexOf("<CustomerNotesBlock");
  const label = PAYMENT_STEP_SRC.indexOf("Special Instructions");
  assert.ok(block > -1 && label > -1, "both markers must be present");
  assert.ok(
    block < label,
    `CustomerNotesBlock (${block}) must appear before Special Instructions (${label})`,
  );
});
