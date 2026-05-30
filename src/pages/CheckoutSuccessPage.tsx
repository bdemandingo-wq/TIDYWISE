/**
 * Post-Stripe-Checkout confirmation landing page.
 *
 * Why this page exists:
 *   Stripe Checkout's success_url is a one-shot redirect with no UI
 *   control. Dropping users directly on /dashboard makes "Back to plans"
 *   awkward (the dashboard has its own chrome). This dedicated route
 *   gives a clear confirmation, a "Back to plans" link to /pricing, and
 *   a primary CTA into the dashboard.
 *
 * Side effects on mount:
 *   - Clears `tw_pending_plan` from sessionStorage. The user finished
 *     checkout; we don't want /pricing to re-highlight a tier they
 *     already bought next time they visit.
 *   - Re-runs `checkSubscription()` so the in-app subscription state
 *     reflects the just-completed purchase immediately, without waiting
 *     for the next periodic refresh. The Stripe invoice webhook is the
 *     authoritative source of truth, but it may race the redirect; a
 *     short retry loop here closes that gap so the dashboard never
 *     shows stale "no plan" UI right after success.
 *
 * Accessibility:
 *   - The confirmation message is wrapped in an `aria-live="polite"`
 *     region so screen readers announce the success state on arrival.
 *   - All decorative icons are `aria-hidden`.
 */

import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle2, ArrowLeft, LayoutDashboard } from 'lucide-react';

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
  custom: 'Custom',
  lifetime: 'Lifetime',
};

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkSubscription } = useAuth();
  const plan = searchParams.get('plan') ?? '';
  const interval = searchParams.get('interval');
  const planLabel = PLAN_LABELS[plan] ?? null;
  const intervalLabel = interval === 'yearly' ? 'yearly' : interval === 'monthly' ? 'monthly' : null;

  useEffect(() => {
    // Persisted "pending" plan choice exists only to bring users back to
    // the same tier if they cancel/return mid-flow. Checkout completed → clear.
    try {
      sessionStorage.removeItem('tw_pending_plan');
    } catch {
      /* no-op */
    }

    // Persist the "active" plan metadata so the dashboard banner can
    // render plan + interval immediately after webhook completion,
    // without needing extra fields on the subscription endpoint.
    if (plan || interval) {
      try {
        localStorage.setItem(
          'tw_active_plan',
          JSON.stringify({ plan: plan || null, interval: interval || null }),
        );
      } catch {
        /* no-op */
      }
    }

    // Stripe's success redirect can race the invoice webhook by a
    // second or two. Poll a few times so the dashboard's subscription
    // gate updates without a manual refresh.
    let cancelled = false;
    const delays = [0, 1500, 4000, 8000];
    delays.forEach((ms) => {
      window.setTimeout(() => {
        if (cancelled) return;
        checkSubscription().catch(() => {
          /* network errors are non-fatal; periodic check covers it */
        });
      }, ms);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headingId = 'checkout-success-heading';

  return (
    <>
      <SEOHead
        title="You're in! | TidyWise"
        description="Your TidyWise subscription is active. Jump into the dashboard or browse plans."
        canonical="/checkout/success"
        noIndex
      />
      <main
        className="min-h-screen bg-background flex items-center justify-center p-4"
        aria-labelledby={headingId}
      >
        <Card
          className="w-full max-w-md p-8 text-center"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-5 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center"
          >
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>

          <h1 id={headingId} className="font-serif text-3xl mb-2">You're in.</h1>
          <p className="text-muted-foreground mb-6">
            {planLabel
              ? `Welcome to TidyWise ${planLabel}${
                  intervalLabel ? ` (${intervalLabel})` : ''
                }. Your subscription is active${
                  intervalLabel === 'yearly'
                    ? ' — a receipt with your next billing date is on its way to your inbox.'
                    : ' and a receipt has been emailed to you.'
                }`
              : 'Your TidyWise subscription is active. Welcome aboard.'}
          </p>

          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onClick={() => navigate('/dashboard')}
              aria-label="Go to your dashboard"
            >
              <LayoutDashboard aria-hidden="true" className="h-4 w-4 mr-2" />
              Go to dashboard
            </Button>

            <Button
              asChild
              variant="ghost"
              size="lg"
              className="w-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Link to="/pricing" aria-label="Back to pricing plans">
                <ArrowLeft aria-hidden="true" className="h-4 w-4 mr-2" />
                Back to plans
              </Link>
            </Button>
          </div>
        </Card>
      </main>
    </>
  );
}
