import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePlanState, retryPlanState } from '@/hooks/usePlanFeature';

/**
 * Says out loud that we could not work out which plan this org is on.
 *
 * `usePlanState` used to answer a failed lookup by staying in `loading`
 * forever. That never resolves, so nothing rendered an error and nobody could
 * report it — the app just quietly behaved as though every paid feature were
 * unavailable while looking completely normal.
 *
 * The gates deliberately keep passing children through in this state (see
 * PlanFeatureGate), so nothing is locked. This banner exists so the degraded
 * state is visible rather than silent. It is the only thing that distinguishes
 * "your plan is loading" from "we cannot tell what your plan is".
 */
export function PlanStateBanner() {
  const { error } = usePlanState();
  const [retrying, setRetrying] = useState(false);

  if (!error) return null;

  const onRetry = () => {
    setRetrying(true);
    retryPlanState();
    // usePlanState flips back to loading, which unmounts this. The timeout only
    // matters if it fails again immediately — without it the button would stay
    // spinning on the re-rendered banner.
    setTimeout(() => setRetrying(false), 2000);
  };

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">We couldn&apos;t check which plan you&apos;re on</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Everything is still available — we just can&apos;t confirm your plan right now,
            so some screens may look different to usual. Your subscription and your data
            are not affected.
          </p>
          <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
