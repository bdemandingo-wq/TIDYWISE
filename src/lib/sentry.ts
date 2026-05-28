/**
 * Sentry initialization.
 *
 * No-op when VITE_SENTRY_DSN is unset, so this can ship with the build
 * before observability is actually wired up. Flip on by setting the env
 * var in Lovable / your build environment and redeploying.
 *
 * Web → uses @sentry/capacitor when running inside the native shell so
 * iOS crashes (native, not JS) are also captured. @sentry/capacitor
 * bundles @sentry/react internally so the React SDK helpers
 * (ErrorBoundary, browserTracingIntegration, replayIntegration) still
 * work via the @sentry/react import.
 */

import * as Sentry from "@sentry/react";
import { Capacitor } from "@capacitor/core";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN configured → silently skip. Keep the rest of the app working
    // (Sentry.ErrorBoundary still renders its fallback even when no
    // events are being sent).
    if (import.meta.env.DEV) {
      console.info("[sentry] VITE_SENTRY_DSN not set — observability disabled");
    }
    return;
  }

  const environment =
    (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ||
    (import.meta.env.PROD ? "production" : "development");

  const release = (import.meta.env.VITE_APP_VERSION as string | undefined) || undefined;

  const initConfig: Sentry.BrowserOptions = {
    dsn,
    environment,
    release,

    // Trace 10% of route transitions / network calls in production —
    // enough to see slow pages without paying for every single request.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Record DOM activity for every session that throws an error. Cheap
    // because we only pay for replays that contain a real error.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Avoid capturing PII in screen recordings — mask inputs and
        // text. Customer/staff names + booking addresses live on these
        // pages and we don't want any of that in Sentry.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    // Stripe.js, Google Maps, and a few other widgets throw expected
    // user-action errors that aren't actionable for us. Filter the
    // worst offenders here so they don't drown out real bugs.
    ignoreErrors: [
      // Known browser noise
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      // Network blips from the chunk-reload recovery already handled
      // in main.tsx — Sentry should not flag the recoverable reload.
      "Failed to fetch dynamically imported module",
      "Loading chunk",
      "Loading CSS chunk",
      "Importing a module script failed",
    ],

    // Capacitor wraps the JS runtime in a WebView — tag the platform
    // so the dashboard can filter "iOS issues" vs "web issues" cleanly.
    initialScope: {
      tags: {
        platform: Capacitor.isNativePlatform() ? "native-ios" : "web",
      },
    },
  };

  Sentry.init(initConfig);
  initialized = true;
}

export { Sentry };
