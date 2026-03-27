import { useState, ReactNode } from "react";
import { useSubscription, Feature, FEATURE_REQUIRED_TIER } from "@/hooks/useSubscription";
import { UpgradeModal, FeatureLockedOverlay } from "./UpgradeModal";

interface SubscriptionGateProps {
  children: ReactNode;
  /** Either a typed Feature key for enforcement, or a plain string label (no enforcement). */
  feature?: string;
}

const isFeatureKey = (f: string): f is Feature => f in FEATURE_REQUIRED_TIER;

export function SubscriptionGate({ children, feature }: SubscriptionGateProps) {
  const { tier, needsUpgrade, requiredTierForFeature } = useSubscription();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // If no specific feature or not a known gated feature, allow through
  if (!feature || !isFeatureKey(feature)) return <>{children}</>;

  const requiredTier = requiredTierForFeature(feature);

  if (!needsUpgrade(requiredTier)) {
    return <>{children}</>;
  }

  const label = feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="relative">
      {children}
      <FeatureLockedOverlay
        featureName={label}
        requiredTier={requiredTier}
        currentTier={tier}
        onUpgrade={() => setUpgradeOpen(true)}
      />
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        featureName={label}
        requiredTier={requiredTier}
        currentTier={tier}
      />
    </div>
  );
}

export function useSubscriptionCheck() {
  const { tier, needsUpgrade, requiredTierForFeature } = useSubscription();

  const requireSubscription = (callback: () => void, _feature?: string) => {
    callback();
  };

  return { requireSubscription, isSubscribed: true, tier, needsUpgrade };
}
