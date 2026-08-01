import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PauseCircle, PlayCircle, CreditCard } from "lucide-react";
import CancellationFlowDialog from "@/components/subscription/CancellationFlowDialog";
import { PlanSwitcher } from "@/components/subscription/PlanSwitcher";
import { RedeemAccessCodeCard } from "@/components/subscription/RedeemAccessCodeCard";

export default function SubscriptionPage() {
  const { subscription, checkSubscription } = useAuth();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);


  const isSubscribed = subscription?.subscribed === true;
  const periodEnd = subscription?.subscription_end ?? null;

  async function resumeEarly() {
    setResuming(true);
    try {
      const { data, error } = await supabase.functions.invoke("resume-subscription", {
        body: {},
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Subscription resumed.");
      await checkSubscription();
    } catch (err: any) {
      toast.error(err?.message || "Could not resume subscription");
    } finally {
      setResuming(false);
    }
  }

  async function openBillingPortal() {
    setOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", { body: {} });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("Could not open billing portal");

      // Use Capacitor Browser on native (iOS blocks window.open), fallback to window.open on web
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url, presentationStyle: "popover" });
      } else {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) window.location.href = url;
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not open billing portal");
    } finally {
      setOpeningPortal(false);
    }
  }


  return (
    <AdminLayout title="Subscription" subtitle="Your TidyWise plan">
<div className="portal-v2 portal-v2-scroll">
      <SEOHead title="Subscription | TidyWise" description="TidyWise subscription" noIndex />

      <div className="mx-auto max-w-2xl space-y-4">
        <PlanSwitcher />
        <RedeemAccessCodeCard />

        <Card>
          <CardHeader>
            <CardTitle>TidyWise CRM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSubscribed ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Your subscription is active.
                  {periodEnd && (
                    <>
                      {" "}Next billing date:{" "}
                      <span className="font-medium text-foreground">
                        {/* eslint-disable-next-line local/no-device-local-dates -- viewer-local display of a stored instant */}
                        {new Date(periodEnd).toLocaleDateString()}
                      </span>
                      .
                    </>
                  )}
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={resumeEarly}
                    disabled={resuming}
                    title="Resume early if you previously paused"
                  >
                    {resuming ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <PlayCircle className="mr-1 h-4 w-4" />
                    )}
                    Resume now
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openBillingPortal}
                    disabled={openingPortal}
                  >
                    {openingPortal ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-1 h-4 w-4" />
                    )}
                    Update payment method
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setCancelOpen(true)}
                    className="text-muted-foreground"
                  >
                    <PauseCircle className="mr-1 h-4 w-4" />
                    Pause or cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Your subscription isn't active. If your card on file expired or a payment
                  failed, update your payment method to restore access.
                </p>
                <Button onClick={openBillingPortal} disabled={openingPortal}>
                  {openingPortal ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-1 h-4 w-4" />
                  )}
                  Update payment method
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CancellationFlowDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        periodEndDate={periodEnd}
        onCancelled={() => checkSubscription()}
        onPaused={() => checkSubscription()}
        onSaved={() => checkSubscription()}
      />
    </div>
</AdminLayout>
  );
}
