/**
 * Post-build guard: no URL may appear twice in the service worker precache manifest.
 *
 * WHY THIS EXISTS
 * vite-plugin-pwa injects precache entries from multiple sources: manifest.icons,
 * includeAssets, and workbox.globPatterns. If the same file is matched by more
 * than one source, Workbox receives two entries with different revision hashes
 * and throws `add-to-cache-list-conflicting-entries`, which kills the service
 * worker install. The app then has no offline support and no update prompts.
 *
 * This script reads the generated sw.js after `vite build` and extracts every
 * URL from the precache manifest call. If any URL appears more than once, it
 * exits non-zero with a clear message.
 *
 * Run: node scripts/check-precache-duplicates.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const distDir = join(process.cwd(), 'dist');
const swPath = join(distDir, 'sw.js');

if (!existsSync(swPath)) {
  console.error('check-precache-duplicates: dist/sw.js not found — run `npm run build` first.');
  process.exit(1);
}

const sw = readFileSync(swPath, 'utf-8');

// Workbox precache manifest is an array of {url, revision} objects passed to
// precacheAndRoute(). Extract every `url:"..."` value from the minified JS.
const urlPattern = /\burl\s*:\s*"([^"]+)"/g;
const urls = [];
let match;
while ((match = urlPattern.exec(sw)) !== null) {
  urls.push(match[1]);
}

if (urls.length === 0) {
  console.error('check-precache-duplicates: found 0 precache URLs in sw.js — parsing may be broken.');
  process.exit(1);
}

const seen = new Map();
const duplicates = [];
for (const url of urls) {
  if (seen.has(url)) {
    duplicates.push(url);
  }
  seen.set(url, (seen.get(url) || 0) + 1);
}

if (duplicates.length > 0) {
  console.error('check-precache-duplicates: FAIL — duplicate URLs in precache manifest:');
  for (const url of [...new Set(duplicates)]) {
    console.error(`  ${url} (${seen.get(url)} entries)`);
  }
  console.error(
    '\nThis will crash the service worker with add-to-cache-list-conflicting-entries.',
    '\nCheck vite.config.ts: manifest.icons, includeAssets, and workbox.globPatterns must not overlap.',
  );
  process.exit(1);
}

console.log(`check-precache-duplicates: OK — ${urls.length} unique precache entries, no duplicates.`);
