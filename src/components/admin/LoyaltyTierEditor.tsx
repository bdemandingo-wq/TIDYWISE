import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Settings2, Plus, X, Star, Award, Trophy, Crown } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { validateTierThresholds, type TierRange } from '@/lib/loyaltyTier';
import { fmt } from '@/lib/activeCurrency';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { QueryError } from '@/components/QueryError';

interface TierSetting {
  id: string;
  tier_name: string;
  min_spending: number;
  max_spending: number | null;
  benefits: string[];
  color: string | null;
  tier_order: number;
  /**
   * The number the price check enforces, NOT the marketing line. `benefits`
   * holds "10% off every cleaning" as a sentence for the customer to read;
   * this is the rate a booking's total is measured against.
   */
  discount_percent: number;
}

// Local editing state for a tier
interface TierEditState {
  minSpending: string;
  maxSpending: string;
  discountPercent: string;
}

// There is deliberately NO local default ladder here any more.
//
// A hardcoded `defaultTiers` array used to live at this spot, and it was the
// FOURTH copy of the same ladder — alongside the fallbacks inside
// get_loyalty_tier_info, get_org_tiers, and resolve_customer_tier. Worse, its
// benefits text disagreed with all three ('Basic scheduling', 'Email support'
// where the server says 'Welcome reward'), and its colours were CSS keywords
// ('orange', 'slate') where the server uses hex ('#CD7F32'), so an org seeded
// from this button ended up materially different from one relying on the server
// default.
//
// Seeding now reads the ladder from get_org_tiers(), which returns the server's
// own defaults when an org has no rows of its own. One definition, one colour
// format, and no Lovable round-trip needed to remove the duplication.

