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

  return (
    <AdminLayout title="Subscription" subtitle="Your TidyWise plan">
      <SEOHead title="Subscription | TidyWise" description="TidyWise subscription" noIndex />

      <div className="mx-auto max-w-2xl space-y-4">
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
              <p className="text-sm text-muted-foreground text-center">
                Manage your TidyWise plan below. Existing subscribers can manage billing at{" "}
                <a
                  href="https://www.jointidywise.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary"
                >
                  www.jointidywise.com
                </a>
              </p>
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
    </AdminLayout>
  );
}
