/**
 * TEMPORARY local override of playwright.qa.config.ts.
 *
 * The sandbox's bundled Playwright Chromium cannot start (missing
 * libglib-2.0.so.0), so this points every project at a working system
 * Chromium via executablePath. Nothing else differs from the QA config.
 * Delete this file after the run — it is not part of the suite.
 */
import base from "./playwright.qa.config";

const EXECUTABLE = process.env.QA_CHROMIUM_PATH;

export default {
  ...base,
  projects: (base.projects ?? []).map((p) => ({
    ...p,
    use: {
      ...(p as { use?: Record<string, unknown> }).use,
      launchOptions: { executablePath: EXECUTABLE },
    },
  })),
};
