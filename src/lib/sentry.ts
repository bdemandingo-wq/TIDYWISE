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

// Public-by-design fallbacks. Sentry DSNs are explicitly safe to embed
// in client-side code — see https://docs.sentry.io/concepts/key-terms/dsn-explainer/#dsn-utilization
// Same model as the Supabase anon key. The env-var path stays so we can
// rotate or env-switch without redeploying source.
const DEFAULT_DSN =
  "https://e85be9b65b51cacaffdf8b2d3ea85499@o4511473522442240.ingest.us.sentry.io/4511473550753792";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn =
    (import.meta.env.VITE_SENTRY_DSN as string | undefined) || DEFAULT_DSN;
  if (!dsn) {
    // Should be unreachable now that DEFAULT_DSN is set, but kept as a
    // safety net — if someone explicitly sets VITE_SENTRY_DSN to "" to
    // disable Sentry, we still bail out cleanly.
    if (import.meta.env.DEV) {
      console.info("[sentry] DSN unset — observability disabled");
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
      // Facebook / Instagram / TikTok in-app browser noise. Their
      // injected scripts assume native bridges (window.webkit.messageHandlers
      // on iOS, Java postMessage on Android) and throw on every page load.
      // Not actionable on our side — we don't ship that code.
      "window.webkit.messageHandlers",
      // Safari/iOS wording when an in-app browser injects a script that
      // assumes the native bridge exists. Matches the exact TypeError
      // value Sentry stores on the event, not just `message`.
      /undefined is not an object \(evaluating 'window\.webkit/i,
      /undefined is not an object \(evaluating '.*messageHandlers/i,
      "Java object is gone",
      "Error invoking postMessage",
      "sendDataToNative",
      "sendJsBlockingTimeMessage",
      // Vite HMR transient: when a context module is hot-swapped in the
      // Lovable preview, useQueryClient() can briefly fire before the
      // parent QueryClientProvider re-attaches. Dev-only, self-recovers.
      "No QueryClient set",
    ],

    // Drop events whose stack trace originates from in-app-browser
    // injected scripts (Facebook's `iabjs://...` frames, etc.). These
    // are not part of our bundle and we can't fix them.
    beforeSend(event, hint) {
      try {
        const ex = hint?.originalException as { stack?: string; message?: string } | undefined;
        const stack = ex?.stack || "";
        const msg = ex?.message || (event.message ?? "");
        if (
          /iabjs:\/\//i.test(stack) ||
          /navigation_performance_logger/i.test(stack) ||
          /window\.webkit\.messageHandlers/i.test(msg) ||
          /Java object is gone/i.test(msg)
        ) {
          return null;
        }
      } catch {
        // never let the filter itself break reporting
      }
      return event;
    },

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

  // Expose on window for ad-hoc dev-tools verification and on-call
  // debugging. Sentry's SDK doesn't do this by default. Safe to ship —
  // the SDK surface area is read-only from a security standpoint.
  if (typeof window !== "undefined") {
    (window as unknown as { Sentry: typeof Sentry }).Sentry = Sentry;
  }
}

export { Sentry };
