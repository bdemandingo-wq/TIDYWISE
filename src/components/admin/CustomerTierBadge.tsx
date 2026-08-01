import { Badge } from '@/components/ui/badge';
import { Crown } from 'lucide-react';

/**
 * The loyalty tier a customer has earned. Read-only.
 *
 * Renders nothing when there is no tier — a customer below the org's lowest
 * threshold, or a new customer with no history. An empty space says "no tier"
 * more honestly than a badge reading "None", which invites the reader to think
 * something was configured wrong.
 *
 * Deliberately carries no discount figure. Tier discounts are stored as
 * free-text benefit strings ("10% discount") rather than as a rate, so any
 * percentage shown here would be a label parsed out of marketing copy and
 * presented as a number. See docs/superpowers/plans/2026-08-01-tier-aware-price-floor.md.
 */
export function CustomerTierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  return (
    <Badge variant="secondary" className="gap-1 font-medium">
      <Crown className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">Loyalty tier: </span>
      {tier}
    </Badge>
  );
}
