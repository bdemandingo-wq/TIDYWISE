/**
 * Active-subscription banner shown at the top of the dashboard.
 *
 * Renders only when the user has an active subscription. Plan + interval
 * are persisted to localStorage by the CheckoutSuccessPage right after
 * the Stripe redirect (and refreshed whenever `check-subscription` runs),
 * so the banner updates immediately after the invoice webhook completes
 * without waiting for a full page refresh.
 *
 * Accessibility:
 *   - Wrapped in `role="status"` + `aria-live="polite"` so screen readers
 *     announce "Your <Plan> plan is active. Next billing date: …" the
 *     moment the subscription state flips to active.
 *   - "Download receipt" is a proper <button> with an accessible name
 *     including the plan + interval.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle2, Download } from 'lucide-react';
import { toast } from 'sonner';

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
  custom: 'Custom',
  lifetime: 'Lifetime',
};

interface ActivePlanMeta {
  plan?: string;
  interval?: 'monthly' | 'yearly' | string;
}

function readActivePlanMeta(): ActivePlanMeta {
  try {
    const raw = localStorage.getItem('tw_active_plan');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      plan: typeof parsed?.plan === 'string' ? parsed.plan : undefined,
      interval: typeof parsed?.interval === 'string' ? parsed.interval : undefined,
    };
  } catch {
    return {};
  }
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function SubscriptionBanner() {
  const { subscription, user } = useAuth();
  const [meta, setMeta] = useState<ActivePlanMeta>(() => readActivePlanMeta());

  // Re-read localStorage when the subscription state flips (e.g. after the
  // CheckoutSuccessPage polls `check-subscription` and the webhook lands).
  useEffect(() => {
    setMeta(readActivePlanMeta());
  }, [subscription?.subscribed, subscription?.subscription_end]);

  const nextBillingDate = formatDate(subscription?.subscription_end);
  const planLabel = meta.plan ? PLAN_LABELS[meta.plan] ?? null : null;
  const intervalLabel =
    meta.interval === 'yearly' ? 'Yearly' : meta.interval === 'monthly' ? 'Monthly' : null;

  const srAnnouncement = useMemo(() => {
    if (!subscription?.subscribed) return '';
    const parts: string[] = [];
    if (planLabel) parts.push(`Your ${planLabel}${intervalLabel ? ` (${intervalLabel})` : ''} plan is active.`);
    else parts.push('Your subscription is active.');
    if (nextBillingDate) parts.push(`Next billing date: ${nextBillingDate}.`);
    return parts.join(' ');
  }, [subscription?.subscribed, planLabel, intervalLabel, nextBillingDate]);

  if (!subscription?.subscribed) return null;

  const handleDownloadReceipt = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const left = 56;
      let y = 80;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('TidyWise — Subscription Receipt', left, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      y += 28;
      doc.text(`Issued: ${new Date().toLocaleDateString()}`, left, y);

      y += 32;
      doc.setFont('helvetica', 'bold');
      doc.text('Account', left, y);
      doc.setFont('helvetica', 'normal');
      y += 16;
      doc.text(`Email: ${user?.email ?? 'N/A'}`, left, y);

      y += 32;
      doc.setFont('helvetica', 'bold');
      doc.text('Subscription', left, y);
      doc.setFont('helvetica', 'normal');
      y += 16;
      doc.text(`Plan: ${planLabel ?? 'Active subscription'}`, left, y);
      y += 16;
      doc.text(`Billing interval: ${intervalLabel ?? 'Recurring'}`, left, y);
      y += 16;
      doc.text(`Next billing date: ${nextBillingDate ?? 'See your inbox for confirmation'}`, left, y);

      y += 40;
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(
        'This is a summary receipt. Your official tax invoice is emailed from Stripe.',
        left,
        y,
      );

      const filename = `tidywise-receipt-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Failed to generate receipt PDF', err);
      toast.error('Could not generate receipt. Please try again.');
    }
  };

  const receiptLabel = `Download receipt for ${planLabel ?? 'your'} plan${
    intervalLabel ? `, billed ${intervalLabel.toLowerCase()}` : ''
  }${nextBillingDate ? `, next billing ${nextBillingDate}` : ''}`;

  return (
    <section
      data-testid="subscription-banner"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
    >
      <div className="flex items-start gap-3 flex-1">
        <div
          aria-hidden="true"
          className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"
        >
          <CheckCircle2 className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground">
            {planLabel ? `${planLabel} plan active` : 'Subscription active'}
            {intervalLabel ? ` · ${intervalLabel}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">
            {nextBillingDate
              ? `Next billing date: ${nextBillingDate}`
              : 'Your subscription is active.'}
          </p>
          {/* Screen-reader-only single-shot announcement, kept identical
              to the visible content so the live region narrates the full
              state when the subscription flips active. */}
          <span className="sr-only" data-testid="subscription-banner-sr">
            {srAnnouncement}
          </span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDownloadReceipt}
        aria-label={receiptLabel}
        data-testid="download-receipt"
        className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Download aria-hidden="true" className="h-4 w-4 mr-2" />
        Download receipt
      </Button>
    </section>
  );
}

export default SubscriptionBanner;
