import { useState } from 'react';
import { X, Sparkles, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { usePlatform } from '@/hooks/usePlatform';

export function TrialBanner() {
  const { isTrialing, trialExpired, trialDaysRemaining, isActive } = useSubscription();
  const { isNative, billingUrl } = usePlatform();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!isTrialing && !trialExpired) return null;

  const handleUpgrade = () => {
    if (isNative) {
      window.open(billingUrl, '_blank');
    } else {
      navigate('/dashboard/subscription');
    }
  };

  if (trialExpired) {
    return (
      <div className="bg-destructive text-destructive-foreground text-sm py-2.5 px-4 flex items-center justify-center gap-2 relative">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>Your trial has ended. </span>
        <button onClick={handleUpgrade} className="underline font-semibold cursor-pointer">
          Upgrade now
        </button>
        <span> to continue using TidyWise.</span>
        <button onClick={() => setDismissed(true)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 cursor-pointer" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-primary text-primary-foreground text-sm py-2.5 px-4 flex items-center justify-center gap-2 relative">
      <Sparkles className="h-4 w-4 flex-shrink-0" />
      <span>🎉 You're on a free trial — {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} remaining.</span>
      <button onClick={handleUpgrade} className="underline font-semibold cursor-pointer">
        Upgrade now
      </button>
      <span> to keep access after your trial ends.</span>
      <button onClick={() => setDismissed(true)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 cursor-pointer" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
