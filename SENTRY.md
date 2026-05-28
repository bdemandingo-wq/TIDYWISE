# Sentry observability

Sentry is wired into the app but **disabled by default** — Sentry SDK is
installed and initialized but does nothing until `VITE_SENTRY_DSN` is set.

## Turning it on

1. **Sign up** at https://sentry.io/signup. Free tier covers 5k errors,
   10k performance events, and 50 replays per month — comfortable headroom
   for current traffic.
2. **Create a project**: pick **React** when asked for framework.
3. **Copy the DSN** that Sentry hands you. It looks like
   `https://abc123@o456789.ingest.sentry.io/1234567`.
4. **Set the env var** in Lovable (project settings → Environment
   Variables):
   - `VITE_SENTRY_DSN` = the DSN from step 3
   - `VITE_SENTRY_ENVIRONMENT` = `production`
5. **Rebuild & deploy**. Errors start flowing within a minute.

Optional: also add `VITE_APP_VERSION` (e.g. a git short SHA from your
build pipeline) so Sentry can group errors by release.

## What you get once it's on

| Dashboard tab | What's there |
| --- | --- |
| Issues | Stack traces, frequency, users affected, first/last seen |
| Performance | Slow page loads, slow Supabase calls, slow renders |
| Replays | DOM recordings of the 30s before an error |
| Alerts | Slack/email when a new issue spikes |

## What we send (and don't)

- **PII protection**: replay integration is configured with
  `maskAllText`, `maskAllInputs`, `blockAllMedia`. Customer names,
  addresses, payment amounts, and images are masked in the recording.
- **Filtered noise**: chunk-load errors (handled by the auto-reload
  recovery in `main.tsx`) and `ResizeObserver` warnings are dropped
  before being sent — see `src/lib/sentry.ts` `ignoreErrors`.
- **Native crashes**: when the app is running inside the Capacitor iOS
  shell, `@sentry/capacitor` also reports Swift-side crashes, not just
  the JavaScript ones.

## Verifying it's working

Once the DSN is set, run this in any page's dev tools console:

```js
window.Sentry?.captureException(new Error("sentry test"));
```

You should see the event in your Sentry dashboard within ~30 seconds.

## Where things live

- `src/lib/sentry.ts` — init function, called from `main.tsx`
- `src/main.tsx` — `<Sentry.ErrorBoundary>` wraps the app root and
  shows a fallback UI when render crashes
- `package.json` — `@sentry/react` (web) and `@sentry/capacitor` (iOS)
