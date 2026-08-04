import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

/** Live form: "Tell us what you think". Verified ENABLED, unique: None,
 *  limitSubmission: No Limit — so an operator can send as many as they like. */
const JOTFORM_ID = '262157123667055';

/**
 * Feedback form, embedded from Jotform.
 *
 * A hosted form rather than a table: storing feedback ourselves would mean a
 * migration, and the whole point was to avoid spending a Lovable credit on
 * something a third party already does well. Submissions notify
 * support@tidywisecleaning.com and autorespond to the sender, both configured
 * on the Jotform side.
 *
 * No Jotform embed script. Their handler auto-resizes the iframe via
 * postMessage, but it is third-party JS on an authenticated admin page and the
 * only thing it buys is height. A tall frame that scrolls internally costs
 * nothing and keeps the page free of an external script.
 */
export function FeedbackTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Send feedback
        </CardTitle>
        <CardDescription>
          Suggestions, problems, and anything you like or don't. It goes straight to the person
          building TidyWise — every one gets read.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <iframe
          title="TidyWise feedback form"
          src={`https://form.jotform.com/${JOTFORM_ID}`}
          className="w-full rounded-lg border bg-white"
          style={{ height: 'min(1100px, 80vh)' }}
          // allow-forms/scripts are what the form needs to submit; same-origin
          // is required for Jotform's own session. No allow-top-navigation, so
          // the embed cannot navigate the admin out of the app.
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        />
      </CardContent>
    </Card>
  );
}
