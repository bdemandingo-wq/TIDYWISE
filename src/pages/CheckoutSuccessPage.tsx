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
 */

import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SEOHead } from '@/components/SEOHead';
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
  const plan = searchParams.get('plan') ?? '';
  const interval = searchParams.get('interval');
  const planLabel = PLAN_LABELS[plan] ?? null;

  useEffect(() => {
    // Persisted plan choice exists only to bring users back to the same
    // tier if they cancel/return mid-flow. Checkout completed → clear.
    try {
      sessionStorage.removeItem('tw_pending_plan');
    } catch {
      /* no-op */
    }
  }, []);

  return (
    <>
      <SEOHead
        title="You're in! | TidyWise"
        description="Your TidyWise subscription is active. Jump into the dashboard or browse plans."
        canonical="/checkout/success"
        noIndex
      />
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>

          <h1 className="font-serif text-3xl mb-2">You're in.</h1>
          <p className="text-muted-foreground mb-6">
            {planLabel
              ? `Welcome to TidyWise ${planLabel}${
                  interval === 'yearly' ? ' (yearly)' : ''
                }. Your subscription is active.`
              : 'Your TidyWise subscription is active. Welcome aboard.'}
          </p>

          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate('/dashboard')}
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Go to dashboard
            </Button>

            <Button asChild variant="ghost" size="lg" className="w-full">
              <Link to="/pricing">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to plans
              </Link>
            </Button>
          </div>
        </Card>
      </main>
    </>
  );
}
