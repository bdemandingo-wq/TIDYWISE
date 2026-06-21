import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Lock, Sparkles, Zap } from "lucide-react";
import { usePlanState } from "@/hooks/usePlanFeature";
import {
  UpgradePlanDialog,
  DowngradePlanDialog,
  type PlanInfo,
} from "./PlanChangeDialogs";
import { useAuth } from "@/hooks/useAuth";

const PLANS: PlanInfo[] = [
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: 49,
    features: [
      "Online booking system",
      "Unlimited customers + CRM",
      "Smart team scheduler",
      "Estimates, invoices, Stripe payments",
      "Recurring bookings + jobs",
      "Staff management",
      "In-app messaging",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 97,
    features: [
      "Everything in Basic",
      "Automations (reviews, reminders, win-back, promos)",
      "Email marketing campaigns",
      "AI Intelligence + Copilot",
      "Advanced reports + benchmarks",
      "GPS tracking + operations dashboard",
      "Payroll for cleaners",
      "Inventory + expenses",
      "Client portal",
      "Data import",
      "Lead pipeline",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    monthlyPrice: 197,
    features: [
      "Everything in Pro",
      "1 done-for-you request per month",
      "Build me a website + connect to TidyWise",
      "Set up my SMS + email marketing",
      "Import my customers from another CRM",
      "Scripts & documents pack",
      "Priority support",
    ],
  },
];

const RANK: Record<string, number> = { basic: 1, pro: 2, custom: 3, lifetime: 99 };
const ICONS = { basic: Sparkles, pro: Zap, custom: Crown } as const;

export function PlanSwitcher() {
  const planState = usePlanState();
  const { subscription, checkSubscription } = useAuth();
  const [upgradeTarget, setUpgradeTarget] = useState<PlanInfo | null>(null);
  const [downgradeTarget, setDowngradeTarget] = useState<PlanInfo | null>(null);

  const currentPlanId = planState.planType;
  const isLifetime =
    currentPlanId === "lifetime" || planState.grandfathered;

  const currentPlan = useMemo(
    () => PLANS.find((p) => p.id === currentPlanId) ?? null,
    [currentPlanId],
  );

  function action(plan: PlanInfo) {
    const targetRank = RANK[plan.id] ?? 0;
    const curRank = RANK[currentPlanId] ?? 0;
    if (targetRank > curRank) setUpgradeTarget(plan);
    else if (targetRank < curRank) setDowngradeTarget(plan);
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Plan</h3>
          <p className="text-sm text-muted-foreground">
            {isLifetime ? (
              <span className="inline-flex items-center gap-1">
                <Crown className="h-3.5 w-3.5 text-amber-500" /> Lifetime — locked in forever
              </span>
            ) : (
              <>You're on the <span className="font-medium text-foreground capitalize">{currentPlanId}</span> plan.</>
            )}
          </p>
        </div>
        {isLifetime && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" /> Locked
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const Icon = ICONS[plan.id];
          const isCurrent = plan.id === currentPlanId;
          const targetRank = RANK[plan.id] ?? 0;
          const curRank = RANK[currentPlanId] ?? 0;
          const isUpgrade = targetRank > curRank;
          const isDowngrade = targetRank < curRank;

          return (
            <div
              key={plan.id}
              className={`relative rounded-lg border p-4 ${
                isCurrent ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              {isCurrent && (
                <Badge className="absolute -top-2 right-3" variant="default">
                  Current
                </Badge>
              )}
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{plan.name}</span>
              </div>
              <div className="mb-3">
                <span className="text-2xl font-bold">${plan.monthlyPrice}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <ul className="mb-4 space-y-1.5 text-xs text-muted-foreground">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isLifetime ? (
                <Button variant="outline" size="sm" disabled className="w-full">
                  <Lock className="mr-1 h-3 w-3" /> Locked
                </Button>
              ) : isCurrent ? (
                <Button variant="outline" size="sm" disabled className="w-full">
                  Current plan
                </Button>
              ) : !subscription?.subscribed ? (
                <Button variant="outline" size="sm" disabled className="w-full">
                  No active subscription
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={isUpgrade ? "default" : "outline"}
                  className="w-full"
                  onClick={() => action(plan)}
                >
                  {isUpgrade ? `Upgrade to ${plan.name}` : `Downgrade to ${plan.name}`}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <UpgradePlanDialog
        open={!!upgradeTarget}
        onOpenChange={(o) => !o && setUpgradeTarget(null)}
        targetPlan={upgradeTarget}
        onCompleted={() => checkSubscription()}
      />
      <DowngradePlanDialog
        open={!!downgradeTarget}
        onOpenChange={(o) => !o && setDowngradeTarget(null)}
        targetPlan={downgradeTarget}
        currentPlan={currentPlan}
        periodEnd={subscription?.subscription_end ?? null}
        onCompleted={() => checkSubscription()}
      />
    </Card>
  );
}
