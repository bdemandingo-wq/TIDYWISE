/**
 * Unit tests for the run-status vocabulary.
 *
 * Run with:  node --test src/components/admin/campaigns/campaignRunStatus.test.ts
 *
 * No test runner dependency: Node 24 strips TypeScript types natively, and the
 * module under test is deliberately dependency-free and JSX-free so it can be
 * imported directly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presentRun,
  isRunActive,
  formatInOrgTime,
  type CampaignRun,
} from "./campaignRunStatus.ts";

const NOW = new Date("2026-07-29T12:00:00Z");

const run = (over: Partial<CampaignRun>): CampaignRun => ({
  id: "run-1",
  status: "running",
  cancel_reason: null,
  scheduled_at: null,
  total_recipients: 300,
  sent_count: 12,
  failed_count: 0,
  skipped_opted_out_count: 0,
  ...over,
});

test("no run yields null so the caller falls back to template state", () => {
  assert.equal(presentRun(null), null);
  assert.equal(presentRun(undefined), null);
});

test("pending with a future schedule reads as Scheduled and names the time", () => {
  const p = presentRun(
    run({ status: "pending", scheduled_at: "2026-08-04T13:00:00Z" }),
    { orgTimezone: "America/New_York", now: NOW },
  )!;
  assert.equal(p.label, "Scheduled");
  assert.equal(p.tone, "neutral");
  assert.match(p.detail!, /^Sends /);
  assert.match(p.detail!, /America\/New_York/);
  assert.deepEqual(p.actions, ["cancel"]);
  assert.equal(p.showProgress, false);
});

test("pending with a past schedule is Starting, not Scheduled", () => {
  const p = presentRun(
    run({ status: "pending", scheduled_at: "2026-07-29T11:00:00Z" }),
    { now: NOW },
  )!;
  assert.equal(p.label, "Starting");
});

test("pending with no schedule is Starting", () => {
  const p = presentRun(run({ status: "pending" }), { now: NOW })!;
  assert.equal(p.label, "Starting");
  assert.equal(p.detail, "Queuing recipients.");
  assert.deepEqual(p.actions, ["cancel"]);
});

test("running reports progress and offers pause + cancel", () => {
  const p = presentRun(run({ status: "running", sent_count: 12, total_recipients: 300 }))!;
  assert.equal(p.label, "Sending");
  assert.equal(p.tone, "active");
  assert.equal(p.detail, "12 of 300 messages sent.");
  assert.deepEqual(p.actions, ["pause", "cancel"]);
  assert.equal(p.showProgress, true);
});

test("paused holds the queue and offers resume + cancel", () => {
  const p = presentRun(run({ status: "paused" }))!;
  assert.equal(p.label, "Paused");
  assert.equal(p.tone, "paused");
  assert.match(p.detail!, /Resume picks up where it stopped/);
  assert.deepEqual(p.actions, ["resume", "cancel"]);
});

test("completed reports the delivered total and offers nothing", () => {
  const p = presentRun(run({ status: "completed", sent_count: 300, total_recipients: 300 }))!;
  assert.equal(p.label, "Sent");
  assert.equal(p.tone, "success");
  assert.equal(p.detail, "300 of 300 messages delivered.");
  assert.deepEqual(p.actions, []);
});

// ── The three cancel reasons must stay distinguishable ───────────────────────

test("user_cancelled says you did it", () => {
  const p = presentRun(run({ status: "cancelled", cancel_reason: "user_cancelled" }))!;
  assert.equal(p.label, "Cancelled");
  assert.equal(p.tone, "neutral");
  assert.match(p.detail!, /You cancelled this/);
});

test("expired says it timed out before sending", () => {
  const p = presentRun(run({ status: "cancelled", cancel_reason: "expired" }))!;
  assert.equal(p.label, "Expired");
  assert.equal(p.tone, "warning");
  assert.match(p.detail!, /24 hours/);
});

test("enqueue_stalled says it never started, and is not called Cancelled", () => {
  const p = presentRun(run({ status: "cancelled", cancel_reason: "enqueue_stalled" }))!;
  assert.equal(p.label, "Never started");
  assert.equal(p.tone, "danger");
  assert.match(p.detail!, /Re-run it/);
  assert.equal(p.showProgress, false);
});

test("the three cancel reasons produce three distinct labels and tones", () => {
  const labels = new Set<string>();
  const tones = new Set<string>();
  for (const reason of ["user_cancelled", "expired", "enqueue_stalled"] as const) {
    const p = presentRun(run({ status: "cancelled", cancel_reason: reason }))!;
    labels.add(p.label);
    tones.add(p.tone);
  }
  assert.equal(labels.size, 3, "cancel reasons must not collapse to one label");
  assert.equal(tones.size, 3, "cancel reasons must not collapse to one tone");
});

test("a cancelled run with an unknown reason degrades to the user-cancelled wording", () => {
  const p = presentRun(run({ status: "cancelled", cancel_reason: null }))!;
  assert.equal(p.label, "Cancelled");
});

// ── pause_reason seam (column does not exist yet) ────────────────────────────

test("without a pause reason, a pause is presented as a user pause", () => {
  const p = presentRun(run({ status: "paused" }), { pauseReason: null })!;
  assert.equal(p.label, "Paused");
  assert.equal(p.tone, "paused");
});

test("sms_not_configured pauses name the cause and the fix", () => {
  const p = presentRun(run({ status: "paused" }), { pauseReason: "sms_not_configured" })!;
  assert.equal(p.label, "Paused — SMS not set up");
  assert.equal(p.tone, "warning");
  assert.match(p.detail!, /Settings/);
  assert.deepEqual(p.actions, ["resume", "cancel"], "still resumable once configured");
});

// ── actions are a function of state only ─────────────────────────────────────

test("terminal states offer no actions", () => {
  for (const r of [
    run({ status: "completed" }),
    run({ status: "cancelled", cancel_reason: "user_cancelled" }),
    run({ status: "cancelled", cancel_reason: "expired" }),
    run({ status: "cancelled", cancel_reason: "enqueue_stalled" }),
  ]) {
    assert.deepEqual(presentRun(r)!.actions, [], `${r.status}/${r.cancel_reason} should be terminal`);
  }
});

test("pause and resume are never both offered", () => {
  for (const status of ["pending", "running", "paused", "completed", "cancelled"] as const) {
    const p = presentRun(run({ status, cancel_reason: status === "cancelled" ? "user_cancelled" : null }))!;
    const both = p.actions.includes("pause") && p.actions.includes("resume");
    assert.equal(both, false, `${status} offered both pause and resume`);
  }
});

// ── singular/plural ──────────────────────────────────────────────────────────

test("a single recipient reads as one message, not 1 messages", () => {
  const p = presentRun(run({ status: "running", sent_count: 0, total_recipients: 1 }))!;
  assert.equal(p.detail, "0 of 1 message sent.");
});

// ── isRunActive gates polling ────────────────────────────────────────────────

test("isRunActive is true only while state can still change on its own", () => {
  assert.equal(isRunActive(run({ status: "pending" })), true);
  assert.equal(isRunActive(run({ status: "running" })), true);
  assert.equal(isRunActive(run({ status: "paused" })), true);
  assert.equal(isRunActive(run({ status: "completed" })), false);
  assert.equal(isRunActive(run({ status: "cancelled" })), false);
  assert.equal(isRunActive(null), false);
});

// ── time formatting ──────────────────────────────────────────────────────────

test("an invalid timestamp does not throw", () => {
  assert.equal(formatInOrgTime("not-a-date", "America/New_York"), "an unknown time");
});

test("an invalid IANA zone falls back to the viewer's zone rather than throwing", () => {
  const out = formatInOrgTime("2026-08-04T13:00:00Z", "Not/AZone");
  assert.ok(out.length > 0);
  assert.ok(!out.includes("Not/AZone"));
});

test("org timezone actually shifts the rendered hour", () => {
  const ny = formatInOrgTime("2026-08-04T13:00:00Z", "America/New_York");
  const la = formatInOrgTime("2026-08-04T13:00:00Z", "America/Los_Angeles");
  assert.notEqual(ny, la, "same instant must render differently in different zones");
});
