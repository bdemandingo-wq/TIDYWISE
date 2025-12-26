import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CreditCard, 
  ExternalLink, 
  CheckCircle2, 
  Copy,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";

export default function PaymentIntegrationPage() {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <AdminLayout title="Payment Integration" subtitle="Connect your preferred payment processor">
      <div className="space-y-6">

        <Tabs defaultValue="stripe" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="stripe">Stripe</TabsTrigger>
            <TabsTrigger value="square">Square</TabsTrigger>
            <TabsTrigger value="paypal">PayPal</TabsTrigger>
          </TabsList>

          {/* Stripe Integration */}
          <TabsContent value="stripe">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Stripe Integration
                </CardTitle>
                <CardDescription>
                  Accept credit cards, Apple Pay, Google Pay, and more with Stripe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">Setup Instructions:</h3>
                  
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</div>
                      <div>
                        <p className="font-medium text-foreground">Create a Stripe Account</p>
                        <p className="text-sm text-muted-foreground">
                          Go to <Button variant="link" className="p-0 h-auto" onClick={() => window.open("https://dashboard.stripe.com/register", "_blank")}>stripe.com/register</Button> and create your free account
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</div>
                      <div>
                        <p className="font-medium text-foreground">Complete Account Verification</p>
                        <p className="text-sm text-muted-foreground">
                          Add your business details, banking information, and verify your identity
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</div>
                      <div>
                        <p className="font-medium text-foreground">Get Your API Keys</p>
                        <p className="text-sm text-muted-foreground">
                          Go to Developers → API Keys in your Stripe Dashboard. Copy both the Publishable key and Secret key.
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => window.open("https://dashboard.stripe.com/apikeys", "_blank")}
                        >
                          Open Stripe API Keys <ExternalLink className="ml-2 h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">4</div>
                      <div>
                        <p className="font-medium text-foreground">Add Keys to TIDYWISE</p>
                        <p className="text-sm text-muted-foreground">
                          Contact support@tidywisecleaning.com with your API keys and we'll configure them for your account securely.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary/50 rounded-lg p-4 mt-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">Stripe Features</p>
                        <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                          <li>• Credit & debit card processing</li>
                          <li>• Apple Pay & Google Pay</li>
                          <li>• Automatic payouts to your bank</li>
                          <li>• Invoice and subscription billing</li>
                          <li>• Fraud protection included</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Square Integration */}
          <TabsContent value="square">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Square Integration
                </CardTitle>
                <CardDescription>
                  Process payments with Square's powerful payment platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">Setup Instructions:</h3>
                  
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</div>
                      <div>
                        <p className="font-medium text-foreground">Create a Square Account</p>
                        <p className="text-sm text-muted-foreground">
                          Visit <Button variant="link" className="p-0 h-auto" onClick={() => window.open("https://squareup.com/signup", "_blank")}>squareup.com/signup</Button> to create your account
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</div>
                      <div>
                        <p className="font-medium text-foreground">Set Up Your Business</p>
                        <p className="text-sm text-muted-foreground">
                          Complete your business profile and link your bank account for deposits
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</div>
                      <div>
                        <p className="font-medium text-foreground">Create an Application</p>
                        <p className="text-sm text-muted-foreground">
                          Go to Square Developer Dashboard and create a new application to get your API credentials.
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => window.open("https://developer.squareup.com/apps", "_blank")}
                        >
                          Open Square Developer <ExternalLink className="ml-2 h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">4</div>
                      <div>
                        <p className="font-medium text-foreground">Get Your Access Token</p>
                        <p className="text-sm text-muted-foreground">
                          In your application settings, find your Production Access Token and Application ID.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">5</div>
                      <div>
                        <p className="font-medium text-foreground">Add Keys to TIDYWISE</p>
                        <p className="text-sm text-muted-foreground">
                          Contact support@tidywisecleaning.com with your Access Token and Application ID.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary/50 rounded-lg p-4 mt-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">Square Features</p>
                        <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                          <li>• In-person and online payments</li>
                          <li>• Next-day deposits available</li>
                          <li>• Built-in invoicing</li>
                          <li>• Team management tools</li>
                          <li>• Detailed analytics</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PayPal Integration */}
          <TabsContent value="paypal">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  PayPal Integration
                </CardTitle>
                <CardDescription>
                  Accept PayPal payments and credit cards through PayPal's platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">Setup Instructions:</h3>
                  
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">1</div>
                      <div>
                        <p className="font-medium text-foreground">Create a PayPal Business Account</p>
                        <p className="text-sm text-muted-foreground">
                          Visit <Button variant="link" className="p-0 h-auto" onClick={() => window.open("https://www.paypal.com/business", "_blank")}>paypal.com/business</Button> to sign up for a business account
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">2</div>
                      <div>
                        <p className="font-medium text-foreground">Verify Your Business</p>
                        <p className="text-sm text-muted-foreground">
                          Complete the business verification process and link your bank account
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">3</div>
                      <div>
                        <p className="font-medium text-foreground">Create REST API App</p>
                        <p className="text-sm text-muted-foreground">
                          Go to the PayPal Developer Dashboard and create a new REST API app under "My Apps & Credentials".
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => window.open("https://developer.paypal.com/developer/applications", "_blank")}
                        >
                          Open PayPal Developer <ExternalLink className="ml-2 h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">4</div>
                      <div>
                        <p className="font-medium text-foreground">Get Live Credentials</p>
                        <p className="text-sm text-muted-foreground">
                          Switch to "Live" mode and copy your Client ID and Secret.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">5</div>
                      <div>
                        <p className="font-medium text-foreground">Add Keys to TIDYWISE</p>
                        <p className="text-sm text-muted-foreground">
                          Contact support@tidywisecleaning.com with your Client ID and Secret.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary/50 rounded-lg p-4 mt-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">PayPal Features</p>
                        <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                          <li>• PayPal balance and credit card payments</li>
                          <li>• Pay Later options for customers</li>
                          <li>• Seller protection program</li>
                          <li>• Mobile-optimized checkout</li>
                          <li>• International payments</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Need Help?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Our team can help you set up your payment integration. Contact us at{" "}
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
