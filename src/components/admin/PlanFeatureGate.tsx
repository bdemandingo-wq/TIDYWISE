/**
 * PlanFeatureGate – tier-aware feature lock.
 *
 * Wrap any Pro/Custom-only block of UI with this. Reads the user's
 * plan via usePlanFeature; if they don't have access, replaces the
 * children with a soft upgrade card that names the exact tier they
 * need and the price. Grandfathered users (anyone active before the
 * pricing launch) always see the children.
 *
 *   <PlanFeatureGate feature="automation_center">
 *     <AutomationsTab />
 *   </PlanFeatureGate>
 */

import { Link } from 'react-router-dom';
import { Lock, Sparkles, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePlanFeature } from '@/hooks/usePlanFeature';
import { planLabel, planPriceLabel, FeatureKey } from '@/lib/features';
import { usePlatform } from '@/hooks/usePlatform';

interface PlanFeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  /** Override the feature name shown in the upgrade card. */
  label?: string;
  /** Short one-liner explaining what this feature is. */
  description?: string;
}

const FEATURE_COPY: Partial<Record<FeatureKey, { label: string; description: string }>> = {
  automation_center: {
    label: 'Automations',
    description: 'Set-and-forget review requests, reminders, win-back campaigns, and seasonal promos that run on your behalf.',
  },
  ai_intelligence: {
    label: 'AI Intelligence',
    description: 'Smart insights about your business: pricing, churn, busy days, and what to do about them.',
  },
  campaigns: {
    label: 'Email Campaigns',
    description: 'Send branded email blasts to your customer list. Drip sequences, promos, win-backs.',
  },
  reports: {
    label: 'Advanced Reports',
    description: 'Revenue by service, cleaner performance, customer lifetime value, and export.',
  },
  benchmarks: {
    label: 'Benchmarks',
    description: 'See how your business stacks up against other cleaning operators in your market.',
  },
  operations_tracker: {
    label: 'Operations Tracker',
    description: 'Real-time view of every job, cleaner location, and customer status.',
  },
  tracking: {
    label: 'GPS Tracking',
    description: 'Track cleaners en route, on the job, and at the next stop.',
  },
  inventory: {
    label: 'Inventory',
    description: 'Track cleaning supplies, set reorder points, log usage by job.',
  },
  expenses: {
    label: 'Expenses',
    description: 'Track every business expense, categorize by job, export at tax time.',
  },
  booking_photos: {
    label: 'Before/After Photos',
    description: 'Cleaners upload job photos. Stored, organized, viewable by customer.',
  },
  client_feedback: {
    label: 'Client Feedback',
    description: 'Collect ratings and reviews after every job. Surface issues before they become disputes.',
  },
  payroll: {
    label: 'Payroll',
    description: 'Calculate cleaner pay automatically. Track hours, tips, deductions. Export to QuickBooks.',
  },
  data_import: {
    label: 'Data Import',
    description: 'Bulk-import customers, bookings, services from CSV or another CRM.',
  },
  client_portal: {
    label: 'Client Portal',
    description: 'Give your customers a self-serve portal to book, pay, and view history.',
  },
  tasks: {
    label: 'Tasks',
    description: 'Assign internal to-dos to cleaners. Track completion. Tie to jobs or customers.',
  },
  leads: {
    label: 'Leads Pipeline',
    description: 'Capture leads, follow up automatically, convert to customers.',
  },
  discounts_advanced: {
    label: 'Advanced Discounts',
    description: 'Time-limited promos, customer-specific discounts, automated loyalty rewards.',
  },
  copilot: {
    label: 'Copilot',
    description: 'Your AI assistant for the cleaning business. Ask anything, get smart suggestions.',
  },
  custom_work_requests: {
    label: 'Done-for-You Requests',
    description: 'One request per month: website build, customer import, scripts pack, or anything custom.',
  },
};

export function PlanFeatureGate({
  feature,
  children,
  label,
  description,
}: PlanFeatureGateProps) {
  const { allowed, loading, error, upgradeTo } = usePlanFeature(feature);
  const { isNative } = usePlatform();

  // While we're still resolving the user's plan, render the children
  // optimistically rather than flashing a lock screen.
  //
  // `error` is treated identically on purpose. If the plan lookup failed we do
  // not know their tier, and showing a paying Custom customer an upgrade wall
  // because an RPC timed out is worse than briefly showing a feature they may
  // not have. PlanStateBanner tells them the tier is unknown; this stays quiet.
  if (loading || error) return <>{children}</>;
  if (allowed) return <>{children}</>;

  const copy = FEATURE_COPY[feature];
  const displayLabel = label ?? copy?.label ?? 'This feature';
  const displayDescription =
    description ??
    copy?.description ??
    'Upgrade your plan to unlock this and more.';
  const targetTier = upgradeTo ?? 'pro';

  return (
    <Card className="border-dashed border-2 border-primary/30">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-5 px-6">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-primary" />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">
            {planLabel(targetTier)} plan
          </p>
          <h3 className="text-2xl font-semibold">{displayLabel}</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {displayDescription}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          {isNative ? (
            <p className="text-sm text-muted-foreground text-center">
              Visit <span className="font-medium text-foreground">jointidywise.com</span> to upgrade your plan and unlock this feature.
            </p>
          ) : (
            <>
              <Button asChild size="lg" className="gap-2">
                <Link to="/dashboard/subscription">
                  <Sparkles className="h-4 w-4" />
                  Upgrade to {planLabel(targetTier)} — {planPriceLabel(targetTier)}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/pricing">See all plans</Link>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
