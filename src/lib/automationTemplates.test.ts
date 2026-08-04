import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTemplate, resolveTemplate, tokensIn,
  AUTOMATION_DEFAULTS, AUTOMATION_VOCABULARY,
} from './automationTemplates.ts';

const KEY = 'quote_stale_reengage';
const DATA = {
  customer_name: 'Sam',
  service_name: 'deep clean',
  company_name: 'Golden Room Cleaning',
  quote_link: 'https://x.co/q/1',
};

// ─── the five fallback cases from the plan ───────────────────────────────
test('1. no row at all falls back to the default, never to silence', () => {
  for (const body of [null, undefined]) {
    const r = resolveTemplate(KEY, body, DATA);
    assert.equal(r.usedDefault, true);
    assert.match(r.text, /just checking in on your deep clean quote/);
    assert.ok(r.text.length > 0);
  }
});

test('2 & 3. empty and whitespace-only fall back to the default', () => {
  for (const body of ['', '   ', '\n\t  \n']) {
    const r = resolveTemplate(KEY, body, DATA);
    assert.equal(r.usedDefault, true, JSON.stringify(body));
    assert.match(r.text, /Golden Room Cleaning/);
  }
});

test('4. unknown token has its braces stripped, message still sends', () => {
  const r = resolveTemplate(KEY, 'Hi {firstname}, see {quote_link}', DATA);
  assert.equal(r.usedDefault, false);
  assert.equal(r.text, 'Hi firstname, see https://x.co/q/1');
  assert.doesNotMatch(r.text, /[{}]/);
  assert.match(r.warning ?? '', /unknown token/);
});

test('5. missing the required token uses the default instead', () => {
  const r = resolveTemplate(KEY, 'Hi {customer_name}, still interested?', DATA);
  assert.equal(r.usedDefault, true);
  assert.match(r.text, /https:\/\/x\.co\/q\/1/);
  assert.match(r.warning ?? '', /missing required \{quote_link\}/);
});

test('a good template is used as written', () => {
  const r = resolveTemplate(KEY, 'Yo {customer_name} — {quote_link}', DATA);
  assert.equal(r.text, 'Yo Sam — https://x.co/q/1');
  assert.equal(r.usedDefault, false);
  assert.equal(r.warning, null);
});

test('never sends blank, even when every token resolves empty', () => {
  const r = resolveTemplate(KEY, '{customer_name} {quote_link}', {});
  assert.ok(r.text.trim().length > 0);
  assert.equal(r.usedDefault, true);
});

test('missing data for a known token blanks that token, keeps the rest', () => {
  const r = resolveTemplate(KEY, 'Hi {customer_name}! {quote_link}', { quote_link: 'L' });
  assert.equal(r.text, 'Hi ! L');
});

test('token matching is case-insensitive but data lookup is lowercase', () => {
  const r = resolveTemplate(KEY, '{Customer_Name} {QUOTE_LINK}', DATA);
  assert.equal(r.text, 'Sam https://x.co/q/1');
});

// ─── save-time validation ────────────────────────────────────────────────
test('validation names the offending token rather than saying "invalid"', () => {
  const err = validateTemplate(KEY, 'Hi {firstname} {quote_link}');
  assert.match(err ?? '', /\{firstname\}/);
  assert.match(err ?? '', /\{customer_name\}/); // lists what IS available
});

test('validation blocks a template with no quote link', () => {
  assert.match(validateTemplate(KEY, 'Hi {customer_name}') ?? '', /\{quote_link\}/);
});

test('validation blocks empty and explains how to reset', () => {
  assert.match(validateTemplate(KEY, '   ') ?? '', /default/i);
});

test('a valid template passes', () => {
  assert.equal(validateTemplate(KEY, 'Hi {customer_name} — {quote_link}'), null);
});

// ─── the defaults themselves ─────────────────────────────────────────────
test('every default is itself valid under its own vocabulary', () => {
  for (const key of Object.keys(AUTOMATION_DEFAULTS) as (keyof typeof AUTOMATION_DEFAULTS)[]) {
    assert.equal(validateTemplate(key, AUTOMATION_DEFAULTS[key].sms_body), null, key);
  }
});

test('the default uses only declared tokens', () => {
  const allowed = new Set(AUTOMATION_VOCABULARY[KEY].map(t => t.token));
  for (const t of tokensIn(AUTOMATION_DEFAULTS[KEY].sms_body)) {
    assert.ok(allowed.has(t), `default uses undeclared {${t}}`);
  }
});

test('the pilot is classed marketing — this is what adds the STOP line', () => {
  assert.equal(AUTOMATION_DEFAULTS[KEY].message_class, 'marketing');
});

test('the default body carries no STOP line — the sender appends it', () => {
  assert.doesNotMatch(AUTOMATION_DEFAULTS[KEY].sms_body, /\bSTOP\b/);
});

// ─── booking reminder keys ───────────────────────────────────────────────
const RDATA = {
  customer_name: 'Bo',
  service_name: 'deep clean',
  company_name: 'Golden Room',
  date: 'Thursday',
  time: '9:00 AM',
  address_line: 'Address: 12 Elm St.',
};

for (const key of ['booking_confirmation', 'reminder_advance', 'reminder_soon'] as const) {
  test(`${key}: a mistyped placeholder is rejected at save time`, () => {
    const err = validateTemplate(key, 'Hi {custmerName}! See you at {time}');
    assert.match(err ?? "", /\{custmername\}/i);
    assert.match(err ?? '', /\{customer_name\}/);
  });

  test(`${key}: a mistyped placeholder that got saved anyway never ships braces`, () => {
    const r = resolveTemplate(key, 'Hi {custmerName}! See you at {time}', RDATA);
    assert.equal(r.text, 'Hi custmerName! See you at 9:00 AM');
    assert.doesNotMatch(r.text, /[{}]/);
    assert.match(r.warning ?? '', /unknown token/);
  });

  test(`${key}: a message with no time falls back to the default`, () => {
    const r = resolveTemplate(key, 'Hi {customer_name}, see you soon', RDATA);
    assert.equal(r.usedDefault, true);
    assert.match(r.text, /9:00 AM/);
  });

  test(`${key}: a blank address leaves no double space`, () => {
    const r = resolveTemplate(key, null, { ...RDATA, address_line: '' });
    assert.doesNotMatch(r.text, /  /);
    assert.ok(r.text.length > 0);
  });

  test(`${key}: transactional, so the sender adds no STOP line`, () => {
    assert.equal(AUTOMATION_DEFAULTS[key].message_class, 'transactional');
    assert.doesNotMatch(AUTOMATION_DEFAULTS[key].sms_body, /\bSTOP\b/);
  });
}
