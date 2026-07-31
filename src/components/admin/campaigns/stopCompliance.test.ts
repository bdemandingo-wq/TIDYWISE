/**
 * Unit tests for campaign STOP-line compliance.
 *
 * Run with:  node --test src/components/admin/campaigns/stopCompliance.test.ts
 *
 * No test runner dependency: Node 24 strips TypeScript types natively, and the
 * module under test is deliberately dependency-free and JSX-free so it can be
 * imported directly. Same arrangement as campaignRunStatus.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasStopLanguage, stopComplianceError, withStopSentence, STOP_SENTENCE } from "./stopCompliance.ts";

test("accepts the wizard's seeded default", () => {
  const seeded =
    "Hi {first_name}! This is {company_name}. We wanted to reach out — we'd love to have you back! Reply STOP to opt out.";
  assert.equal(hasStopLanguage(seeded), true);
  assert.equal(stopComplianceError(seeded), null);
});

test("accepts common compliant variants", () => {
  for (const body of [
    "Deal inside. Text STOP to unsubscribe.",
    "Reply STOP to cancel",
    "Msg&data rates may apply. STOP to end.",
    "STOP to opt out",
  ]) {
    assert.equal(hasStopLanguage(body), true, body);
  }
});

test("rejects a body with the opt-out deleted — the actual exploit", () => {
  const stripped = "Hi {first_name}! This is {company_name}. We'd love to have you back!";
  assert.equal(hasStopLanguage(stripped), false);
  assert.match(stopComplianceError(stripped)!, /opt out/i);
});

test("lowercase prose does NOT count as an opt-out instruction", () => {
  // The false pass that matters: a case-insensitive check would let this through
  // while it contains no opt-out instruction at all.
  assert.equal(hasStopLanguage("We'll stop by on Tuesday to finish up."), false);
  assert.equal(hasStopLanguage("Our one-stop cleaning service is back!"), false);
});

test("STOP must be a standalone word", () => {
  assert.equal(hasStopLanguage("We never STOPPED serving your area"), false);
  assert.equal(hasStopLanguage("NONSTOP service all summer"), false);
});

test("empty and whitespace bodies are rejected, with a different message", () => {
  assert.match(stopComplianceError("")!, /required/i);
  assert.match(stopComplianceError("   ")!, /required/i);
  assert.match(stopComplianceError(null)!, /required/i);
  assert.match(stopComplianceError(undefined)!, /required/i);
});

test("withStopSentence appends when missing", () => {
  assert.equal(
    withStopSentence("Come back and save 20%"),
    `Come back and save 20%. ${STOP_SENTENCE}`,
  );
});

test("withStopSentence does not double up existing punctuation", () => {
  assert.equal(
    withStopSentence("Come back and save 20%!"),
    `Come back and save 20%! ${STOP_SENTENCE}`,
  );
});

test("withStopSentence is idempotent — calling twice never stacks", () => {
  const once = withStopSentence("Come back and save 20%");
  assert.equal(withStopSentence(once), once);
});

test("withStopSentence output always passes its own validator", () => {
  for (const body of ["Come back!", "Deal inside", "   spaced   ", "50% off"]) {
    assert.equal(stopComplianceError(withStopSentence(body)), null, body);
  }
});
