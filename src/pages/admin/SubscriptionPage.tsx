import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  Loader2,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SubscriptionStatus {
  subscribed: boolean;
  trial_active: boolean;
  product_id: string | null;
  subscription_end: string | null;
  trial_end: string | null;
}

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      setStatus(data);
    } catch (error) {
      console.error("Error checking subscription:", error);
      toast.error("Failed to check subscription status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSubscription();
    // Refresh every minute
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSubscribe = async () => {
    setCheckingOut(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-subscription");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      toast.error(error.message || "Failed to start subscription");
    } finally {
      setCheckingOut(false);
    }
  };

  const handleManageSubscription = async () => {
    setOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error: any) {
      console.error("Error opening portal:", error);
      toast.error(error.message || "Failed to open billing portal");
    } finally {
      setOpeningPortal(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const getDaysRemaining = (dateString: string) => {
    const endDate = new Date(dateString);
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <AdminLayout title="Subscription" subtitle="Manage your TIDYWISE subscription">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Subscription" subtitle="Manage your TIDYWISE subscription">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Current Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status?.subscribed ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                  <div>
                    <p className="font-semibold text-foreground">
                      {status.trial_active ? "Free Trial Active" : "TIDYWISE Pro"}
                    </p>
                    {status.trial_active && status.trial_end && (
                      <p className="text-sm text-muted-foreground">
                        Trial ends on {formatDate(status.trial_end)} ({getDaysRemaining(status.trial_end)} days remaining)
                      </p>
                    )}
                    {!status.trial_active && status.subscription_end && (
                      <p className="text-sm text-muted-foreground">
                        Renews on {formatDate(status.subscription_end)}
                      </p>
                    )}
                  </div>
                  <Badge variant={status.trial_active ? "secondary" : "default"} className="ml-auto">
                    {status.trial_active ? "Trial" : "Active"}
                  </Badge>
                </div>

                {status.trial_active && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">Your trial includes full access</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          After your 2-month free trial ends, your subscription will automatically continue at $50/month.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Button onClick={handleManageSubscription} disabled={openingPortal} variant="outline">
                  {openingPortal ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Manage Subscription
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-foreground">No Active Subscription</p>
                    <p className="text-sm text-muted-foreground">Start your free trial to access all features</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Plans */}
        {!status?.subscribed && (
          <Card className="border-primary/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    TIDYWISE Pro
                  </CardTitle>
                  <CardDescription>Complete cleaning business management</CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-foreground">$50</p>
                  <p className="text-sm text-muted-foreground">/month</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-success font-medium">
                  <CheckCircle2 className="h-5 w-5" />
                  2-Month Free Trial
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Start with 60 days free - no payment required during trial
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  "Unlimited bookings",
                  "Team management",
                  "Payment processing",
                  "Automated emails",
                  "Analytics & reports",
                  "Inventory tracking",
                  "Lead management",
                  "Quote generator",
                  "GPS check-ins",
                  "Photo documentation",
                  "Priority support"
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <Button onClick={handleSubscribe} disabled={checkingOut} size="lg" className="w-full">
                {checkingOut ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Start 2-Month Free Trial <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              
              <p className="text-xs text-center text-muted-foreground">
                No credit card required to start. Cancel anytime.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
