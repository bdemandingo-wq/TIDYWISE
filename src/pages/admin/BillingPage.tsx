import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, CreditCard, Users, Calendar, Sparkles, ArrowRight, AlertTriangle } from 'lucide-react';
import {
  useSubscription, useStaffCount, useMonthlyBookingCount,
  SubscriptionTier, TIER_PRICES,
} from '@/hooks/useSubscription';
import { UpgradeModal } from '@/components/admin/UpgradeModal';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '@/hooks/usePlatform';
import { format } from 'date-fns';

const TIERS: { tier: SubscriptionTier; name: string; desc: string; features: string[] }[] = [
  {
    tier: 'starter', name: 'Starter', desc: 'Solo operators & part-time cleaners',
    features: ['Up to 3 staff', '50 bookings/month', 'SMS reminders', 'Client portal', 'Basic reports'],
  },
  {
    tier: 'pro', name: 'Pro', desc: 'Growing teams',
    features: ['Up to 15 staff', 'Unlimited bookings', 'Everything in Starter', 'AI insights', 'Revenue reports', 'Custom automations', 'Priority support'],
  },
  {
    tier: 'business', name: 'Business', desc: 'Established companies',
    features: ['Unlimited staff', 'Unlimited bookings', 'Everything in Pro', 'Custom branding', 'API access', 'Dedicated account manager'],
  },
];

export default function BillingPage() {
  const sub = useSubscription();
  const { data: staffCount = 0 } = useStaffCount();
  const { data: bookingCount = 0 } = useMonthlyBookingCount();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeTier, setUpgradeTier] = useState<SubscriptionTier>('pro');
  const navigate = useNavigate();
  const { isNative, billingUrl } = usePlatform();

  const handleUpgrade = (tier: SubscriptionTier) => {
    if (isNative) {
      window.open(billingUrl, '_blank');
    } else {
      setUpgradeTier(tier);
      setUpgradeOpen(true);
    }
  };

  const tierLabel = sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1);
  const statusLabel = sub.status.charAt(0).toUpperCase() + sub.status.slice(1);

  return (
    <AdminLayout title="Billing & Plan">
      <div className="space-y-6 max-w-4xl">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Current Plan
                </CardTitle>
                <CardDescription>Manage your subscription and billing</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={sub.isActive ? 'default' : 'destructive'}>{statusLabel}</Badge>
                {sub.isTrialing && <Badge variant="secondary">Trial</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{tierLabel}</span>
              <span className="text-muted-foreground">
                ${TIER_PRICES[sub.tier][sub.billingCycle as 'monthly' | 'annual']}/mo
                {sub.billingCycle === 'annual' && <span className="text-primary ml-1">(annual)</span>}
              </span>
            </div>

            {sub.isTrialing && sub.trialEndsAt && (
              <div className={`flex items-center gap-2 text-sm ${sub.trialExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
                {sub.trialExpired ? <AlertTriangle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                {sub.trialExpired
                  ? 'Trial expired'
                  : `Trial ends ${format(sub.trialEndsAt, 'MMM d, yyyy')} (${sub.trialDaysRemaining} days remaining)`
                }
              </div>
            )}

            {/* Usage */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Users className="h-4 w-4" /> Staff members
                </div>
                <p className="text-lg font-semibold">
                  {staffCount} / {sub.limits.maxStaff === -1 ? '∞' : sub.limits.maxStaff}
                </p>
                {sub.limits.maxStaff !== -1 && (
                  <Progress value={(staffCount / sub.limits.maxStaff) * 100} className="mt-2 h-1.5" />
                )}
              </div>
              <div className="bg-muted/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Calendar className="h-4 w-4" /> Bookings this month
                </div>
                <p className="text-lg font-semibold">
                  {bookingCount} / {sub.limits.maxBookingsPerMonth === -1 ? '∞' : sub.limits.maxBookingsPerMonth}
                </p>
                {sub.limits.maxBookingsPerMonth !== -1 && (
                  <Progress value={(bookingCount / sub.limits.maxBookingsPerMonth) * 100} className="mt-2 h-1.5" />
                )}
              </div>
            </div>

            {sub.tier !== 'business' && (
              <Button onClick={() => handleUpgrade(sub.tier === 'starter' ? 'pro' : 'business')}>
                <Sparkles className="mr-2 h-4 w-4" /> Upgrade Plan
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Plan Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Compare Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {TIERS.map((t) => {
                const isCurrent = t.tier === sub.tier;
                const price = TIER_PRICES[t.tier].monthly;
                return (
                  <div key={t.tier}
                    className={`rounded-2xl border p-6 transition-all ${
                      isCurrent ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-lg">{t.name}</h3>
                      {isCurrent && <Badge>Current</Badge>}
                    </div>
                    <p className="text-muted-foreground text-sm mb-4">{t.desc}</p>
                    <p className="text-2xl font-bold mb-4">${price}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                    <ul className="space-y-2 mb-6">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /> {f}
                        </li>
                      ))}
                    </ul>
                    {!isCurrent && !sub.needsUpgrade(t.tier) ? null : !isCurrent ? (
                      <Button onClick={() => handleUpgrade(t.tier)} className="w-full" variant={t.tier === 'pro' ? 'default' : 'outline'}>
                        Upgrade <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        featureName={`${upgradeTier.charAt(0).toUpperCase() + upgradeTier.slice(1)} Plan`}
        requiredTier={upgradeTier}
        currentTier={sub.tier}
      />
    </AdminLayout>
  );
}
