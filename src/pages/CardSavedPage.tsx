import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Check, X } from 'lucide-react';

export default function CardSavedPage() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get('success') === 'true';
  const cancelled = searchParams.get('cancelled') === 'true';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {success ? (
            <>
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-success" />
              </div>
              <h1 className="text-2xl font-bold">Card Saved Successfully!</h1>
              <p className="text-muted-foreground">
                Your payment card has been securely saved. You won't be charged until after your service is completed.
              </p>
              <p className="text-sm text-muted-foreground">You can close this page now.</p>
            </>
          ) : cancelled ? (
            <>
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <X className="w-8 h-8 text-destructive" />
              </div>
              <h1 className="text-2xl font-bold">Card Setup Cancelled</h1>
              <p className="text-muted-foreground">
                You cancelled the card setup. If you'd like to add your card later, please use the link sent to you.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Card Setup</h1>
              <p className="text-muted-foreground">
                Please use the link sent to your email or phone to add your card.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
