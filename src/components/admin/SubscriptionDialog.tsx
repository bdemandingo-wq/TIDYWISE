import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Loader2,
  Sparkles,
  Rocket,
  Shield,
  CheckCircle2,
  ExternalLink,
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { usePlatform } from "@/hooks/usePlatform";

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubscriptionActive: () => void;
}

export function SubscriptionDialog({ open, onOpenChange, onSubscriptionActive }: SubscriptionDialogProps) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { canShowPaymentFlows, billingUrl } = usePlatform();

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      if (data?.subscribed) {
        setIsSubscribed(true);
        onSubscriptionActive();
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (open) {
      checkSubscription();
    }
  }, [open]);

  const handleSubscribe = async () => {
    setCheckingOut(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-subscription");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      toast.error(error.message || "Failed to start subscription");
    } finally {
      setCheckingOut(false);
    }
  };

  const handleContinueLimited = () => {
    onOpenChange(false);
  };

  if (checking) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // On native platforms, show a simple redirect message
  if (!canShowPaymentFlows) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              Subscription Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <p className="text-muted-foreground text-center">
              Manage your subscription at jointidywise.lovable.app to unlock all features.
            </p>
            <div className="space-y-3">
              <Button 
                onClick={() => {
                  window.open(billingUrl, '_blank');
                  onOpenChange(false);
                }} 
                size="lg" 
                variant="outline"
                className="w-full gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Manage Subscription on Web
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-muted-foreground"
                onClick={handleContinueLimited}
              >
                <X className="mr-2 h-4 w-4" />
                Continue in Limited Mode
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-lg" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-2xl">
            Welcome to TidyWise! 🎉
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <p className="text-center text-muted-foreground">
            Choose how to get started:
          </p>

          {/* Start Free Trial Option */}
          <button
            onClick={handleSubscribe}
            disabled={checkingOut}
            className="w-full p-5 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                <Rocket className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg text-foreground">Start Free Trial</h3>
                  {checkingOut && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Full access to all features for 60 days — no card required
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["Unlimited bookings", "Team management", "AI tools", "Analytics"].map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </button>

          {/* Continue in Limited Mode Option */}
          <button
            onClick={handleContinueLimited}
            className="w-full p-5 rounded-xl border-2 border-border hover:border-muted-foreground/30 hover:bg-accent/50 transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-muted text-muted-foreground group-hover:bg-muted/80 transition-colors">
                <Shield className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-foreground">Continue in Limited Mode</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Basic features, no card required — upgrade anytime
                </p>
              </div>
            </div>
          </button>
          
          <p className="text-xs text-center text-muted-foreground">
            You can change your plan anytime from Settings.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
