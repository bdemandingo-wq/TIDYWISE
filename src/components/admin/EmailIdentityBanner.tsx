import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgEmailHealth } from '@/hooks/useOrgEmailHealth';
import { dominantCause } from '@/lib/emailFailureClassification';

// Per-mode dismissal so dismissing "set up email" doesn't suppress a later
// failures warning (and vice versa). Persisted in localStorage (NOT
// sessionStorage) — a session-scoped dismissal reappeared on every new tab,
// reload in a fresh session, and app relaunch, which read as "it won't go away".
// The failures dismissal is stamped with the newest failure timestamp we knew
// about, so the banner stays hidden until a genuinely NEW failure occurs.
const DISMISS_PREFIX = 'tw_email_banner_dismissed_';

export function EmailIdentityBanner() {
  const { canView, notConfigured, hardFailures } = useOrgEmailHealth();
  const [dismissed, setDismissed] = useState<Record<string, string | null>>(() => ({
    not_configured: localStorage.getItem(DISMISS_PREFIX + 'not_configured'),
    failures: localStorage.getItem(DISMISS_PREFIX + 'failures'),
  }));

  // notConfigured wins: a new org with no identity has zero failure rows,
  // so failures alone can't cover it.
  const mode = notConfigured
    ? 'not_configured'
    : hardFailures.length > 0
      ? 'failures'
      : null;

  // hardFailures is ordered newest-first by the hook.
  const latestFailureAt = hardFailures[0]?.created_at ?? '';

  const isDismissed =
    mode === 'not_configured'
      ? dismissed.not_configured === '1'
      : mode === 'failures'
        ? !!dismissed.failures && dismissed.failures >= latestFailureAt
        : false;

  if (!canView || !mode || isDismissed) return null;

  const dismiss = () => {
    const value = mode === 'not_configured' ? '1' : latestFailureAt || new Date().toISOString();
    localStorage.setItem(DISMISS_PREFIX + mode, value);
    setDismissed((prev) => ({ ...prev, [mode]: value }));
  };

  const n = hardFailures.length;

  // Name the fix when every failure has the same cause. A remedy that names
  // the WRONG fix is worse than a bare count: the owner changes a setting that
  // was not the problem, it does not help, and they stop believing the banner.
  const cause = mode === 'failures' ? dominantCause(hardFailures) : null;
  const plural = n === 1 ? 'email' : 'emails';

  const title = mode === 'not_configured'
    ? "Your customers aren't receiving emails"
    : cause === 'invalid_key'
      ? 'Your saved email API key is no longer valid'
      : cause === 'unverified_domain'
        ? "Your sending domain isn't verified"
        : cause === 'gmail_auth'
          ? 'Your Gmail connection has stopped working'
          : `${n} recent email ${n === 1 ? 'failure' : 'failures'}`;

  const body = mode === 'not_configured'
    ? "You haven't set up a sender email yet, so booking confirmations, invoices, and receipts aren't being delivered."
    : cause === 'invalid_key'
      ? `The Resend API key saved in your email settings is being rejected, so ${n} customer ${plural} did not send. Replace the key to start sending again.`
      : cause === 'unverified_domain'
        ? `Your sending domain has not been verified with your email provider, so ${n} customer ${plural} did not send. Verify the domain, or switch to a sender address on a domain you have already verified.`
        : cause === 'gmail_auth'
          ? `Gmail is rejecting the saved app password, so ${n} customer ${plural} did not send. Reconnect Gmail, or switch to sending through Resend.`
          : 'Some customer emails failed to send recently. Customers may not be receiving confirmations, invoices, or receipts.';

  const cta = mode === 'not_configured'
    ? 'Set up email'
    : cause
      ? 'Fix email settings'
      : 'View email delivery';

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{title}</p>
        <p className="text-sm text-amber-800/90 dark:text-amber-100/80">{body}</p>
        <Button asChild size="sm" variant="outline" className="mt-2 h-8">
          <Link to="/dashboard/settings?tab=emails">{cta}</Link>
        </Button>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 rounded p-1 text-amber-700/70 hover:bg-amber-500/10 hover:text-amber-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
