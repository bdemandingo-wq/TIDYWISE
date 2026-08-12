// Registration and copy tests for the Facebook speed-to-lead SMS.
//
// Runner: node:test, which ACTUALLY RUNS here (unlike the vitest-flavoured
// wageCalculation.test.ts, which has never been runnable — vitest is not
// installed). Node v24 strips TypeScript natively and both template files are
// import-free, so no bundler is involved:
//
//   node --experimental-strip-types --test src/lib/automationTemplates.speedToLead.test.ts
//
// There is no npm script for this. It is ~100x faster than Playwright and is the
// right home for pure template logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATION_DEFAULTS,
  AUTOMATION_VOCABULARY,
  AUTOMATION_ROW_TYPE,
  AUTOMATION_KEYS,
  validateTemplate,
  resolveTemplate,
  tokensIn,
  nonGsmCharacters,
  withStopSentence,
  STOP_SENTENCE,
} from './automationTemplates.ts';

const KEY = 'facebook_lead_speed_to_lead';

const DATA = {
  first_name: 'Ada',
  company_name: 'Clean Collective',
};

// ─── registration ───────────────────────────────────────────────────────────

test('the automation is registered, so the Automation Center renders it', () => {
  // AutomationMessageEditor.tsx:295 filters AUTOMATION_KEYS by group, and
  // AUTOMATION_KEYS is Object.keys(AUTOMATION_DEFAULTS). Being in DEFAULTS is
  // what makes the copy editable — no UI change is needed or wanted.
  assert.ok(AUTOMATION_DEFAULTS[KEY], `${KEY} missing from AUTOMATION_DEFAULTS`);
  assert.ok(AUTOMATION_KEYS.includes(KEY), `${KEY} missing from AUTOMATION_KEYS`);
});

test('it is grouped under Marketing, alongside the other non-customer outreach', () => {
  assert.equal(AUTOMATION_DEFAULTS[KEY].group, 'Marketing');
});

test('it is an SMS', () => {
  assert.equal(AUTOMATION_DEFAULTS[KEY].channel, 'sms');
});

test('message_class is marketing, so the sender appends the STOP line', () => {
  // Same shape as abandoned_booking_recovery: the person handed over their
  // number but is not a customer yet. The opt-out line is appended at send time
  // rather than baked into the body, so an owner rewording cannot drop it.
  assert.equal(AUTOMATION_DEFAULTS[KEY].message_class, 'marketing');
});

test('it owns its own organization_automations row type', () => {
  // Not shared with another automation: the toggle must switch this and only
  // this. (Contrast the three booking reminders, which share
  // appointment_reminder because that is the one thing an owner toggles.)
  assert.equal(AUTOMATION_ROW_TYPE[KEY], KEY);
});

// ─── vocabulary ─────────────────────────────────────────────────────────────

test('the vocabulary is exactly first_name and company_name', () => {
  const tokens = (AUTOMATION_VOCABULARY[KEY] ?? []).map((t) => t.token).sort();
  assert.deepEqual(tokens, ['company_name', 'first_name']);
});

test('it uses first_name, NOT customer_name', () => {
  // customer_name's spec says "the customer's first name" while four of five
  // senders pass a full name. Routing a lead through it would add a sixth
  // interpretation to an already-ambiguous token. See
  // docs/superpowers/plans/2026-08-12-customer-name-token-inconsistency.md
  const tokens = (AUTOMATION_VOCABULARY[KEY] ?? []).map((t) => t.token);
  assert.ok(tokens.includes('first_name'));
  assert.ok(!tokens.includes('customer_name'));
});

test('the shipped default body validates against its own vocabulary', () => {
  assert.equal(validateTemplate(KEY, AUTOMATION_DEFAULTS[KEY].sms_body), null);
});

test('every token in the default body is declared in the vocabulary', () => {
  const allowed = new Set((AUTOMATION_VOCABULARY[KEY] ?? []).map((t) => t.token));
  for (const t of tokensIn(AUTOMATION_DEFAULTS[KEY].sms_body)) {
    assert.ok(allowed.has(t), `default body uses undeclared token {${t}}`);
  }
});

test('the default body does not hardcode one tenant name', () => {
  // The approved copy said "Clean Collective". The default ships to every org,
  // so the tenant name has to come from {company_name}.
  const body = AUTOMATION_DEFAULTS[KEY].sms_body;
  assert.ok(!body.includes('Clean Collective'), 'default body hardcodes a tenant name');
  assert.ok(body.includes('{company_name}'));
});

// ─── resolution ─────────────────────────────────────────────────────────────

test('resolution substitutes both tokens', () => {
  const r = resolveTemplate(KEY, AUTOMATION_DEFAULTS[KEY].sms_body, DATA);
  assert.ok(r.text.startsWith('Hey Ada,'), r.text);
  assert.ok(r.text.includes('Clean Collective'));
  assert.equal(r.warning, null);
});

