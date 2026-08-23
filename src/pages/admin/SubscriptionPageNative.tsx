/**
 * Native Subscription Page — Trial Expired Wall
 *
 * Shown when check-subscription returns subscribed:false on native.
 * No payment links, no URLs — Apple guidelines prohibit linking to
 * external payment from inside the app (outside the US storefront).
 *
 * This is a FULLSCREEN wall with no app chrome — no sidebar, no bottom
 * nav, no header. Sign out is the only way off it.
 */

import { useAuth } from '@/hooks/useAuth';
import { SEOHead } from '@/components/SEOHead';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SubscriptionPageNative() {
  const { subscription, signOut } = useAuth();
  const navigate = useNavigate();

  const trialEnd = subscription?.trial_end
    ? new Date(subscription.trial_end).toLocaleDateString(undefined, {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <SEOHead title="Subscription | TidyWise" description="Subscribe to continue using TidyWise." noIndex />
      <Card className="max-w-md w-full border-border/50 shadow-lg">
        <CardContent className="pt-8 pb-8 px-6 text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <Clock className="h-7 w-7 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">
              Your free trial has ended
            </h1>
            {trialEnd && (
              <p className="text-sm text-muted-foreground">
                Trial ended on {trialEnd}
              </p>
            )}
          </div>

          <p className="text-muted-foreground leading-relaxed">
            To keep using TidyWise, open{' '}
            <span className="font-medium text-foreground">jointidywise.com</span>{' '}
            on a computer and subscribe from your dashboard.
          </p>

          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
