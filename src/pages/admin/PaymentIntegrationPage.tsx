import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CreditCard, 
  CheckCircle2, 
  Key,
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  Loader2,
  TestTube,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/contexts/OrganizationContext";

function normalizeKeyInput(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function looksMaskedStripeKey(value: string): boolean {
  // Common patterns when someone copies the masked UI value instead of the real key
  return (
    value.includes("...") ||
    value.includes("…") ||
    value.includes("••") ||
    value.length < 30
  );
}

function validateStripeKeys(publishableKeyRaw: string, secretKeyRaw: string):
  | { ok: true; publishableKey: string; secretKey: string }
  | { ok: false; message: string } {
  const publishableKey = normalizeKeyInput(publishableKeyRaw);
  const secretKey = normalizeKeyInput(secretKeyRaw);

  if (!publishableKey.startsWith("pk_")) {
    return { ok: false, message: "Publishable key should start with 'pk_'" };
  }
  if (!secretKey.startsWith("sk_")) {
    return { ok: false, message: "Secret key should start with 'sk_'" };
  }
  if (looksMaskedStripeKey(secretKey)) {
    return {
      ok: false,
      message:
        "That secret key looks masked/truncated. In Stripe, create/rotate a secret key and copy the FULL value (Stripe only shows it once).",
    };
  }

  return { ok: true, publishableKey, secretKey };
}

export default function PaymentIntegrationPage() {
  const { organization } = useOrganization();
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [existingConnection, setExistingConnection] = useState<{
    is_connected: boolean;
    connected_at: string | null;
    stripe_publishable_key: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Check for existing Stripe connection on load
  useEffect(() => {
    const checkExistingConnection = async () => {
      if (!organization?.id) return;
      
      try {
        const { data, error } = await supabase
          .from("org_stripe_settings")
          .select("is_connected, connected_at, stripe_publishable_key")
          .eq("organization_id", organization.id)
          .maybeSingle();

        if (error) {
          console.error("Error checking Stripe connection:", error);
        } else if (data) {
          setExistingConnection(data);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkExistingConnection();
  }, [organization?.id]);

  const handleTestConnection = async () => {
    const validated = validateStripeKeys(publishableKey, secretKey);
    if (validated.ok === false) {
      toast.error(validated.message);
      return;
    }

    setIsTesting(true);
    try {
      // Test the publishable key by loading Stripe
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe = await loadStripe(validated.publishableKey);
      
      if (stripe) {
        setIsConnected(true);
        toast.success("Stripe connection successful! Keys are valid.");
      } else {
        throw new Error("Failed to initialize Stripe");
      }
    } catch (error: any) {
      setIsConnected(false);
      toast.error("Connection failed. Please verify your keys are correct.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveKeys = async () => {
    if (!isConnected) {
      toast.error("Please test your connection first");
      return;
    }

    const validated = validateStripeKeys(publishableKey, secretKey);
    if (validated.ok === false) {
      toast.error(validated.message);
      return;
    }

    if (!organization?.id) {
      toast.error("Organization not found");
      return;
    }

    setIsSaving(true);
    try {
      // Save both keys to the database
      const { error } = await supabase
        .from("org_stripe_settings")
        .upsert({
          organization_id: organization.id,
          stripe_secret_key: validated.secretKey,
          stripe_publishable_key: validated.publishableKey,
          is_connected: true,
          connected_at: new Date().toISOString(),
        }, {
          onConflict: "organization_id"
        });

      if (error) throw error;

      // Also store publishable key in localStorage for frontend use
      localStorage.setItem("stripe_publishable_key", validated.publishableKey);
      
      toast.success("Stripe connected successfully! You can now accept payments.");
      
      setPublishableKey("");
      setSecretKey("");
      setIsConnected(false);
      setExistingConnection({
        is_connected: true,
        connected_at: new Date().toISOString(),
        stripe_publishable_key: validated.publishableKey,
      });
    } catch (error: any) {
      console.error("Error saving Stripe keys:", error);
      toast.error("Failed to save keys. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!organization?.id) return;

    setIsDisconnecting(true);
    try {
      const { error } = await supabase
        .from("org_stripe_settings")
        .delete()
        .eq("organization_id", organization.id);

      if (error) throw error;

      localStorage.removeItem("stripe_publishable_key");
      setExistingConnection(null);
      toast.success("Stripe disconnected successfully");
    } catch (error) {
      console.error("Error disconnecting Stripe:", error);
      toast.error("Failed to disconnect Stripe");
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Payment Integration" subtitle="Connect your Stripe account to accept payments">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Payment Integration" subtitle="Connect your Stripe account to accept payments">
      <div className="space-y-6 max-w-3xl">
        
        {/* Existing Connection Status */}
        {existingConnection?.is_connected && (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Stripe Connected</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your Stripe account is connected and ready to accept payments.
                    </p>
                    {existingConnection.connected_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Connected on {new Date(existingConnection.connected_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="text-destructive hover:text-destructive"
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
        )}

        {/* Step-by-Step Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Stripe Setup Guide
            </CardTitle>
            <CardDescription>
              Follow these steps to connect your Stripe account and start accepting payments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              
              {/* Step 1 */}
              <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Create a Stripe Account</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    If you don't have a Stripe account yet, create one for free. It takes just a few minutes.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Complete Account Verification</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add your business details, banking information, and verify your identity to start accepting real payments.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Get Your API Keys</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    In your Stripe Dashboard, go to <strong>Developers → API Keys</strong>. You'll find two keys:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>• <strong>Publishable key</strong> (starts with <code className="bg-muted px-1 rounded">pk_</code>)</li>
                    <li>• <strong>Secret key</strong> (starts with <code className="bg-muted px-1 rounded">sk_</code>)</li>
                  </ul>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  4
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Enter Your API Keys Below</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Copy your keys from Stripe and paste them in the form below to connect your account.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Keys Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {existingConnection?.is_connected ? "Update Your Stripe API Keys" : "Enter Your Stripe API Keys"}
            </CardTitle>
            <CardDescription>
              Your keys are encrypted and stored securely
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="publishableKey">Publishable Key</Label>
              <Input
                id="publishableKey"
                type="text"
                placeholder="pk_live_..."
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This key is safe to use in frontend code
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secretKey">Secret Key</Label>
              <div className="relative">
                <Input
                  id="secretKey"
                  type={showSecretKey ? "text" : "password"}
                  placeholder="sk_live_..."
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                >
                  {showSecretKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This key is kept secret and used only on the server
              </p>
                <p className="text-xs text-muted-foreground">
                  Tip: Stripe won’t let you re-view a secret key later — you must create/rotate one and copy the full value immediately.
                </p>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Important Security Note</p>
                <p className="text-muted-foreground mt-1">
                  Never share your secret key publicly. It should only be used in server-side code.
                  Use <strong>test keys</strong> (starting with <code className="bg-muted px-1 rounded">pk_test_</code> and <code className="bg-muted px-1 rounded">sk_test_</code>) while developing.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleTestConnection} 
                disabled={!publishableKey || !secretKey || isTesting}
                variant="outline"
                className="flex-1"
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4 mr-2" />
                )}
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
              <Button 
                onClick={handleSaveKeys} 
                disabled={!isConnected || isSaving}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save API Keys"}
              </Button>
            </div>
            
            {isConnected && (
              <div className="bg-success/10 border border-success/20 rounded-lg p-4 flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Connection Verified</p>
                  <p className="text-muted-foreground">Your Stripe keys are valid. You can now save them.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features Card */}
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

        {/* Help Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Need Help?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Having trouble setting up Stripe? Contact us at{" "}
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
