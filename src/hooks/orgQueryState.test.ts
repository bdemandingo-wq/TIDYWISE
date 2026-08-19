// The one rule this whole wrapper exists to enforce: a failure is never empty.
//
//   node --experimental-strip-types --test src/hooks/orgQueryState.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveOrgQueryState } from './orgQueryState.ts';

const base = { enabled: true, isLoading: false, error: null as unknown, data: undefined as number[] | undefined };

test('genuinely empty is the ONLY state that reports isEmpty', () => {
  const ready = deriveOrgQueryState({ ...base, data: [] });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.isEmpty, true);
});

test('a failure is NOT empty — this is the whole point', () => {
  // The old shape rendered "No members yet" here, for an org with five members.
  const failed = deriveOrgQueryState({ ...base, error: new Error('permission denied') });
  assert.equal(failed.status, 'error');
  assert.equal(failed.isEmpty, false, 'a failed load must never present as empty');
  assert.equal(failed.rows.length, 0, 'rows is still safe to map over');
  assert.equal(failed.error?.message, 'permission denied');
});

test('loading is NOT empty', () => {
  const loading = deriveOrgQueryState({ ...base, isLoading: true });
  assert.equal(loading.status, 'loading');
  assert.equal(loading.isEmpty, false);
});

test('not-yet-runnable is NOT empty, and is distinct from loading', () => {
  // No session or no organization. Nothing was asked for, so no spinner is owed
  // and certainly no "you have no data" claim.
  const off = deriveOrgQueryState({ ...base, enabled: false, data: [] });
  assert.equal(off.status, 'disabled');
  assert.equal(off.isEmpty, false);
  assert.equal(off.isLoading, false, 'disabled must not masquerade as loading');
});

test('settled-but-undefined counts as loading, not as empty', () => {
  // A refetch can leave isLoading false while data has not arrived. Treating
  // that as ready flashes "no results" between renders.
  const between = deriveOrgQueryState({ ...base, isLoading: false, data: undefined });
  assert.equal(between.status, 'loading');
  assert.equal(between.isEmpty, false);
});

test('error wins over loading — a failed refetch is not a pending one', () => {
  const both = deriveOrgQueryState({ ...base, isLoading: true, error: new Error('boom') });
  assert.equal(both.status, 'error');
  assert.equal(both.isEmpty, false);
});

test('disabled wins over everything — nothing ran, so nothing is claimed', () => {
  const off = deriveOrgQueryState({ enabled: false, isLoading: true, error: new Error('x'), data: [] });
  assert.equal(off.status, 'disabled');
  assert.equal(off.error, null, 'a stale error from a previous org must not leak into a disabled state');
});

test('a non-Error rejection is still surfaced as an Error', () => {
  // supabase-js and PostgREST both reject with plain objects in places.
  const odd = deriveOrgQueryState({ ...base, error: { code: '42501' } });
  assert.equal(odd.status, 'error');
  assert.ok(odd.error instanceof Error);
  assert.match(odd.error!.message, /42501/);
});

test('CONTROL: rows.length === 0 is true in three states, isEmpty in one', () => {
  // The assertion that documents why isEmpty had to exist at all. If this ever
  // fails, the distinction has been flattened and the original bug is back.
  const states = [
    deriveOrgQueryState({ ...base, data: [] }),
    deriveOrgQueryState({ ...base, error: new Error('x') }),
    deriveOrgQueryState({ ...base, isLoading: true }),
    deriveOrgQueryState({ ...base, enabled: false }),
  ];
  assert.equal(states.filter((s) => s.rows.length === 0).length, 4, 'all four look empty by length');
  assert.equal(states.filter((s) => s.isEmpty).length, 1, 'only one IS empty');
});
