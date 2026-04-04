import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  CheckCircle2,
  Loader2,
  Trash2,
  ExternalLink,
  AlertCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/contexts/OrganizationContext";
import { SEOHead } from "@/components/SEOHead";

interface ConnectionStatus {
  connected: boolean;
  legacy?: boolean;
  account_id?: string;
  email?: string;
  display_name?: string;
  payouts_enabled?: boolean;
  connected_at?: string;
  default_currency?: string;
  has_publishable_key?: boolean;
}

export default function PaymentIntegrationPage() {
  const { organization } = useOrganization();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Check for OAuth callback code
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (code && organization?.id) {
      handleOAuthCallback(code, state);
    }
  }, [searchParams, organization?.id]);

  // Load connection status
  useEffect(() => {
    if (organization?.id && !searchParams.get("code")) {
      fetchConnectionStatus();
    }
  }, [organization?.id]);

  const fetchConnectionStatus = async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-oauth", {
        body: { action: "get_status", organization_id: organization.id },
      });
      if (error) throw error;
      setConnectionStatus(data);
    } catch (err) {
      console.error("Error fetching status:", err);
      setConnectionStatus({ connected: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthCallback = async (code: string, state: string | null) => {
    if (!organization?.id) return;
    setIsConnecting(true);
    setIsLoading(false);
    setOauthMessage("Connecting your Stripe account...");
    setOauthError(null);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-oauth", {
        body: { action: "exchange_code", organization_id: organization.id, code, state },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setOauthMessage(null);
      toast.success("✅ Stripe Connected Successfully");
      // Clear ?code= from URL
      window.history.replaceState({}, "", window.location.pathname);
      await fetchConnectionStatus();
    } catch (err: any) {
      console.error("OAuth callback error:", err);
      setOauthMessage(null);
      setOauthError(err.message || "Failed to connect Stripe");
      toast.error(err.message || "Failed to connect Stripe");
      window.history.replaceState({}, "", window.location.pathname);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnect = async () => {
    if (!organization?.id) return;
    setIsConnecting(true);
    try {
      // Get user email to pre-fill Stripe login
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke("stripe-connect-oauth", {
        body: { action: "get_oauth_url", organization_id: organization.id, email: user?.email || "" },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No OAuth URL returned");
      }
    } catch (err: any) {
      console.error("Connect error:", err);
      toast.error(err.message || "Failed to start connection");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!organization?.id) return;

    const confirmed = window.confirm(
      "Are you sure you want to disconnect Stripe? This will disable all payment features for your organization."
    );
    if (!confirmed) return;

    setIsDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-oauth", {
        body: { action: "disconnect", organization_id: organization.id },
      });
      if (error) throw error;
      setConnectionStatus({ connected: false });
      toast.success("Stripe disconnected successfully");
    } catch (err) {
      console.error("Disconnect error:", err);
      toast.error("Failed to disconnect Stripe");
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Show OAuth connecting state
  if (oauthMessage) {
    return (
      <AdminLayout title="Payment Integration" subtitle="Connect your Stripe account to accept payments">
        <SEOHead title="Payment Integration | TidyWise" description="Connect and manage payment processing" noIndex />
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#635BFF]" />
          <p className="text-lg font-semibold text-foreground">{oauthMessage}</p>
          <p className="text-sm text-muted-foreground">Please wait while we verify your account...</p>
        </div>
      </AdminLayout>
    );
  }

  if (isLoading) {
    return (
      <AdminLayout title="Payment Integration" subtitle="Connect your Stripe account to accept payments">
        <SEOHead title="Payment Integration | TidyWise" description="Connect and manage payment processing" noIndex />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Payment Integration" subtitle="Connect your Stripe account to accept payments">
      <SEOHead title="Payment Integration | TidyWise" description="Connect and manage payment processing" noIndex />
      <div className="space-y-6 max-w-3xl">

        {/* OAuth error banner */}
        {oauthError && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">Stripe Connection Failed</p>
                  <p className="text-sm text-muted-foreground mt-1">{oauthError}</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setOauthError(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {connectionStatus?.connected ? (
          <>
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground text-lg">
                        ✅ Stripe Connected {connectionStatus.legacy && "(API Keys)"}
                      </p>
                      {connectionStatus.email && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {connectionStatus.display_name || connectionStatus.email}
                        </p>
                      )}
                      {connectionStatus.connected_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Connected since {new Date(connectionStatus.connected_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="text-destructive hover:text-destructive flex-shrink-0"
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Disconnect</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Legacy upgrade prompt */}
            {connectionStatus.legacy && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">Upgrade to Stripe Connect (Recommended)</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        You're currently using manual API keys. Upgrade to Stripe Connect OAuth for a more secure, one-click setup with automatic account management.
                      </p>
                      <Button
                        size="sm"
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="mt-3 bg-[#635BFF] hover:bg-[#5851DB] text-white gap-2"
                      >
                        {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                        Upgrade to Connect
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Account Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Account Email</p>
                    <p className="font-medium text-sm mt-0.5">{connectionStatus.email || "—"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Business Name</p>
                    <p className="font-medium text-sm mt-0.5">{connectionStatus.display_name || "—"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Payouts</p>
                    <p className="font-medium text-sm mt-0.5">
                      {connectionStatus.payouts_enabled ? "✅ Enabled" : "⚠️ Not yet enabled"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Currency</p>
                    <p className="font-medium text-sm mt-0.5 uppercase">{connectionStatus.default_currency || "usd"}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => window.open("https://dashboard.stripe.com", "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Stripe Dashboard
                </Button>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Connect Button - Hero Card */}
            <Card className="border-[#635BFF]/30 overflow-hidden">
              <div className="bg-gradient-to-br from-[#635BFF]/10 to-[#635BFF]/5 p-8 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-[#635BFF] flex items-center justify-center mb-4">
                  <CreditCard className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Connect with Stripe</h2>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Connect your Stripe account in one click — no API keys needed. Start accepting credit cards, Apple Pay, and bank transfers.
                </p>
                <Button
                  size="lg"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="bg-[#635BFF] hover:bg-[#5851DB] text-white px-8 py-3 text-base font-semibold gap-2"
                >
                  {isConnecting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Zap className="h-5 w-5" />
                  )}
                  {isConnecting ? "Connecting..." : "Connect with Stripe"}
                </Button>
                <p className="text-xs text-muted-foreground mt-3">
                  Already have a Stripe account? You'll be asked to log in — no need to create a new one.
                </p>
              </div>
            </Card>

            {/* How it works */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How it works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { step: "1", title: "Click Connect", desc: "You'll be redirected to Stripe's secure login page" },
                  { step: "2", title: "Log in or sign up", desc: "Use your existing Stripe account or create a new one for free" },
                  { step: "3", title: "Authorize TidyWise", desc: "Grant permission to process payments on your behalf" },
                  { step: "4", title: "Start accepting payments", desc: "Payments go directly to your Stripe account — TidyWise takes no cut" },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 p-3 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {item.step}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{item.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {/* What you can accept */}
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">What You Can Accept with Stripe</p>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                  <li>• Credit & debit cards (Visa, Mastercard, Amex, etc.)</li>
                  <li>• Apple Pay & Google Pay</li>
                  <li>• ACH bank transfers</li>
                  <li>• Recurring subscriptions</li>
                  <li>• Automatic payouts to your bank account</li>
                  <li>• Built-in fraud protection</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Help */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Need Help?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Having trouble connecting Stripe? Contact us at{" "}
                  <a href="mailto:support@tidywisecleaning.com" className="text-primary hover:underline">
                    support@tidywisecleaning.com
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
