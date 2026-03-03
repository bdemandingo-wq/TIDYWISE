import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Sparkles, AlertTriangle, ExternalLink } from "lucide-react";
import { usePlatform } from "@/hooks/usePlatform";

interface SubscriptionGateProps {
  children: React.ReactNode;
  feature?: string;
}

export function SubscriptionGate({ children, feature = "this feature" }: SubscriptionGateProps) {
  const { subscription, setShowSubscriptionDialog } = useAuth();
  const { canShowPaymentFlows, billingUrl } = usePlatform();

  // If payment failed, show urgent message
  if (subscription?.payment_failed) {
    // On native: show website link instead of payment dialog
    if (!canShowPaymentFlows) {
      return (
        <Card className="border-destructive border-2">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-full bg-destructive/10 mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Payment Issue</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Please update your payment method at jointidywise.lovable.app to continue using TIDYWISE.
            </p>
            <Button onClick={() => window.open(billingUrl, '_blank')} variant="destructive" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Manage on Web
            </Button>
          </CardContent>
        </Card>
      );
    }
    
    return (
      <Card className="border-destructive border-2">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 rounded-full bg-destructive/10 mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Payment Failed</h3>
          <p className="text-muted-foreground mb-4 max-w-sm">
            {subscription.message || "Your subscription payment has failed. Please update your payment method to continue using TIDYWISE."}
          </p>
          <Button onClick={() => setShowSubscriptionDialog(true)} variant="destructive" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Update Payment Method
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (subscription?.subscribed) {
    return <>{children}</>;
  }

  // Render blurred content with overlay
  const overlay = (
    <div className="relative">
      {/* Blurred content behind */}
      <div className="pointer-events-none select-none" style={{ filter: 'blur(6px)', opacity: 0.5 }} aria-hidden="true">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60 backdrop-blur-sm rounded-lg">
        <div className="flex flex-col items-center text-center px-6 py-10 max-w-md">
          <div className="p-4 rounded-full bg-muted mb-4">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold mb-2">Premium Feature</h3>
          <p className="text-muted-foreground mb-2 text-sm">
            <span className="font-semibold text-foreground">{feature}</span> is available with an active subscription.
          </p>
          <p className="text-muted-foreground mb-6 text-xs">
            You can still manage bookings, customers, leads, and staff on the free plan.
          </p>
          {canShowPaymentFlows ? (
            <Button onClick={() => setShowSubscriptionDialog(true)} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Subscribe to Unlock
            </Button>
          ) : (
            <Button onClick={() => window.open(billingUrl, '_blank')} variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Subscribe on Web
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return overlay;
}

export function useSubscriptionCheck() {
  const { subscription, setShowSubscriptionDialog } = useAuth();
  const { canShowPaymentFlows, billingUrl } = usePlatform();

  const requireSubscription = (callback: () => void, feature?: string) => {
    if (subscription?.subscribed && !subscription?.payment_failed) {
      callback();
    } else if (canShowPaymentFlows) {
      // Only show subscription dialog on web
      setShowSubscriptionDialog(true);
    } else {
      // On native, redirect to web for subscription management
      window.open(billingUrl, '_blank');
    }
  };

  const isSubscribed = (subscription?.subscribed && !subscription?.payment_failed) ?? false;

  return { requireSubscription, isSubscribed };
}
