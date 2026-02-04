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

interface TierSetting {
  id: string;
  tier_name: string;
  min_spending: number;
  max_spending: number | null;
  benefits: string[];
  color: string | null;
  tier_order: number;
}

// Local editing state for a tier
interface TierEditState {
  minSpending: string;
  maxSpending: string;
}

const defaultTiers: Omit<TierSetting, 'id'>[] = [
  { tier_name: 'Bronze', min_spending: 0, max_spending: 499, benefits: ['Basic scheduling', 'Email support'], color: 'orange', tier_order: 1 },
  { tier_name: 'Silver', min_spending: 500, max_spending: 1999, benefits: ['Standard scheduling', 'Email support'], color: 'slate', tier_order: 2 },
  { tier_name: 'Gold', min_spending: 2000, max_spending: 4999, benefits: ['Priority scheduling', '5% discount on services', 'Phone support'], color: 'amber', tier_order: 3 },
  { tier_name: 'Platinum', min_spending: 5000, max_spending: null, benefits: ['VIP scheduling', '10% discount on services', 'Free add-on per visit', 'Dedicated support'], color: 'purple', tier_order: 4 },
];

export function LoyaltyTierEditor() {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [newBenefit, setNewBenefit] = useState('');
  // Local edit state for point thresholds (keyed by tier id)
  const [editState, setEditState] = useState<Record<string, TierEditState>>({});

  const { data: tiers = [], isLoading } = useQuery({
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
      })) as TierSetting[];
    },
    enabled: !!organizationId,
  });

  const initializeTiers = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization');
      
      const tiersToInsert = defaultTiers.map(tier => ({
        ...tier,
        organization_id: organizationId,
        benefits: tier.benefits,
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
    onError: () => {
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
      }
    }));
    setEditingTier(tier.id);
  }, []);

  // Handle local input changes (no saving)
  const handleLocalChange = useCallback((tierId: string, field: 'minSpending' | 'maxSpending', value: string) => {
    setEditState(prev => ({
      ...prev,
      [tierId]: {
        ...prev[tierId],
        [field]: value,
      }
    }));
  }, []);

  // Save threshold on blur
  const saveThreshold = useCallback((tierId: string, field: 'min_spending' | 'max_spending') => {
    const state = editState[tierId];
    if (!state) return;

    const rawValue = field === 'min_spending' ? state.minSpending : state.maxSpending;
    const numValue = rawValue === '' ? null : parseFloat(rawValue);

    updateTier.mutate({ tierId, updates: { [field]: numValue } });
  }, [editState, updateTier]);

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

  const getTierIcon = (tierName: string) => {
    switch (tierName.toLowerCase()) {
      case 'platinum': return <Crown className="w-5 h-5 text-purple-500" />;
      case 'gold': return <Trophy className="w-5 h-5 text-amber-500" />;
      case 'silver': return <Award className="w-5 h-5 text-slate-500" />;
      default: return <Star className="w-5 h-5 text-orange-500" />;
    }
  };

  const getTierBorderColor = (tierName: string) => {
    switch (tierName.toLowerCase()) {
      case 'platinum': return 'border-l-purple-500';
      case 'gold': return 'border-l-amber-500';
      case 'silver': return 'border-l-slate-400';
      default: return 'border-l-orange-500';
    }
  };

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
          Customize the benefits customers receive at each loyalty level
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tiers.map((tier) => {
          const isEditing = editingTier === tier.id;
          const localState = editState[tier.id] || { minSpending: tier.min_spending.toString(), maxSpending: tier.max_spending?.toString() ?? '' };
          
          return (
            <div
              key={tier.id}
              className={`border rounded-lg p-4 border-l-4 ${getTierBorderColor(tier.tier_name)}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {getTierIcon(tier.tier_name)}
                  <h4 className="font-semibold">{tier.tier_name}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {tier.min_spending.toLocaleString()} - {tier.max_spending ? tier.max_spending.toLocaleString() : '∞'} pts
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => isEditing ? setEditingTier(null) : startEditing(tier)}
                  >
                    {isEditing ? 'Done' : 'Edit'}
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
                      <label className="text-xs text-muted-foreground">Min Points</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*\.?[0-9]*"
                        value={localState.minSpending}
                        onChange={(e) => handleLocalChange(tier.id, 'minSpending', e.target.value)}
                        onBlur={() => saveThreshold(tier.id, 'min_spending')}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Max Points (empty = unlimited)</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*\.?[0-9]*"
                        value={localState.maxSpending}
                        onChange={(e) => handleLocalChange(tier.id, 'maxSpending', e.target.value)}
                        onBlur={() => saveThreshold(tier.id, 'max_spending')}
                        placeholder="Unlimited"
                        className="mt-1"
                      />
                    </div>
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