export function LoyaltyTierEditor() {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  // Gate lives HERE, not in the callers. SettingsPage checked
  // loyalty_program_enabled before rendering this component but ClientPortalPage
  // (via LoyaltyProgramSettings) did not, so turning the loyalty program off hid
  // the editor on one page and left it editable on the other. One check, both
  // entry points. Defaults to enabled when no settings row exists.
  const { settings: orgSettings } = useOrganizationSettings();
  const loyaltyEnabled = orgSettings?.loyalty_program_enabled ?? true;
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [newBenefit, setNewBenefit] = useState('');
  // Local edit state for point thresholds (keyed by tier id)
  const [editState, setEditState] = useState<Record<string, TierEditState>>({});

  const { data: tiers = [], isLoading, error: tiersError } = useQuery({
    queryKey: ['loyalty-tier-settings', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('client_tier_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .order('tier_order', { ascending: true });

      if (error) throw error;
      
      // Parse benefits JSON
      return (data || []).map(tier => ({
        ...tier,
        benefits: Array.isArray(tier.benefits) ? tier.benefits : [],
        discount_percent: Number(tier.discount_percent ?? 0),
      })) as TierSetting[];
    },
    enabled: !!organizationId,
  });

  const initializeTiers = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization');

      // Re-check against the server before inserting. The `tiers.length === 0`
      // gate that reveals this button is a CLIENT-side check on possibly-stale
      // react-query data, so a double-click or a second open tab could insert
      // the four defaults twice and leave the org with eight tiers — which then
      // overlap, making resolve_customer_tier's ordering tie-break the thing
      // that decides a customer's tier.
      //
      // This narrows the window but does not close it: two truly concurrent
      // requests can both pass this check. A real guarantee needs a unique
      // constraint on (organization_id, tier_name) — queued as a Lovable
      // follow-up, since supabase/ is not ours to change.
      const { data: existing, error: checkErr } = await supabase
        .from('client_tier_settings')
        .select('id')
        .eq('organization_id', organizationId)
        .limit(1);
      if (checkErr) throw checkErr;
      if (existing && existing.length > 0) throw new Error('ALREADY_INITIALIZED');

      // Ask the server for the ladder rather than carrying a local copy.
      // get_org_tiers returns the built-in defaults for an org with no rows.
      const { data: defaults, error: defaultsErr } = await supabase.rpc('get_org_tiers', {
        p_organization_id: organizationId,
      });
      if (defaultsErr) throw defaultsErr;
      if (!defaults || defaults.length === 0) {
        throw new Error('NO_DEFAULTS');
      }

      const tiersToInsert = defaults.map((t: {
        tier_name: string;
        tier_order: number;
        min_spending: number;
        max_spending: number | null;
        benefits: unknown;
        discount_percent?: number;
        color: string | null;
      }) => ({
        organization_id: organizationId,
        tier_name: t.tier_name,
        tier_order: t.tier_order,
        min_spending: t.min_spending,
        max_spending: t.max_spending,
        benefits: Array.isArray(t.benefits) ? t.benefits : [],
        discount_percent: Number((t as { discount_percent?: number }).discount_percent ?? 0),
        color: t.color,
      }));

      const { error } = await supabase
        .from('client_tier_settings')
        .insert(tiersToInsert);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-tier-settings'] });
      toast.success('Loyalty tiers initialized!');
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === 'NO_DEFAULTS') {
        toast.error('Could not load the default tier ladder from the server.');
        return;
      }
      if (e instanceof Error && e.message === 'ALREADY_INITIALIZED') {
        // Not a failure: another tab or an earlier click already seeded them.
        toast.info('Tiers are already set up.');
        queryClient.invalidateQueries({ queryKey: ['loyalty-tier-settings'] });
        return;
      }
      toast.error('Failed to initialize tiers');
    },
  });

  const updateTier = useMutation({
    mutationFn: async ({ tierId, updates }: { tierId: string; updates: Partial<TierSetting> }) => {
      const { error } = await supabase
        .from('client_tier_settings')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tierId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-tier-settings'] });
      toast.success('Tier updated!');
    },
    onError: () => {
      toast.error('Failed to update tier');
    },
  });

  // Initialize local edit state when entering edit mode
  const startEditing = useCallback((tier: TierSetting) => {
    setEditState(prev => ({
      ...prev,
      [tier.id]: {
        minSpending: tier.min_spending.toString(),
        maxSpending: tier.max_spending?.toString() ?? '',
        discountPercent: (tier.discount_percent ?? 0).toString(),
      }
    }));
    setEditingTier(tier.id);
  }, []);

  // Handle local input changes (no saving)
  const handleLocalChange = useCallback((tierId: string, field: keyof TierEditState, value: string) => {
    setEditState(prev => ({
      ...prev,
      [tierId]: {
        ...prev[tierId],
        [field]: value,
      }
    }));
  }, []);

  // Save both thresholds together, after validating against every other tier.
  //
  // This deliberately replaces the previous save-on-blur behaviour. Blur-saving
  // each field independently cannot coexist with overlap validation: moving a
  // boundary means editing two numbers, and whichever is edited first
  // transiently overlaps its neighbour, so the owner would be blocked from ever
  // completing the change. Committing both at once also halves the writes.
  const saveTier = useCallback((tier: TierSetting) => {
    const state = editState[tier.id];
    if (!state) return;

    const min = state.minSpending.trim() === '' ? NaN : Number(state.minSpending);
    const max = state.maxSpending.trim() === '' ? null : Number(state.maxSpending);

    /*
      The column carries CHECK (discount_percent >= 0 AND discount_percent < 100).
      Validated here so a typo comes back as a sentence rather than a Postgres
      23514, which surfaces as "new row violates check constraint" and tells the
      owner nothing about which field or what range.
    */
    const discountRaw = state.discountPercent.trim();
    const discount = discountRaw === '' ? 0 : Number(discountRaw);
    if (!Number.isFinite(discount) || discount < 0 || discount >= 100) {
      toast.error('Discount must be a number from 0 to 99.');
      return;
    }

    const ranges: TierRange[] = tiers.map(t => ({
      id: t.id,
      tier_name: t.tier_name,
      min_spending: t.min_spending,
      max_spending: t.max_spending,
    }));

    const { error, warning } = validateTierThresholds(
      { id: tier.id, tier_name: tier.tier_name, min_spending: min, max_spending: max },
      ranges,
    );

    // Blocking errors would corrupt tier resolution; nothing is written.
    if (error) {
      toast.error(error);
      return;
    }
    // Warnings (a gap) are surfaced but allowed — the owner may be mid-way
    // through moving a boundary across two tiers.
    if (warning) toast.warning(warning);

    updateTier.mutate(
      { tierId: tier.id, updates: { min_spending: min, max_spending: max, discount_percent: discount } },
      { onSuccess: () => setEditingTier(null) },
    );
  }, [editState, tiers, updateTier]);

  const addBenefit = (tierId: string, currentBenefits: string[]) => {
    if (!newBenefit.trim()) return;
    
    const updatedBenefits = [...currentBenefits, newBenefit.trim()];
    updateTier.mutate({ tierId, updates: { benefits: updatedBenefits } });
    setNewBenefit('');
  };

  const removeBenefit = (tierId: string, currentBenefits: string[], benefitToRemove: string) => {
    const updatedBenefits = currentBenefits.filter(b => b !== benefitToRemove);
    updateTier.mutate({ tierId, updates: { benefits: updatedBenefits } });
  };

  // Icon and accent come from a tier's POSITION in this org's ladder, not from
  // its name. These used to switch on 'platinum' | 'gold' | 'silver', so every
  // org that renamed its tiers got the same orange star for all of them — the
  // same hardcoded-tier-name bug as the portal banner and progress bar.
  //
  // The rank icons ascend; a ladder longer than the list reuses the top icon,
  // which is the right degradation (more tiers, still clearly "highest").
  const RANK_ICONS = [Star, Award, Trophy, Crown];

  const getTierIcon = (index: number) => {
    const Icon = RANK_ICONS[Math.min(index, RANK_ICONS.length - 1)];
    // The org's own colour drives the tint, so a renamed/recoloured tier looks
    // like what the owner configured rather than what TidyWise's ladder used.
    return <Icon className="w-5 h-5" />;
  };

  if (!loyaltyEnabled) return null;
  if (tiersError) return <QueryError subject="loyalty tiers" onRetry={() => queryClient.invalidateQueries({ queryKey: ['loyalty-tier-settings', organizationId] })} />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (tiers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Configure Loyalty Tiers
          </CardTitle>
          <CardDescription>
            Set up your loyalty program tiers with custom benefits for each level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => initializeTiers.mutate()} disabled={initializeTiers.isPending}>
            {initializeTiers.isPending ? 'Setting up...' : 'Initialize Default Tiers'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="w-5 h-5" />
          Loyalty Tier Benefits
        </CardTitle>
        <CardDescription>
          Tiers are set by LIFETIME SPEND in dollars. Customize the thresholds and
          benefits for each level.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tiers.map((tier, index) => {
          const isEditing = editingTier === tier.id;
          const localState = editState[tier.id] || { minSpending: tier.min_spending.toString(), maxSpending: tier.max_spending?.toString() ?? '' };
          
          return (
            <div
              key={tier.id}
              className="border rounded-lg p-4 border-l-4"
              style={{ borderLeftColor: tier.color || 'hsl(var(--muted-foreground))' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span style={{ color: tier.color || 'inherit' }}>{getTierIcon(index)}</span>
                  <h4 className="font-semibold">{tier.tier_name}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {fmt(tier.min_spending)} - {tier.max_spending ? fmt(tier.max_spending) : '∞'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => isEditing ? setEditingTier(null) : startEditing(tier)}
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </Button>
                </div>
              </div>

              {/* Benefits Display */}
              <div className="flex flex-wrap gap-2 mb-3">
                {tier.benefits.map((benefit, idx) => (
                  <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                    {benefit}
                    {isEditing && (
                      <button
                        onClick={() => removeBenefit(tier.id, tier.benefits, benefit)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {tier.benefits.length === 0 && (
                  <span className="text-sm text-muted-foreground italic">No benefits configured</span>
                )}
              </div>

              {/* Edit Mode */}
              {isEditing && (
                <div className="space-y-3 pt-3 border-t">
                  {/* Add Benefit */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a benefit (e.g., '10% discount')"
                      value={newBenefit}
                      onChange={(e) => setNewBenefit(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addBenefit(tier.id, tier.benefits);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => addBenefit(tier.id, tier.benefits)}
                      disabled={!newBenefit.trim()}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Point Thresholds */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Min lifetime spend ($)</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*\.?[0-9]*"
                        value={localState.minSpending}
                        onChange={(e) => handleLocalChange(tier.id, 'minSpending', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Max lifetime spend ($, empty = unlimited)</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*\.?[0-9]*"
                        value={localState.maxSpending}
                        onChange={(e) => handleLocalChange(tier.id, 'maxSpending', e.target.value)}
                        placeholder="Unlimited"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/*
                    The ENFORCED rate, kept apart from the benefits list. Those
                    two are easily confused and mean different things: a benefit
                    is a sentence the customer reads, this is the number a price
                    check measures against. An org can legitimately have "10% off
                    every cleaning" in the benefits and 0 here — that is not a
                    bug, it means the discount is applied by hand.
                  */}
                  <div>
                    <label className="text-xs text-muted-foreground" htmlFor={`discount-${tier.id}`}>
                      Enforced discount (%) — the number the price check uses
                    </label>
                    <Input
                      id={`discount-${tier.id}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*\.?[0-9]*"
                      value={localState.discountPercent}
                      onChange={(e) => handleLocalChange(tier.id, 'discountPercent', e.target.value)}
                      placeholder="0"
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      0 to 99. Separate from the benefits list above — that is the
                      wording customers read, this is the rate. <strong>Nothing applies
                      it yet:</strong> the booking price check that will enforce it is not
                      shipped. Setting it now is safe and changes no prices.
                    </p>
                  </div>

                  {/* Explicit save: both thresholds are validated together
                      against every other tier before anything is written. */}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => saveTier(tier)}
                      disabled={updateTier.isPending}
                    >
                      {updateTier.isPending ? 'Saving...' : 'Save thresholds'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
