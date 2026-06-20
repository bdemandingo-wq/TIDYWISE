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
import { CheckCircle2, ArrowLeft, LayoutDashboard, Mail } from 'lucide-react';

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
  custom: 'Custom',
  lifetime: 'Lifetime',
};

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, checkSubscription, subscription } = useAuth();
  const plan = searchParams.get('plan') ?? '';
  const interval = searchParams.get('interval');
  const planLabel = PLAN_LABELS[plan] ?? null;
  const intervalLabel = interval === 'yearly' ? 'yearly' : interval === 'monthly' ? 'monthly' : null;
  // During the 7-day free trial Stripe does NOT generate a paid invoice
  // yet, so we must not claim a receipt was emailed.
  const isTrial = subscription?.trial_active === true;
  // Anonymous-checkout: the visitor paid without logging in. The webhook
  // emailed them a Supabase invite link to set their password. Until
  // they click that link and authenticate, useAuth().user is null and
  // we show "check your email" copy instead of the "go to dashboard"
  // CTA. The from_invite=1 marker is set on the Supabase invite link's
  // redirectTo URL — by the time they land here from THAT, their
  // session is live and `user` is truthy.
  const isAnonymousCheckout = !user;

  // Mount-only side effects: clear pending-plan, write active-plan,
  // set the post-checkout grace flag so useAuth's checkSubscription
  // doesn't pop the paywall dialog while the webhook catches up.
  useEffect(() => {
    try {
      sessionStorage.removeItem('tw_pending_plan');
      // 30-second grace window. useAuth.checkSubscription reads this
      // flag and suppresses the subscription dialog during it. Cleared
      // automatically once the function sees `subscribed: true`.
      sessionStorage.setItem('tw_post_checkout', '1');
    } catch {
      /* no-op */
    }

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
    // Belt-and-suspenders: drop the grace flag after 120s no matter
    // what, so a stuck state can't permanently hide the paywall. The
    // window is intentionally long enough to cover Stripe webhook
    // delivery + our retry storms (lifetime purchases especially need
    // time for the webhook to flip plan_type → 'lifetime').
    const graceTimer = window.setTimeout(() => {
      try { sessionStorage.removeItem('tw_post_checkout'); } catch { /* no-op */ }
    }, 120000);
    return () => window.clearTimeout(graceTimer);
  }, [plan, interval]);

  // Polling loop — re-fires whenever the auth state changes. When the
  // visitor arrives from the Supabase invite email, `user` is null at
  // first paint (Supabase is processing the magic-link hash) and
  // becomes truthy ~50ms later. Old behavior (deps:[]) ran the poll
  // ONCE on mount and never again — user got stuck on "Check your
  // email" forever. Extended schedule covers slow webhook delivery
  // (some Stripe events arrive 20-40s after the redirect).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const delays = [0, 1500, 4000, 8000, 15000, 30000, 60000, 90000];
    const timers = delays.map((ms) =>
      window.setTimeout(() => {
        if (cancelled) return;
        checkSubscription().catch(() => {
          /* network errors are non-fatal; periodic check covers it */
        });
      }, ms),
    );
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

          <h1 id={headingId} className="font-serif text-3xl mb-2">
            {isAnonymousCheckout ? 'Payment confirmed.' : "You're in."}
          </h1>
          <p className="text-muted-foreground mb-6">
            {isAnonymousCheckout
              ? planLabel
                ? `Welcome to TidyWise ${planLabel}${
                    intervalLabel ? ` (${intervalLabel})` : ''
                  }. We just emailed you a link to set your password and access your account.`
                : "Your TidyWise subscription is active. We just emailed you a link to set your password."
              : planLabel
                ? `Welcome to TidyWise ${planLabel}${
                    intervalLabel ? ` (${intervalLabel})` : ''
                  }. ${
                    isTrial
                      ? `Your 7-day free trial is active — you won't be charged until it ends${
                          intervalLabel ? `, then billing starts ${intervalLabel}.` : '.'
                        } We'll email a receipt the moment your first payment is processed.`
                      : intervalLabel === 'yearly'
                        ? 'Your subscription is active — a receipt with your next billing date is on its way to your inbox.'
                        : 'Your subscription is active and a receipt has been emailed to you.'
                  }`
                : 'Your TidyWise subscription is active. Welcome aboard.'}
          </p>

          {isAnonymousCheckout && (
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-4 mb-6 flex items-start gap-3 text-left">
              <Mail aria-hidden="true" className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium mb-0.5">Check your email</p>
                <p className="text-muted-foreground">
                  Look for "Welcome to TidyWise — set your password". Can't find
                  it? Check spam or use the link below once your account is ready.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {isAnonymousCheckout ? (
              <>
                <Button
                  asChild
                  size="lg"
                  className="w-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <Link to="/login" aria-label="I already set my password">
                    I already set my password
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Need help?{' '}
                  <a
                    href="mailto:support@tidywisecleaning.com"
                    className="underline hover:text-foreground"
                  >
                    support@tidywisecleaning.com
                  </a>
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </Card>
      </main>
    </>
  );
}
