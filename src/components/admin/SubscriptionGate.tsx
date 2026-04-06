import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Sparkles } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";

interface SubscriptionGateProps {
  children: React.ReactNode;
  feature?: string;
}

export function SubscriptionGate({ children, feature = "this feature" }: SubscriptionGateProps) {
  const { hasFullAccess, isLoading } = useSubscription();
  const { setShowSubscriptionDialog } = useAuth();

  // While subscription status is loading, show children to avoid flash
  if (isLoading) return <>{children}</>;

  if (hasFullAccess) return <>{children}</>;

  return (
    <Card className="border-dashed border-2 border-muted-foreground/30">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold">Upgrade to Unlock {feature}</h3>
        <p className="text-muted-foreground max-w-md">
          {feature} is available on paid plans. Subscribe to unlock full access to all features and grow your business.
        </p>
        <Button onClick={() => setShowSubscriptionDialog(true)} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Upgrade Now
        </Button>
      </CardContent>
    </Card>
  );
}

export function useSubscriptionCheck() {
  const { hasFullAccess } = useSubscription();
  const { setShowSubscriptionDialog } = useAuth();

  const requireSubscription = (callback: () => void, _feature?: string) => {
    if (hasFullAccess) {
      callback();
    } else {
      setShowSubscriptionDialog(true);
    }
  };

  return { requireSubscription, isSubscribed: hasFullAccess };
}
