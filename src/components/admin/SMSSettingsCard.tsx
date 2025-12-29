import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function SMSSettingsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          SMS Notifications (OpenPhone)
          <Badge variant="secondary" className="ml-2">Optional</Badge>
        </CardTitle>
        <CardDescription>
          Send automatic SMS notifications to customers for booking confirmations and reminders
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            SMS integration requires an OpenPhone account. Contact your system administrator to configure the API keys.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <h4 className="font-semibold text-lg">How to Connect OpenPhone</h4>
          
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                1
              </div>
              <div className="space-y-1">
                <p className="font-medium">Create an OpenPhone Account</p>
                <p className="text-sm text-muted-foreground">
                  Go to <a href="https://www.openphone.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    openphone.com <ExternalLink className="w-3 h-3" />
                  </a> and sign up for an account if you don't have one.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                2
              </div>
              <div className="space-y-1">
                <p className="font-medium">Get Your API Key</p>
                <p className="text-sm text-muted-foreground">
                  In OpenPhone, go to <strong>Settings → API</strong> and create a new API key. Copy it somewhere safe.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                3
              </div>
              <div className="space-y-1">
                <p className="font-medium">Find Your Phone Number ID</p>
                <p className="text-sm text-muted-foreground">
                  In OpenPhone, go to <strong>Phone Numbers</strong>, click on your number, and find the Phone Number ID in the URL or settings panel.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                4
              </div>
              <div className="space-y-1">
                <p className="font-medium">Contact Your Administrator</p>
                <p className="text-sm text-muted-foreground">
                  Provide your API Key and Phone Number ID to your system administrator to configure SMS notifications.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-4 mt-4">
          <h4 className="font-semibold mb-3">What SMS Notifications Do</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Send booking confirmation texts to customers
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Send appointment reminders before scheduled cleanings
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Notify customers of schedule changes
            </li>
          </ul>
        </div>

        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Standard messaging rates may apply depending on your OpenPhone plan. 
            Messages are sent from your OpenPhone number, so customers can reply directly to you.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
