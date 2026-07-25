import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgEmailHealth } from '@/hooks/useOrgEmailHealth';

// Per-mode session dismissal so dismissing "set up email" doesn't suppress a
// later failures warning (and vice versa).
const DISMISS_PREFIX = 'tw_email_banner_dismissed_';

export function EmailIdentityBanner() {
  const { canView, notConfigured, hardFailures } = useOrgEmailHealth();
  const [dismissedModes, setDismissedModes] = useState<Record<string, boolean>>(() => ({
    not_configured: sessionStorage.getItem(DISMISS_PREFIX + 'not_configured') === '1',
    failures: sessionStorage.getItem(DISMISS_PREFIX + 'failures') === '1',
  }));

  // notConfigured wins: a new org with no identity has zero failure rows,
  // so failures alone can't cover it.
  const mode = notConfigured
    ? 'not_configured'
    : hardFailures.length > 0
      ? 'failures'
      : null;

  if (!canView || !mode || dismissedModes[mode]) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_PREFIX + mode, '1');
    setDismissedModes((prev) => ({ ...prev, [mode]: true }));
  };

  const n = hardFailures.length;
  const title = mode === 'not_configured'
    ? 'Your customers aren’t receiving emails'
    : `${n} recent email ${n === 1 ? 'failure' : 'failures'}`;
  const body = mode === 'not_configured'
    ? 'You haven’t set up a sender email yet, so booking confirmations, invoices, and receipts aren’t being delivered.'
    : 'Some customer emails failed to send recently — customers may not be receiving confirmations, invoices, or receipts.';
  const cta = mode === 'not_configured' ? 'Set up email' : 'View email delivery';

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
