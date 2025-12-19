import { useState } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface CardFormProps {
  email: string;
  customerName: string;
  onCardSaved: (cardInfo: { last4: string; brand: string; paymentMethodId: string }) => void;
  onError?: (error: string) => void;
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
  disableLink: true, // Disable Stripe Link feature
};

function CardFormInner({ email, customerName, onCardSaved, onError }: CardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  const handleSaveCard = async () => {
    if (!stripe || !elements) {
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      return;
    }

    setLoading(true);

    try {
      // First, create a SetupIntent on the server
      const { data: setupData, error: setupError } = await supabase.functions.invoke('create-setup-intent', {
        body: {
          email,
          customerName,
        },
      });

      if (setupError || !setupData?.clientSecret) {
        throw new Error(setupError?.message || 'Failed to create setup intent');
      }

      // Confirm the SetupIntent with the card details
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(setupData.clientSecret, {
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
        // Get card details from the payment method
        const { data: cardData, error: cardError } = await supabase.functions.invoke('get-payment-method-details', {
          body: {
            paymentMethodId: setupIntent.payment_method,
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

        toast({
          title: 'Success',
          description: `Card saved (${cardData.brand} ending in ${cardData.last4})`,
        });

        // Clear the card element
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
        <CardElement options={CARD_ELEMENT_OPTIONS} onChange={(e) => setCardComplete(e.complete)} />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={loading || !stripe || !cardComplete}
        className="w-full"
        onClick={handleSaveCard}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <CreditCard className="w-4 h-4 mr-2" />
        )}
        Save Card on File
      </Button>
    </div>
  );
}

export function StripeCardForm(props: CardFormProps) {
  return (
    <Elements stripe={stripePromise}>
      <CardFormInner {...props} />
    </Elements>
  );
}
