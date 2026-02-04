import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Gift, Star, Trophy, Crown, Users, TrendingUp, Award } from 'lucide-react';
import { format } from 'date-fns';
import { useOrganization } from '@/contexts/OrganizationContext';
import { LoyaltyTierEditor } from './LoyaltyTierEditor';

interface CustomerLoyalty {
  id: string;
  customer_id: string;
  points: number;
  lifetime_points: number;
  tier: string;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

interface LoyaltyTransaction {
  id: string;
  customer_id: string;
  points: number;
  transaction_type: string;
  description: string | null;
  created_at: string;
}

export function LoyaltyProgramSettings() {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLoyalty | null>(null);
  const [bonusPoints, setBonusPoints] = useState('');

  const { data: loyaltyMembers = [], isLoading } = useQuery({
    queryKey: ['loyalty-members', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('customer_loyalty')
        .select(`
          id, customer_id, points, lifetime_points, tier,
          customer:customers!inner(first_name, last_name, email, organization_id)
        `)
        .eq('customer.organization_id', organizationId)
        .order('lifetime_points', { ascending: false });

      if (error) throw error;
      return data as CustomerLoyalty[];
    },
    enabled: !!organizationId,
  });

  const { data: recentTransactions = [] } = useQuery({
    queryKey: ['loyalty-transactions-recent', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      // Get customer IDs for this org first, then filter transactions
      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId);
      
      const customerIds = customers?.map(c => c.id) || [];
      if (customerIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('*')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as LoyaltyTransaction[];
    },
    enabled: !!organizationId,
  });

  const addBonusPoints = useMutation({
    mutationFn: async ({ customerId, points }: { customerId: string; points: number }) => {
      // Add transaction
      const { error: txError } = await supabase
        .from('loyalty_transactions')
        .insert({
          customer_id: customerId,
          points,
          transaction_type: 'bonus',
          description: 'Bonus points awarded by admin',
        });

      if (txError) throw txError;

      // Update customer loyalty
      const { data: current, error: fetchError } = await supabase
        .from('customer_loyalty')
        .select('points, lifetime_points')
        .eq('customer_id', customerId)
        .single();

      if (fetchError) throw fetchError;

      const newPoints = (current?.points || 0) + points;
      const newLifetime = (current?.lifetime_points || 0) + points;
      const newTier = calculateTier(newLifetime);

      const { error: updateError } = await supabase
        .from('customer_loyalty')
        .update({ 
          points: newPoints, 
          lifetime_points: newLifetime,
          tier: newTier 
        })
        .eq('customer_id', customerId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-members'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-transactions-recent'] });
      toast.success('Bonus points added!');
      setBonusPoints('');
      setSelectedCustomer(null);
    },
    onError: () => {
      toast.error('Failed to add bonus points');
    },
  });

  const calculateTier = (lifetimePoints: number): string => {
    if (lifetimePoints >= 5000) return 'platinum';
    if (lifetimePoints >= 2000) return 'gold';
    if (lifetimePoints >= 500) return 'silver';
    return 'bronze';
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'platinum': return <Crown className="w-4 h-4" />;
      case 'gold': return <Trophy className="w-4 h-4" />;
      case 'silver': return <Award className="w-4 h-4" />;
      default: return <Star className="w-4 h-4" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'platinum': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'gold': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'silver': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-orange-100 text-orange-700 border-orange-200';
    }
  };

  const stats = {
    totalMembers: loyaltyMembers.length,
    totalPoints: loyaltyMembers.reduce((sum, m) => sum + m.points, 0),
    platinumMembers: loyaltyMembers.filter(m => m.tier === 'platinum').length,
    goldMembers: loyaltyMembers.filter(m => m.tier === 'gold').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalMembers}</p>
                <p className="text-xs text-muted-foreground">Total Members</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Gift className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalPoints.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Active Points</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Crown className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.platinumMembers}</p>
                <p className="text-xs text-muted-foreground">Platinum Members</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.goldMembers}</p>
                <p className="text-xs text-muted-foreground">Gold Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Benefits Editor */}
      <LoyaltyTierEditor />

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loyalty Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loyaltyMembers.length === 0 ? (
            <div className="text-center py-8">
              <Gift className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No loyalty members yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Customers automatically join after their first completed booking
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {loyaltyMembers.map((member) => (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={getTierColor(member.tier)}>
                      {getTierIcon(member.tier)}
                      <span className="ml-1 capitalize">{member.tier}</span>
                    </Badge>
                    <div>
                      <p className="font-medium">
                        {member.customer?.first_name} {member.customer?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{member.customer?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-bold text-primary">{member.points.toLocaleString()} pts</p>
                      <p className="text-xs text-muted-foreground">
                        Lifetime: {member.lifetime_points.toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCustomer(member)}
                    >
                      Add Points
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Bonus Points Dialog */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50" onClick={() => setSelectedCustomer(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Add Bonus Points</CardTitle>
              <CardDescription>
                Add bonus points for {selectedCustomer.customer?.first_name} {selectedCustomer.customer?.last_name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Current Points: {selectedCustomer.points}</p>
                <Input
                  type="number"
                  placeholder="Enter points to add"
                  value={bonusPoints}
                  onChange={(e) => setBonusPoints(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedCustomer(null)}>
                  Cancel
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => addBonusPoints.mutate({
                    customerId: selectedCustomer.customer_id,
                    points: parseInt(bonusPoints) || 0
                  })}
                  disabled={!bonusPoints || addBonusPoints.isPending}
                >
                  Add Points
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {recentTransactions.slice(0, 10).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div>
                    <Badge variant="outline" className={
                      tx.transaction_type === 'earned' ? 'bg-emerald-50 text-emerald-700' :
                      tx.transaction_type === 'bonus' ? 'bg-blue-50 text-blue-700' :
                      tx.transaction_type === 'redeemed' ? 'bg-orange-50 text-orange-700' :
                      'bg-gray-50 text-gray-700'
                    }>
                      {tx.transaction_type}
                    </Badge>
                    <span className="ml-2 text-muted-foreground">{tx.description}</span>
                  </div>
                  <div className="text-right">
                    <span className={tx.points >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                      {tx.points >= 0 ? '+' : ''}{tx.points} pts
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
