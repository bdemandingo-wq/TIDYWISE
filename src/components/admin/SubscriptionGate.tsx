import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Sparkles, AlertTriangle } from "lucide-react";

interface SubscriptionGateProps {
  children: React.ReactNode;
  feature?: string;
}

export function SubscriptionGate({ children, feature = "this feature" }: SubscriptionGateProps) {
  const { subscription, setShowSubscriptionDialog } = useAuth();

  // If payment failed, show urgent message
  if (subscription?.payment_failed) {
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

  return (
    <Card className="border-dashed border-2 border-muted-foreground/20">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-4 rounded-full bg-muted mb-4">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Subscription Required</h3>
        <p className="text-muted-foreground mb-4 max-w-sm">
          {feature} requires an active subscription. Start your free 2-month trial to unlock all features.
        </p>
        <Button onClick={() => setShowSubscriptionDialog(true)} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Start Free Trial
        </Button>
      </CardContent>
    </Card>
  );
}

export function useSubscriptionCheck() {
  const { subscription, setShowSubscriptionDialog } = useAuth();

  const requireSubscription = (callback: () => void, feature?: string) => {
    if (subscription?.subscribed && !subscription?.payment_failed) {
      callback();
    } else {
      setShowSubscriptionDialog(true);
    }
  };

  const isSubscribed = (subscription?.subscribed && !subscription?.payment_failed) ?? false;

  return { requireSubscription, isSubscribed };
}
