// Run: node --experimental-strip-types --test src/lib/appInstallNudge.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldOfferAppInstall } from './appInstallNudge.ts';

const base = { isWeb: true, standalone: false, dismissed: false };

test('a plain browser tab is exactly who this is for', () => {
  assert.equal(shouldOfferAppInstall(base), true);
});

test('never inside the native shell — they are holding the app', () => {
  assert.equal(shouldOfferAppInstall({ ...base, isWeb: false }), false);
});

test('THE TRAP: an installed PWA reports isWeb true, and must still be silent', () => {
  // Capacitor.getPlatform() returns 'web' in an installed PWA, so isWeb alone
  // would nag the desktop users who already did the thing being asked. If this
  // ever goes green with `standalone` ignored, the banner has regressed.
  assert.equal(shouldOfferAppInstall({ ...base, standalone: true }), false);
});

test('dismissal is honoured on its own, whatever the platform says', () => {
  assert.equal(shouldOfferAppInstall({ ...base, dismissed: true }), false);
});

test('any single disqualifier is enough — they do not need to agree', () => {
  for (const override of [
    { isWeb: false },
    { standalone: true },
    { dismissed: true },
    { isWeb: false, standalone: true },
    { standalone: true, dismissed: true },
    { isWeb: false, standalone: true, dismissed: true },
  ]) {
    assert.equal(
      shouldOfferAppInstall({ ...base, ...override }),
      false,
      `expected no nudge for ${JSON.stringify(override)}`,
    );
  }
});
