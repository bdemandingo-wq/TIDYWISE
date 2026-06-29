import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, ExternalLink, Lightbulb } from 'lucide-react';

export function ZapierSetupGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          How to connect a Zap
        </CardTitle>
        <CardDescription>
          A 2-minute walkthrough for setting up your first Zapier webhook. You only need a free
          Zapier account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible defaultValue="step-1" className="w-full">
          <AccordionItem value="step-1">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">Step 1</Badge>
                Create a new Zap in Zapier
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Log into{' '}
                <a
                  href="https://zapier.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                >
                  zapier.com <ExternalLink className="h-3 w-3" />
                </a>{' '}
                and click <strong>+ Create Zap</strong>.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step-2">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">Step 2</Badge>
                Pick the "Webhooks by Zapier" trigger
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Search for <strong>Webhooks by Zapier</strong> as the trigger app. Choose{' '}
                <strong>Catch Hook</strong> as the event, then click Continue. You can leave the
                "Pick off a Child Key" field blank.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step-3">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">Step 3</Badge>
                Copy the webhook URL Zapier gives you
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Zapier will show you a Custom Webhook URL that looks like{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  https://hooks.zapier.com/hooks/catch/123456/abcdef/
                </code>
                . Copy it.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step-4">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">Step 4</Badge>
                Paste it below and pick an event
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                In the <strong>Zapier Webhooks</strong> card below, click{' '}
                <strong>Add webhook</strong>, give it a name (e.g. "New customer → Google Sheet"),
                paste the URL, and choose which CRM event should trigger it.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step-5">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">Step 5</Badge>
                Send a test, then finish your Zap
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Click <strong>Test</strong> on your new webhook. Go back to Zapier and click{' '}
                <strong>Test trigger</strong> — it should pull in the sample payload. Then add any
                action you want (Google Sheets, Slack, Gmail, Mailchimp, 6,000+ apps) and turn the
                Zap on.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ghl">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                Can I send these events into GoHighLevel (GHL)?
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Yes — use the same Zap. After the <strong>Webhooks by Zapier</strong> trigger, add
                a <strong>Lead Connector (GoHighLevel)</strong> action and pick what you want to
                happen in GHL: <em>Create/Update Contact</em>, <em>Add Contact to Workflow</em>,{' '}
                <em>Create Opportunity</em>, <em>Create Appointment</em>, or{' '}
                <em>Send SMS/Email</em>.
              </p>
              <p>
                Map fields from the webhook payload (e.g. <code>customer.email</code>,{' '}
                <code>customer.phone</code>, <code>booking.scheduled_at</code>) onto the matching
                GHL fields. Use Zapier <strong>Filter</strong> steps if you only want certain
                events to flow into GHL (for example, only <code>booking.completed</code> for a
                review-request workflow).
              </p>
              <p>
                Prefer a direct connection without Zapier? Tell us and we can add a native GHL
                webhook destination.
              </p>
            </AccordionContent>
          </AccordionItem>


          <AccordionItem value="custom-events">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                Can I create my own custom events?
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>Events are defined in the CRM, not in Zapier.</strong> The available events
                (new customer, booking created, invoice paid, etc.) are wired into the CRM's
                backend, so Zapier only receives what the CRM sends.
              </p>
              <p>
                Inside Zapier you can still do a lot: filter events (e.g. only invoices over $500),
                transform fields, branch into multiple actions, and connect to thousands of apps. If
                you need a brand-new event type that doesn't exist yet, request it and we'll add it
                to the CRM and expose it here.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
