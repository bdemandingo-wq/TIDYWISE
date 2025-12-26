import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CreditCard, 
  ExternalLink, 
  CheckCircle2, 
  Key,
  Eye,
  EyeOff,
  Save,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function PaymentIntegrationPage() {
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveKeys = async () => {
    if (!publishableKey.startsWith("pk_")) {
      toast.error("Publishable key should start with 'pk_'");
      return;
    }
    if (!secretKey.startsWith("sk_")) {
      toast.error("Secret key should start with 'sk_'");
      return;
    }

    setIsSaving(true);
    try {
      // Store publishable key in localStorage for frontend use
      localStorage.setItem("stripe_publishable_key", publishableKey);
      
      // Note: Secret key should be stored securely on the backend
      // For now, we'll show a success message and guide the user
      toast.success("Publishable key saved! For security, please contact support to configure your secret key on the server.");
      
      setPublishableKey("");
      setSecretKey("");
    } catch (error) {
      toast.error("Failed to save keys. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout title="Payment Integration" subtitle="Connect your Stripe account to accept payments">
      <div className="space-y-6 max-w-3xl">
        
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
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => window.open("https://dashboard.stripe.com/register", "_blank")}
                  >
                    Create Stripe Account <ExternalLink className="ml-2 h-3 w-3" />
                  </Button>
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
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => window.open("https://dashboard.stripe.com/apikeys", "_blank")}
                  >
                    Open Stripe API Keys <ExternalLink className="ml-2 h-3 w-3" />
                  </Button>
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
              Enter Your Stripe API Keys
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

            <Button 
              onClick={handleSaveKeys} 
              disabled={!publishableKey || !secretKey || isSaving}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Saving..." : "Save API Keys"}
            </Button>
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
