import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Check } from 'lucide-react';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';
import { toast } from 'sonner';

interface Props {
  email: string;
  customerName: string;
  organizationId: string;
}

/**
 * Lets a client add or replace the card their cleaning business charges.
 *
 * Deliberately does NOT show the card currently on file, and says nothing that
 * implies we know whether one exists. `get-customer-card` is admin-only
 * (verifyAdminAuth with requireAdmin), client-portal-api has no card action,
 * and the customers table stores no card fields — so from inside the portal
 * there is no way to read that state. Copy that guessed would be worse than
 * copy that doesn't claim: telling someone "no card on file" when they have one
 * invites them to add a second.
 *
 * Once a card IS saved in this session we can be specific, because
 * onCardSaved hands back the brand and last4 of the card that just landed.
 *
 * Replace only — no remove. Deleting the last card while a booking is
 * scheduled leaves the business unable to charge for work already committed;
 * that is the org's decision, not the client's.
 *
 * Uses publicBooking: true, which is the unauthenticated branch of
 * create-setup-intent. It does not widen anything — the same call is already
 * reachable from the public booking page — but see
 * docs/bugs/2026-08-04-create-setup-intent-unauthenticated.md for the real fix,
 * which needs the portal session token verified server-side.
 */
export function PortalPaymentMethodCard({ email, customerName, organizationId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [justSaved, setJustSaved] = useState<{ brand: string; last4: string } | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Payment method
        </CardTitle>
        <CardDescription>Add or replace the card used for your cleanings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your cleaner charges this card after each visit.
        </p>

        {justSaved && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium">
              Saved — {justSaved.brand} ending {justSaved.last4}
            </p>
          </div>
        )}

        {showForm ? (
          <StripeCardForm
            email={email}
            customerName={customerName}
            organizationId={organizationId}
            publicBooking
            showHoldOption={false}
            onCardSaved={(cardInfo) => {
              // Title-case the brand: Stripe returns "visa", not "Visa".
              const brand = cardInfo.brand
                ? cardInfo.brand.charAt(0).toUpperCase() + cardInfo.brand.slice(1)
                : 'Card';
              setJustSaved({ brand, last4: cardInfo.last4 });
              setShowForm(false);
              toast.success(`Saved — ${brand} ending ${cardInfo.last4}`);
            }}
            onError={(message) => toast.error(message)}
          />
        ) : (
          <Button onClick={() => setShowForm(true)} className="gap-2 min-h-[44px]">
            <CreditCard className="w-4 h-4" />
            {justSaved ? 'Replace card' : 'Add or replace card'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
