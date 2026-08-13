/**
 * Single source for the shared test-account credentials.
 *
 * WHY THIS FILE EXISTS. The owner password used to be hardcoded in six separate
 * files. When it was rotated, both Playwright suites silently stopped running
 * anything authenticated — 7 of 14 QA specs and 5 of 7 e2e specs — and nobody
 * noticed for about a month, because the QA runner reports blocked specs as
 * "did not run" rather than as failures. Among the specs that went dark was
 * cross-org-isolation.spec.ts, the one written specifically to catch
 * multi-tenant data leaks. Full write-up:
 * docs/superpowers/plans/2026-08-13-dead-test-credentials.md
 *
 * Values come from `.env.test` in the repo root, which is gitignored. Start by
 * copying the committed template:
 *
 *     cp .env.test.example .env.test
 *
 * A real environment variable always wins over the file, so CI can inject
 * credentials without one existing.
 *
 * THE FIELDS ARE GETTERS, DELIBERATELY. Reading a missing credential throws
 * immediately and loudly — no skipping, because skipping is precisely how the
 * previous breakage hid. But merely *importing* this module must not throw: the
 * anon-key specs import the same fixtures file and have to keep running with no
 * credentials configured at all. Lazy access gives both properties.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILE = ".env.test";
const DOC = "docs/superpowers/plans/2026-08-13-dead-test-credentials.md";

/**
 * Minimal KEY=VALUE parser. Deliberately dependency-free — `dotenv` is not
 * installed, and the npm registry is not always reachable from this
 * environment, so adding a dependency would be a worse failure mode than
 * twenty lines of parsing.
 *
 * Playwright runs from the repo root (both configs live there), so cwd is the
 * right base.
 */
function loadEnvFile(): void {
  const path = resolve(process.cwd(), ENV_FILE);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // A real env var wins, so CI needs no file.
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set, so this test cannot authenticate.\n\n` +
        `Fix:\n` +
        `    cp ${ENV_FILE}.example ${ENV_FILE}\n` +
        `then fill in the values. ${ENV_FILE} is gitignored.\n\n` +
        `Do NOT hardcode the credential back into the spec. It was duplicated ` +
        `across six files, and that is exactly why a password rotation ` +
        `disabled both test suites for a month without anyone noticing. See ` +
        `${DOC}.`,
    );
  }
  return value;
}

export interface TestAccount {
  readonly email: string;
  readonly password: string;
}

/** Org A owner — admin dashboard, most authenticated specs. */
export const QA_OWNER: TestAccount = {
  get email() {
    return required("QA_OWNER_EMAIL");
  },
  get password() {
    return required("QA_OWNER_PASSWORD");
  },
};

/** Org B staff — the other side of every cross-org isolation assertion. */
export const QA_STAFF: TestAccount = {
  get email() {
    return required("QA_STAFF_EMAIL");
  },
  get password() {
    return required("QA_STAFF_PASSWORD");
  },
};

/** Client-portal customer in Org B. */
export const QA_CLIENT: TestAccount = {
  get email() {
    return required("QA_CLIENT_EMAIL");
  },
  get password() {
    return required("QA_CLIENT_PASSWORD");
  },
};
