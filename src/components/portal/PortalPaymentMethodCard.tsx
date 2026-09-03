import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Check, Loader2 } from 'lucide-react';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';
import { toast } from 'sonner';
import { useClientPortal } from '@/contexts/ClientPortalContext';
import { QueryError } from '@/components/QueryError';

interface Props {
  email: string;
  customerName: string;
  organizationId: string;
}

interface CardOnFile {
  hasCard: boolean;
  brand?: string;
  last4?: string;
}

/** Stripe returns "visa"; people read "Visa". */
const titleCaseBrand = (brand: string | null | undefined) =>
  brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card';

/**
 * Lets a client see, add or replace the card their cleaning business charges.
 *
 * The card on file comes from client-portal-api's get_card action, which
 * verifies the portal session and reads Stripe live. It resolves the same
 * payment method the charge paths use — invoice_settings.default_payment_method
 * first, then the first listed card — so what a client sees here is what they
 * would actually be charged on.
 *
 * Replace only — no remove. Deleting the last card while a booking is
 * scheduled leaves the business unable to charge for work already committed;
 * that is the org's decision, not the client's.
 *
 * If get_card fails for ANY reason — offline, Stripe down, or the action not
 * deployed yet — this falls back to saying nothing about existing cards rather
 * than claiming there are none. Showing "Add card" to someone who already has
 * one invites a duplicate; not knowing is the safer failure.
 *
 * Authenticates with the portal session token: create-setup-intent and
 * get-payment-method-details verify it server-side and take the customer and
 * organisation from the verified claims, never from the body.
 */
export function PortalPaymentMethodCard({ email, customerName, organizationId }: Props) {
  const { sessionToken, invokePortal } = useClientPortal();
  const [showForm, setShowForm] = useState(false);
  const [justSaved, setJustSaved] = useState<{ brand: string; last4: string } | null>(null);

  const { data: card, isLoading, isError, error: cardError, refetch } = useQuery<CardOnFile>({
    queryKey: ['portal-card-on-file', organizationId],
    enabled: !!sessionToken && !!organizationId,
    staleTime: 60 * 1000,
    // One retry. A client watching a spinner is worse than a panel that simply
    // does not mention the card they already have.
    retry: 1,
    queryFn: async () => {
      // invokePortal merges the x-portal-session header itself.
      const { data, error } = await invokePortal<CardOnFile>('client-portal-api', {
        body: { action: 'get_card' },
      });
      if (error) throw error;
      return data ?? { hasCard: false };
    },
  });

  // A card saved in this session outranks whatever the query loaded.
  const current = justSaved
    ? justSaved
    : card?.hasCard && card.last4
      ? { brand: titleCaseBrand(card.brand), last4: card.last4 }
      : null;

  // Only ever claim "no card" when get_card actually said so.
  const knowsThereIsNoCard = !isError && !isLoading && card?.hasCard === false && !justSaved;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Payment method
        </CardTitle>
        <CardDescription>
          {knowsThereIsNoCard
            ? 'Add the card used for your cleanings.'
            : 'Add or replace the card used for your cleanings.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your cleaner charges this card after each visit.
        </p>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking your card…
          </div>
        )}

        {cardError && !isLoading && (
          <QueryError subject="card on file" onRetry={() => refetch()} className="py-4" />
        )}

        {current && (
          <div
            className={
              justSaved
                ? 'flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3'
                : 'flex items-center gap-2 rounded-lg border p-3'
            }
          >
            {justSaved ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <p className="text-sm font-medium">
              {justSaved ? 'Saved: ' : ''}
              {current.brand} ending {current.last4}
            </p>
          </div>
        )}

        {showForm ? (
          <StripeCardForm
            email={email}
            customerName={customerName}
            organizationId={organizationId}
            portalSessionToken={sessionToken}
            showHoldOption={false}
            onCardSaved={(cardInfo) => {
              const brand = titleCaseBrand(cardInfo.brand);
              setJustSaved({ brand, last4: cardInfo.last4 });
              setShowForm(false);
              toast.success(`Saved: ${brand} ending ${cardInfo.last4}`);
              // Re-read so later renders reflect Stripe, not local state.
              void refetch();
            }}
            onError={(message) => toast.error(message)}
          />
        ) : (
          <Button onClick={() => setShowForm(true)} className="gap-2 min-h-[44px]">
            <CreditCard className="w-4 h-4" />
            {current ? 'Replace card' : knowsThereIsNoCard ? 'Add card' : 'Add or replace card'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
