import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRetryAfter, rateLimitMessage } from './rateLimitMessage.ts';

test('short waits round up to a minute rather than "0 minutes"', () => {
  assert.equal(formatRetryAfter(1), 'about a minute');
  assert.equal(formatRetryAfter(60), 'about a minute');
  assert.equal(formatRetryAfter(90), 'about a minute');
});

test('minutes round up, so we never under-promise', () => {
  assert.equal(formatRetryAfter(91), 'about 2 minutes');
  assert.equal(formatRetryAfter(300), 'about 5 minutes');
  assert.equal(formatRetryAfter(3599), 'about 60 minutes');
});

test('hours', () => {
  assert.equal(formatRetryAfter(3600), 'about an hour');
  assert.equal(formatRetryAfter(7200), 'about 2 hours');
});

test('numeric strings work — JSON bodies are not always typed', () => {
  assert.equal(formatRetryAfter('300'), 'about 5 minutes');
});

test('missing or nonsense values fall back rather than render garbage', () => {
  for (const v of [undefined, null, 0, -5, NaN, 'soon', {}, []]) {
    assert.equal(formatRetryAfter(v), null, String(v));
  }
  assert.match(rateLimitMessage(undefined), /a few minutes/);
});

test('the message never blames the password and never says to retry now', () => {
  const m = rateLimitMessage(300);
  assert.match(m, /about 5 minutes/);
  assert.match(m, /not a problem with your password/);
  assert.doesNotMatch(m, /invalid/i);
  assert.doesNotMatch(m, /contact the business/i);
});
