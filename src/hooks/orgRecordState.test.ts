// A failed single-row read is not an absent record.
//   node --experimental-strip-types --test src/hooks/orgRecordState.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveOrgRecordState } from './orgRecordState.ts';

const base = { enabled: true, isLoading: false, error: null as unknown, data: undefined as { v: number } | null | undefined };

test('a row present is ready and not missing', () => {
  const s = deriveOrgRecordState({ ...base, data: { v: 1 } });
  assert.equal(s.status, 'ready');
  assert.deepEqual(s.row, { v: 1 });
  assert.equal(s.isMissing, false);
});

test('resolved with no row IS missing — the only case that is', () => {
  const s = deriveOrgRecordState({ ...base, data: null });
  assert.equal(s.status, 'ready');
  assert.equal(s.row, null);
  assert.equal(s.isMissing, true);
});

test('a FAILED read is not missing — this is the payroll bug', () => {
  // PayrollPage:222 did `if (error) return null`, so a failed settings read
  // became "no setting" and fell back to a default week start. On that page a
  // silently wrong pay week is money.
  const s = deriveOrgRecordState({ ...base, error: new Error('permission denied') });
  assert.equal(s.status, 'error');
  assert.equal(s.isMissing, false, 'a failure must never justify a default');
  assert.equal(s.row, null);
  assert.equal(s.error?.message, 'permission denied');
});

test('loading is not missing', () => {
  const s = deriveOrgRecordState({ ...base, isLoading: true });
  assert.equal(s.status, 'loading');
  assert.equal(s.isMissing, false);
});

test('not-yet-runnable is not missing, and not loading either', () => {
  const s = deriveOrgRecordState({ ...base, enabled: false, data: null });
  assert.equal(s.status, 'disabled');
  assert.equal(s.isMissing, false);
  assert.equal(s.isLoading, false);
});

test('undefined means unresolved, null means resolved-and-absent', () => {
  // The distinction the whole hook rests on. maybeSingle() returns null for a
  // genuine miss; undefined only ever means the query has not settled.
  assert.equal(deriveOrgRecordState({ ...base, data: undefined }).status, 'loading');
  assert.equal(deriveOrgRecordState({ ...base, data: null }).isMissing, true);
});

test('error wins over loading, disabled wins over everything', () => {
  assert.equal(deriveOrgRecordState({ ...base, isLoading: true, error: new Error('x') }).status, 'error');
  const off = deriveOrgRecordState({ enabled: false, isLoading: true, error: new Error('x'), data: null });
  assert.equal(off.status, 'disabled');
  assert.equal(off.error, null, 'a stale error must not leak into a disabled state');
});

test('a non-Error rejection keeps its message', () => {
  const s = deriveOrgRecordState({ ...base, error: { code: '42501', message: 'permission denied for table x' } });
  assert.ok(s.error instanceof Error);
  assert.match(s.error!.message, /42501/);
  assert.match(s.error!.message, /permission denied/);
});

test('CONTROL: row === null is true in four states, isMissing in one', () => {
  const states = [
    deriveOrgRecordState({ ...base, data: null }),
    deriveOrgRecordState({ ...base, error: new Error('x') }),
    deriveOrgRecordState({ ...base, isLoading: true }),
    deriveOrgRecordState({ ...base, enabled: false }),
  ];
  assert.equal(states.filter((s) => s.row === null).length, 4, 'all four look absent by row');
  assert.equal(states.filter((s) => s.isMissing).length, 1, 'only one IS absent');
});
