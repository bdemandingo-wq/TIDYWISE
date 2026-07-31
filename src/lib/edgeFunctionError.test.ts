/**
 * Unit tests for reading edge-function error bodies.
 *
 * Run with:  node --test src/lib/edgeFunctionError.test.ts
 *
 * No test runner dependency: Node 24 strips TypeScript types natively, and the
 * module under test is dependency-free. Same arrangement as
 * src/components/admin/campaigns/campaignRunStatus.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readEdgeFunctionErrorBody, firstFieldError } from "./edgeFunctionError.ts";

/** Minimal stand-in for the Response supabase-js hangs off `error.context`. */
function httpError(body: unknown, opts: { legacy?: boolean } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  if (opts.legacy) return { context: { body: text } };
  let consumed = false;
  return {
    context: {
      clone: () => ({
        json: async () => {
          if (consumed) throw new Error("body already consumed");
          return JSON.parse(text);
        },
      }),
      // The original, to prove clone() left it alone.
      json: async () => {
        consumed = true;
        return JSON.parse(text);
      },
    },
  };
}

test("reads the conflict flag — the case that never fired", async () => {
  const err = httpError({ success: false, error: "That time was just booked—pick another time.", conflict: true });
  const body = await readEdgeFunctionErrorBody(err);
  assert.equal(body?.conflict, true);
  assert.match(String(body?.error), /just booked/);
});

test("reads the rate-limit message", async () => {
  const err = httpError({ success: false, error: "Too many booking attempts. Please wait a few minutes and try again." });
  const body = await readEdgeFunctionErrorBody(err);
  assert.match(String(body?.error), /Too many booking attempts/);
  assert.equal(body?.conflict, undefined);
});

test("reads zod field details", async () => {
  const err = httpError({ success: false, error: "Invalid input", details: { phone: ["Required"] } });
  const body = await readEdgeFunctionErrorBody(err);
  assert.equal(firstFieldError(body?.details), "Required");
});

test("supports the older context.body string shape", async () => {
  const err = httpError({ error: "Nope", conflict: true }, { legacy: true });
  const body = await readEdgeFunctionErrorBody(err);
  assert.equal(body?.conflict, true);
});

test("does NOT consume the body — readEdgeFunctionError still works after", async () => {
  const err = httpError({ error: "Still here" });
  await readEdgeFunctionErrorBody(err);
  // The original Response was never read, so a later reader still sees it.
  const again = await (err.context as { json: () => Promise<{ error: string }> }).json();
  assert.equal(again.error, "Still here");
});

test("returns null rather than throwing on junk", async () => {
  assert.equal(await readEdgeFunctionErrorBody(null), null);
  assert.equal(await readEdgeFunctionErrorBody(undefined), null);
  assert.equal(await readEdgeFunctionErrorBody("a string"), null);
  assert.equal(await readEdgeFunctionErrorBody({}), null);
  assert.equal(await readEdgeFunctionErrorBody({ context: null }), null);
  assert.equal(await readEdgeFunctionErrorBody(httpError("<html>502</html>")), null);
  assert.equal(await readEdgeFunctionErrorBody(httpError("[1,2,3]")), null);
});

test("firstFieldError handles every shape it might be handed", () => {
  assert.equal(firstFieldError({ phone: ["Required", "Too short"] }), "Required");
  assert.equal(firstFieldError({ email: [], phone: ["Required"] }), "Required");
  assert.equal(firstFieldError({ name: "Bad name" }), "Bad name");
  assert.equal(firstFieldError({}), null);
  assert.equal(firstFieldError(null), null);
  assert.equal(firstFieldError(undefined), null);
  assert.equal(firstFieldError("not an object"), null);
  assert.equal(firstFieldError([1, 2]), null);
  assert.equal(firstFieldError({ phone: ["   "] }), null);
});