test('a blank saved body falls back to the default, never to silence', () => {
  for (const body of [null, undefined, '', '   ']) {
    const r = resolveTemplate(KEY, body, DATA);
    assert.equal(r.usedDefault, true);
    assert.ok(r.text.length > 0);
    assert.ok(r.text.includes('Ada'));
  }
});

test('a nameless lead greets "there", never "Facebook"', () => {
  // greetingNameFromLead does the work upstream; this pins the copy's behaviour
  // once it has. A nameless Facebook lead is stored as "Facebook Lead", so a
  // bare `|| 'there'` would pass "Facebook" straight through.
  const r = resolveTemplate(KEY, AUTOMATION_DEFAULTS[KEY].sms_body, {
    ...DATA,
    first_name: 'there',
  });
  assert.ok(r.text.startsWith('Hey there,'), r.text);
  assert.ok(!r.text.includes('Facebook,'), 'greeting leaked the placeholder name');
});

test('an unknown token warns rather than shipping literal braces', () => {
  const r = resolveTemplate(KEY, 'Hey {first_name}, book at {booking_link}', DATA);
  assert.ok(r.warning?.includes('booking_link'), r.warning ?? 'no warning');
  assert.ok(!r.text.includes('{'), 'literal braces reached the message body');
  // Load-bearing: first_name IS in the vocabulary, so it must resolve. Without
  // this line the test passes vacuously while nothing is registered at all —
  // an empty vocabulary makes EVERY token "unknown", so the booking_link
  // warning above fires by accident rather than because the vocabulary
  // correctly excludes it. Same trap as a schema probe that only checks for a
  // missing column and reads a missing table as success.
  assert.ok(r.text.includes('Ada'), 'first_name did not resolve — is the automation registered?');
});

// ─── cost: the em dash is not cosmetic ──────────────────────────────────────

test('the default body is GSM-7 clean, so it bills as 2 segments not 4', () => {
  // One non-GSM character (an em dash) forces the whole message into UCS-2,
  // dropping the per-segment budget from 153 chars to 67. Measured on this copy
  // at 232 chars including the STOP line: 2 segments GSM-7 vs 4 UCS-2 — double
  // the cost of every single send, for a character the recipient cannot
  // distinguish from a hyphen.
  //
  // If the em dash is deliberately reinstated, invert this assertion rather
  // than deleting it, so the 4-segment cost stays a recorded choice.
  const body = withStopSentence(AUTOMATION_DEFAULTS[KEY].sms_body);
  assert.deepEqual(
    nonGsmCharacters(body),
    [],
    'default body contains non-GSM characters and will bill at double rate',
  );
});

test('body plus the appended STOP line stays within 2 GSM-7 segments', () => {
  const body = withStopSentence(
    resolveTemplate(KEY, AUTOMATION_DEFAULTS[KEY].sms_body, DATA).text,
  );
  assert.deepEqual(nonGsmCharacters(body), []);
  // 153 chars per segment once concatenated.
  const segments = body.length <= 160 ? 1 : Math.ceil(body.length / 153);
  assert.ok(segments <= 2, `resolved message is ${body.length} chars = ${segments} segments`);
});

// ─── STOP line handling ─────────────────────────────────────────────────────

test('the default body does not bake in its own STOP line', () => {
  // The sender appends it. Baking it in would double it up, and would let an
  // owner delete the opt-out by rewording the copy.
  assert.ok(!AUTOMATION_DEFAULTS[KEY].sms_body.includes(STOP_SENTENCE));
});

test('appending the STOP line twice does not stack it', () => {
  const once = withStopSentence(AUTOMATION_DEFAULTS[KEY].sms_body);
  assert.equal(withStopSentence(once), once);
});

// ─── the KEEP IN SYNC pair ──────────────────────────────────────────────────

test('the Deno copy registers this automation identically', async () => {
  // src/lib/automationTemplates.ts and
  // supabase/functions/_shared/automation-templates.ts carry KEEP IN SYNC
  // headers and are verbatim copies — enforced, until now, by nothing at all.
  // The frontend copy drives the Automation Center editor; the Deno copy drives
  // validation and resolution at send time. If they disagree about this
  // automation, an owner edits copy the sender will not accept.
  const shared = await import(
    '../../supabase/functions/_shared/automation-templates.ts'
  );

  assert.ok(shared.AUTOMATION_DEFAULTS[KEY], 'Deno copy is missing the automation');
  assert.equal(
    shared.AUTOMATION_DEFAULTS[KEY].sms_body,
    AUTOMATION_DEFAULTS[KEY].sms_body,
    'default body differs between the two copies',
  );
  assert.equal(
    shared.AUTOMATION_DEFAULTS[KEY].message_class,
    AUTOMATION_DEFAULTS[KEY].message_class,
  );
  assert.equal(shared.AUTOMATION_ROW_TYPE[KEY], AUTOMATION_ROW_TYPE[KEY]);
  assert.deepEqual(
    (shared.AUTOMATION_VOCABULARY[KEY] ?? []).map((t: { token: string }) => t.token).sort(),
    (AUTOMATION_VOCABULARY[KEY] ?? []).map((t) => t.token).sort(),
  );
});
