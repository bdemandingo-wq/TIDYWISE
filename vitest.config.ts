import { defineConfig } from 'vitest/config';
import path from 'path';

/*
 * NOT YET RUNNABLE ON THIS MACHINE — 2026-07-30.
 *
 * vitest is not installed and could not be: every uncached npm metadata request
 * on this network takes ~79s (three ETIMEDOUT retries, then a slow 200), and
 * vitest 2's optional peer graph (@vitest/browser, playwright, webdriverio,
 * @edge-runtime/vm) means dozens of them. --prefer-offline still failed on
 * @vitest/expect.
 *
 * To finish, on any working network:
 *
 *     npm install --save-dev vitest@^2.1.9
 *     npm pkg set scripts.test="vitest run" scripts.test:watch="vitest"
 *     npm test
 *
 * The `test` scripts are deliberately NOT committed yet: a "vitest run" script
 * with no declared dependency fails confusingly, and hand-adding the dependency
 * without a matching package-lock.json entry would desync the lockfile and break
 * `npm ci` — and Lovable's publish install command is unknown, so that is not a
 * risk worth taking for a test-runner convenience.
 *
 * 2.1.9 is the real latest 2.x (verified against the registry packument);
 * current latest overall is 4.x, which wants a newer Vite than this repo's 5.4.
 *
 * Both existing specs DO pass — verified 2026-07-30 by executing the real spec
 * files through tsx against a minimal describe/it/expect shim, rewriting only
 * their import lines so every assertion stayed byte-identical:
 *   src/lib/wageCalculation.test.ts  29/29
 *   src/lib/loyaltyTier.test.ts      18/18
 * So the wage logic is sound; this was only ever a missing-runner problem.
 */

/**
 * Vitest config — standalone, deliberately NOT merged into vite.config.ts.
 *
 * vite.config.ts loads lovable-tagger, vite-plugin-image-optimizer, and a
 * sitemap plugin that shells out via execSync on buildEnd. None of that is
 * wanted in a unit-test run: it is slower, and it couples `npm test` to the
 * build toolchain for no benefit. The only thing the tests need from Vite is
 * the `@` path alias.
 *
 * Scope is `src/**\/*.test.ts` only. The Playwright suites (e2e/ and tests/)
 * have their own runners and configs — vitest must not pick their specs up, or
 * it will try to execute browser tests in a node environment.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Matches tsconfig.app.json's paths and vite.config.ts's resolve.alias.
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Both current specs are pure logic (wage maths, loyalty tier maths) with no
    // DOM access, so node is correct and avoids pulling in jsdom.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // e2e/ and tests/ are Playwright — see playwright.config.ts and
    // playwright.qa.config.ts. Excluding them explicitly rather than relying on
    // the include pattern, so adding a src-adjacent helper cannot pull them in.
    exclude: ['node_modules', 'dist', 'e2e', 'tests', 'ios', 'playwright-report', 'qa-report'],
  },
});
