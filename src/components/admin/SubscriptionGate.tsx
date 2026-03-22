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
  // TEMPORARILY BYPASSED: All users get full access. Billing continues in background.
  return <>{children}</>;
}

export function useSubscriptionCheck() {
  // TEMPORARILY BYPASSED: All users treated as subscribed. Billing continues in background.
  const requireSubscription = (callback: () => void, _feature?: string) => {
    callback();
  };

  return { requireSubscription, isSubscribed: true };
}