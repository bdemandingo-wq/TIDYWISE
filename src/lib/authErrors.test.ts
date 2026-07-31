import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInvalidSessionError } from './authErrors.ts';

// The whole point of this classifier is that it errs towards KEEPING a
// session, so most of these assert `false`.

test('offline / unreachable auth server keeps the session', () => {
  assert.equal(isInvalidSessionError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), false);
  assert.equal(isInvalidSessionError({ message: 'Failed to fetch' }), false);
  assert.equal(isInvalidSessionError({ message: 'NetworkError when attempting to fetch resource.' }), false);
  assert.equal(isInvalidSessionError({ message: 'Load failed' }), false);
});

test('server faults and rate limits keep the session', () => {
  assert.equal(isInvalidSessionError({ status: 500, message: 'Internal Server Error' }), false);
  assert.equal(isInvalidSessionError({ status: 502, message: 'Bad Gateway' }), false);
  assert.equal(isInvalidSessionError({ status: 503, message: 'Service Unavailable' }), false);
  assert.equal(isInvalidSessionError({ status: 429, message: 'Too Many Requests' }), false);
});

test('a 5xx that also carries an invalid-session code still keeps the session', () => {
  // Status wins: if the server is broken we cannot trust its reason.
  assert.equal(isInvalidSessionError({ status: 500, code: 'session_not_found' }), false);
});

test('a rejected JWT ends the session', () => {
  assert.equal(isInvalidSessionError({ status: 401, message: 'Invalid JWT' }), true);
  assert.equal(isInvalidSessionError({ status: 403, message: 'forbidden' }), true);
});

test('explicit session codes end the session', () => {
  for (const code of ['session_not_found', 'session_expired', 'refresh_token_not_found',
                      'refresh_token_already_used', 'bad_jwt', 'user_not_found', 'user_banned']) {
    assert.equal(isInvalidSessionError({ code }), true, code);
  }
});

test('legacy message-only forms end the session', () => {
  assert.equal(isInvalidSessionError({ message: 'Auth session missing!' }), true);
  assert.equal(isInvalidSessionError({ message: 'JWT expired' }), true);
});

test('unrecognised and malformed input keeps the session', () => {
  assert.equal(isInvalidSessionError(null), false);
  assert.equal(isInvalidSessionError(undefined), false);
  assert.equal(isInvalidSessionError('some string'), false);
  assert.equal(isInvalidSessionError({}), false);
  assert.equal(isInvalidSessionError({ status: 418, message: 'teapot' }), false);
  assert.equal(isInvalidSessionError({ message: 'something we have never seen' }), false);
});
