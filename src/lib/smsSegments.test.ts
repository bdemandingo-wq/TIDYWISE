import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSms, describeCulprit } from './smsSegments.ts';

test('a plain short message is one GSM-7 segment', () => {
  const r = analyzeSms('Hi Bo, see you at 9am.');
  assert.equal(r.encoding, 'GSM-7');
  assert.equal(r.segments, 1);
  assert.equal(r.culprit, null);
});

test('161 GSM characters split into two segments', () => {
  const r = analyzeSms('a'.repeat(161));
  assert.equal(r.segments, 2);
});

test('exactly 160 GSM characters stay at one', () => {
  assert.equal(analyzeSms('a'.repeat(160)).segments, 1);
});

test('one curly apostrophe drops the whole message to UCS-2', () => {
  const r = analyzeSms('a'.repeat(80) + '\u2019');
  assert.equal(r.encoding, 'UCS-2');
  assert.ok(r.segments > 1);
  assert.equal(r.culprit, '\u2019');
  assert.match(describeCulprit(r.culprit!), /curly apostrophe/);
});

test('GSM extended characters cost two units each', () => {
  assert.equal(analyzeSms('{').units, 2);
  assert.equal(analyzeSms('a'.repeat(159) + '{').segments, 2);
});

test('an emoji is named as the culprit', () => {
  const r = analyzeSms('Hi 🎉');
  assert.equal(r.encoding, 'UCS-2');
  assert.match(describeCulprit(r.culprit!), /emoji/);
});

test('empty body is zero segments, not one', () => {
  assert.equal(analyzeSms('').segments, 0);
});
