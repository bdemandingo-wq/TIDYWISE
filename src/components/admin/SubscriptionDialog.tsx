import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  ArrowRight,
  Loader2,
  Sparkles,
  X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubscriptionActive: () => void;
}

export function SubscriptionDialog({ open, onOpenChange, onSubscriptionActive }: SubscriptionDialogProps) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);

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
      // Check every 5 seconds while dialog is open
      const interval = setInterval(checkSubscription, 5000);
      return () => clearInterval(interval);
    }
  }, [open]);

  const handleSubscribe = async () => {
    setCheckingOut(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-subscription");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        toast.info("Complete your subscription in the new tab. This dialog will close automatically once confirmed.");
      }
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      toast.error(error.message || "Failed to start subscription");
    } finally {
      setCheckingOut(false);
    }
  };

  if (checking) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Start Your Free Trial
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
            <div>
              <h3 className="font-semibold text-foreground">TIDYWISE Pro</h3>
              <p className="text-sm text-muted-foreground">Complete cleaning business management</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">$50</p>
              <p className="text-xs text-muted-foreground">/month</p>
            </div>
          </div>

          <div className="bg-success/10 border border-success/20 rounded-lg p-4">
            <div className="flex items-center gap-2 text-success font-medium">
              <CheckCircle2 className="h-5 w-5" />
              2-Month Free Trial
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Start with 60 days free - no payment required during trial
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              "Unlimited bookings",
              "Team management",
              "Customer portal",
              "Payment processing",
              "Automated emails",
              "Analytics & reports",
              "Lead management",
              "Priority support"
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                <span className="text-sm text-foreground">{feature}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <Button onClick={handleSubscribe} disabled={checkingOut} size="lg" className="w-full">
              {checkingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Start 2-Month Free Trial <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              <X className="mr-2 h-4 w-4" />
              Continue in Limited Mode
            </Button>
          </div>
          
          <p className="text-xs text-center text-muted-foreground">
            Some features will be disabled until you subscribe. Cancel anytime.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
