/**
 * Native Subscription Page - iOS App Store Compliant
 * 
 * Guideline 3.1.1: No external payment links or purchase CTAs.
 * This page only shows current subscription status.
 * Users are informed to visit the website to manage subscriptions.
 */

import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  Loader2,
  AlertTriangle,
  Info
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface SubscriptionStatus {
  subscribed: boolean;
  trial_active: boolean;
  product_id: string | null;
  subscription_end: string | null;
  trial_end: string | null;
  payment_failed?: boolean;
}

// Subscription data is user-scoped not org-scoped by design
export default function SubscriptionPageNative() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);

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
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, []);

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
      <AdminLayout title="Subscription" subtitle="Your TIDYWISE subscription status">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  // Payment failed
  if (status?.payment_failed) {
    return (
      <AdminLayout title="Subscription" subtitle="Your TIDYWISE subscription status">
        <div className="max-w-2xl mx-auto">
          <Card className="border-destructive border-2">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-4 rounded-full bg-destructive/10 mb-4">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Payment Issue</h3>
              <p className="text-muted-foreground max-w-sm">
                Please visit jointidywise.com to update your payment method and continue using TIDYWISE.
              </p>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  // Not subscribed
  if (!status?.subscribed) {
    return (
      <AdminLayout title="Subscription" subtitle="Your TIDYWISE subscription status">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Info className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Active Subscription</h3>
              <p className="text-muted-foreground max-w-sm">
                Visit jointidywise.com to subscribe and unlock all features.
              </p>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  // Active subscription / trial
  return (
    <AdminLayout title="Subscription" subtitle="Your TIDYWISE subscription status">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Status
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                        Visit jointidywise.com to manage your subscription.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                To manage your subscription, visit jointidywise.com.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
