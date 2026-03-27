import { Lock, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '@/hooks/usePlatform';
import {
  SubscriptionTier, TIER_PRICES, FEATURE_LABELS, Feature,
} from '@/hooks/useSubscription';

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  requiredTier: SubscriptionTier;
  currentTier: SubscriptionTier;
  upgradeFeatures?: string[];
}

const DEFAULT_FEATURES: Record<SubscriptionTier, string[]> = {
  starter: [],
  pro: ['AI-powered business insights', 'Unlimited bookings per month', 'Up to 15 staff members'],
  business: ['Custom branding & white-label', 'API access for integrations', 'Dedicated account manager'],
};

export function UpgradeModal({
  open, onOpenChange, featureName, requiredTier, currentTier, upgradeFeatures,
}: UpgradeModalProps) {
  const navigate = useNavigate();
  const { isNative } = usePlatform();
  const features = upgradeFeatures || DEFAULT_FEATURES[requiredTier];
  const price = TIER_PRICES[requiredTier].monthly;
  const tierLabel = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);

  const handleUpgrade = () => {
    onOpenChange(false);
    if (isNative) {
      window.open('https://jointidywise.lovable.app/dashboard/subscription', '_blank');
    } else {
      navigate('/dashboard/subscription');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold">Unlock {featureName}</DialogTitle>
          <DialogDescription>
            This feature is available on the <strong className="text-foreground">{tierLabel}</strong> plan and above.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-4">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Button onClick={handleUpgrade} className="w-full" size="lg">
            <Sparkles className="mr-2 h-4 w-4" />
            Upgrade to {tierLabel} — ${price}/mo
          </Button>
          <button
            onClick={() => { onOpenChange(false); navigate('/dashboard/subscription'); }}
            className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            View all plan features
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Inline locked overlay for feature sections */
export function FeatureLockedOverlay({
  featureName, requiredTier, currentTier, onUpgrade,
}: {
  featureName: string;
  requiredTier: SubscriptionTier;
  currentTier: SubscriptionTier;
  onUpgrade: () => void;
}) {
  const tierLabel = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);
  return (
    <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 p-6">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Lock className="h-6 w-6 text-primary" />
      </div>
      <p className="text-sm font-semibold text-foreground text-center">{featureName}</p>
      <p className="text-xs text-muted-foreground text-center">
        Available on the {tierLabel} plan and above
      </p>
      <Button size="sm" onClick={onUpgrade}>
        Upgrade to {tierLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
