// The platform-owner gate. Trivial to read, and the exact shape that has
// already bitten once in this feature: a comparison that is accidentally true
// when both sides are absent.
//
// Runner: node:test, same as broadcast-render.test.ts — the module is
// import-free so Node strips the types natively and no bundler is involved:
//
//   node --experimental-strip-types --test src/lib/platformOwner.test.ts
//
// The negative cases are the point. An implementation that returned true for every
// falsy user would pass "the owner is the owner" and nothing else here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlatformOwner, PLATFORM_OWNER_EMAIL } from './platformOwner.ts';

test('the owner account is the owner', () => {
  assert.equal(isPlatformOwner({ email: PLATFORM_OWNER_EMAIL }), true);
});

test('a different signed-in account is not', () => {
  assert.equal(isPlatformOwner({ email: 'owner@somecleaningco.test' }), false);
});

// The four falsy shapes. `undefined === undefined` is true, so a bare
// `user?.email === someUndefinedConstant` would hand a logged-out visitor the
// keys — the same class of bug as comparing two null draft ids and reading it
// as "already tested".
test('no user, null user, missing email and null email are all denied', () => {
  assert.equal(isPlatformOwner(undefined), false);
  assert.equal(isPlatformOwner(null), false);
  assert.equal(isPlatformOwner({}), false);
  assert.equal(isPlatformOwner({ email: null }), false);
});

test('matching is exact — no case folding, no trimming, no subdomain slack', () => {
  assert.equal(isPlatformOwner({ email: PLATFORM_OWNER_EMAIL.toUpperCase() }), false);
  assert.equal(isPlatformOwner({ email: ` ${PLATFORM_OWNER_EMAIL} ` }), false);
  assert.equal(isPlatformOwner({ email: `${PLATFORM_OWNER_EMAIL}.evil.test` }), false);
  assert.equal(isPlatformOwner({ email: `x+${PLATFORM_OWNER_EMAIL}` }), false);
});
