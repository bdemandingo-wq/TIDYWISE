import { useEffect, useState } from 'react';
import { getStripePromise, getCachedStripeReact, setCachedStripeReact } from '@/lib/stripe';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { Stripe } from '@stripe/stripe-js';

type StripeReact = typeof import('@stripe/react-stripe-js');

interface CardFormProps {
  email: string;
  customerName: string;
  organizationId: string;
  onCardSaved: (cardInfo: { last4: string; brand: string; paymentMethodId: string }) => void;
  onError?: (error: string) => void;
  onHoldPlaced?: (holdInfo: { paymentIntentId: string; amount: number }) => void;
  showHoldOption?: boolean;
  defaultHoldAmount?: number;
  publicBooking?: boolean;
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
      padding: '10px 12px',
    },
    invalid: {
      color: '#9e2146',
    },
  },
  disableLink: true,
  hidePostalCode: true,
};

/**
 * Inner form — rendered inside <Elements> so useStripe()/useElements() work.
 * The stripe instance here is GUARANTEED to be the same one used to create Elements.
 * We pass in the pre-fetched clientSecret so no second Stripe instance is needed.
 */
function CardFormInner({
  stripeReact,
  prefetchedClientSecret,
  email,
  customerName,
  organizationId,
  onCardSaved,
  onError,
  onHoldPlaced,
  showHoldOption = true,
  defaultHoldAmount = 50,
  publicBooking = false,
}: CardFormProps & {
  stripeReact: StripeReact;
  prefetchedClientSecret: string;
}) {
  // These hooks read from the Elements context — same Stripe instance as the provider.
  const stripe = stripeReact.useStripe();
  const elements = stripeReact.useElements();
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [placeHold, setPlaceHold] = useState(false);
  const [holdAmount, setHoldAmount] = useState(defaultHoldAmount.toString());

  const handleSaveCard = async () => {
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(stripeReact.CardElement);
    if (!cardElement) return;

    setLoading(true);

    try {
      // Use the pre-fetched clientSecret — no need to call create-setup-intent again.
      // Crucially, we confirm using `stripe` from useStripe(), which is the SAME instance
      // that was used to create these Elements. This is what Stripe requires.
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(prefetchedClientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: customerName,
            email: email,
          },
        },
      });

      if (confirmError) {
        throw new Error(confirmError.message);
      }

      if (setupIntent?.status === 'succeeded' && setupIntent.payment_method) {
        const { data: cardData, error: cardError } = await supabase.functions.invoke('get-payment-method-details', {
          body: {
            paymentMethodId: setupIntent.payment_method,
            organizationId,
          },
        });

        if (cardError) {
          throw new Error(cardError.message);
        }

        onCardSaved({
          last4: cardData.last4,
          brand: cardData.brand,
          paymentMethodId: setupIntent.payment_method as string,
        });

        if (placeHold && parseFloat(holdAmount) > 0) {
          const { data: holdData, error: holdError } = await supabase.functions.invoke('charge-customer-card', {
            body: {
              email,
              amount: parseFloat(holdAmount),
              description: `Temporary hold for ${customerName}`,
              organizationId,
            },
          });

          if (holdError) {
            toast({
              title: 'Card saved, but hold failed',
              description: holdError.message,
              variant: 'destructive',
            });
          } else if (holdData?.success) {
            toast({
              title: 'Success',
              description: `Card saved and $${parseFloat(holdAmount).toFixed(2)} hold placed (not charged)`,
            });
            onHoldPlaced?.({
              paymentIntentId: holdData.paymentIntentId,
              amount: parseFloat(holdAmount),
            });
          }
        } else {
          toast({
            title: 'Success',
            description: `Card saved (${cardData.brand} ending in ${cardData.last4})`,
          });
        }

        cardElement.clear();
      }
    } catch (error: any) {
      console.error('Failed to save card:', error);
      const errorMessage = error.message || 'Failed to save card';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 border rounded-md bg-background">
        <stripeReact.CardElement options={CARD_ELEMENT_OPTIONS} onChange={(e) => setCardComplete(e.complete)} />
      </div>

      {showHoldOption && (
        <div className="space-y-3 p-4 bg-secondary/30 rounded-lg border border-border/50">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="placeHold"
              checked={placeHold}
              onCheckedChange={(checked) => setPlaceHold(checked === true)}
            />
            <Label htmlFor="placeHold" className="flex items-center gap-2 text-sm cursor-pointer">
              <Lock className="w-4 h-4 text-muted-foreground" />
              Place temporary hold (not charged)
            </Label>
          </div>

          {placeHold && (
            <div className="flex items-center gap-2 ml-6">
              <Label htmlFor="holdAmount" className="text-sm text-muted-foreground whitespace-nowrap">
                Hold amount:
              </Label>
              <div className="relative flex-1 max-w-[120px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="holdAmount"
                  type="number"
                  value={holdAmount}
                  onChange={(e) => setHoldAmount(e.target.value)}
                  className="pl-7 h-9"
                  min="1"
                  step="0.01"
                />
              </div>
            </div>
          )}

          {placeHold && (
            <p className="text-xs text-muted-foreground ml-6">
              This hold authorizes but does not charge the card. You can capture or release it later.
            </p>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="secondary"
        disabled={loading || !stripe || !cardComplete}
        className="w-full"
        onClick={handleSaveCard}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <CreditCard className="w-4 h-4 mr-2" />
        )}
        {placeHold ? `Add Card & Place $${parseFloat(holdAmount || '0').toFixed(2)} Hold` : 'Add Card'}
      </Button>
    </div>
  );
}

/**
 * Outer shell: pre-fetches the org's publishable key + clientSecret BEFORE mounting Elements.
 * This guarantees that Elements and confirmCardSetup both use the exact same Stripe instance.
 */
export function StripeCardForm(props: CardFormProps) {
  const { email, customerName, organizationId, publicBooking = false } = props;

  const [stripeReact, setStripeReact] = useState<StripeReact | null>(getCachedStripeReact);
  // Both stripePromise and clientSecret are resolved together before Elements mounts.
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Step 1: Load @stripe/react-stripe-js module
  useEffect(() => {
    if (stripeReact) return;
    let cancelled = false;
    import('@stripe/react-stripe-js')
      .then((m) => {
        if (!cancelled) {
          setStripeReact(m);
          setCachedStripeReact(m);
        }
      })
      .catch((err) => console.error('Failed to load Stripe React:', err));
    return () => { cancelled = true; };
  }, [stripeReact]);

  // Step 2: Pre-fetch org publishable key + SetupIntent clientSecret together.
  // We do this BEFORE rendering <Elements> so that the Stripe instance used to create
  // Elements is the SAME instance used later for confirmCardSetup.
  useEffect(() => {
    if (!organizationId || !email || !customerName) return;
    let cancelled = false;

    async function prefetch() {
      try {
        const { data: setupData, error: setupError } = await supabase.functions.invoke('create-setup-intent', {
          body: { email, customerName, organizationId, publicBooking },
        });

        if (cancelled) return;

        if (setupError || !setupData?.clientSecret) {
          throw new Error(setupError?.message || 'Failed to initialize payment form');
        }

        // Resolve the correct Stripe publishable key for this org.
        // getStripePromise caches by key, so the same instance is always returned for the same key.
        const resolvedKey = setupData.publishableKey || undefined;
        const promise = getStripePromise(resolvedKey);

        setStripePromise(promise);
        setClientSecret(setupData.clientSecret);
      } catch (err: any) {
        if (!cancelled) setInitError(err.message || 'Failed to initialize payment form');
      }
    }

    prefetch();
    return () => { cancelled = true; };
  }, [organizationId, email, customerName, publicBooking]);

  // Loading states
  if (!stripeReact || !stripePromise || !clientSecret) {
    if (initError) {
      return (
        <div className="p-4 border rounded-lg bg-card">
          <p className="text-sm text-destructive">{initError}</p>
        </div>
      );
    }
    return (
      <div className="p-4 border rounded-lg bg-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading secure payment form…
        </div>
      </div>
    );
  }

  // Step 3: Mount Elements with the org-specific stripePromise.
  // CardFormInner uses useStripe() which returns the instance from THIS Elements provider.
  // confirmCardSetup is called on that same instance — no mismatch possible.
  return (
    <stripeReact.Elements stripe={stripePromise}>
      <CardFormInner
        stripeReact={stripeReact}
        prefetchedClientSecret={clientSecret}
        {...props}
      />
    </stripeReact.Elements>
  );
}
