import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, DollarSign, TrendingUp, Gift, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Referral {
  id: string;
  referral_code: string;
  referred_email: string;
  referred_name: string | null;
  status: string;
  credit_amount: number;
  credit_awarded: boolean;
  created_at: string;
  completed_at: string | null;
  referrer: {
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  signed_up: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-red-100 text-red-700',
};

export function ReferralDashboard() {
  const { organization } = useOrganization();

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['referrals-admin', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('referrals')
        .select(`
          id, referral_code, referred_email, referred_name, status,
          credit_amount, credit_awarded, created_at, completed_at,
          referrer:customers!referrals_referrer_customer_id_fkey(first_name, last_name, email, organization_id)
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Referral[];
    },
    enabled: !!organization?.id,
  });

  const totalReferrals = referrals.length;
  const converted = referrals.filter(r => r.status === 'completed').length;
  const totalCreditAwarded = referrals.filter(r => r.credit_awarded).reduce((s, r) => s + r.credit_amount, 0);
  const conversionRate = totalReferrals > 0 ? Math.round((converted / totalReferrals) * 100) : 0;

  const markCredited = async (id: string) => {
    const { error } = await supabase.from('referrals').update({ credit_awarded: true, status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    if (error) toast.error('Failed: ' + error.message);
    else toast.success('Marked as credited');
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-5"><div className="flex items-center gap-3"><Users className="w-8 min-h-[44px] text-blue-500 bg-blue-50 rounded-lg p-1.5" /><div><p className="text-2xl font-bold">{totalReferrals}</p><p className="text-xs text-muted-foreground">Total Referrals</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center gap-3"><TrendingUp className="w-8 min-h-[44px] text-emerald-500 bg-emerald-50 rounded-lg p-1.5" /><div><p className="text-2xl font-bold">{converted}</p><p className="text-xs text-muted-foreground">Converted</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center gap-3"><DollarSign className="w-8 min-h-[44px] text-amber-500 bg-amber-50 rounded-lg p-1.5" /><div><p className="text-2xl font-bold">${totalCreditAwarded.toFixed(0)}</p><p className="text-xs text-muted-foreground">Credits Issued</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="flex items-center gap-3"><Gift className="w-8 min-h-[44px] text-purple-500 bg-purple-50 rounded-lg p-1.5" /><div><p className="text-2xl font-bold">{conversionRate}%</p><p className="text-xs text-muted-foreground">Conversion Rate</p></div></div></CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : referrals.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No referrals yet. Share your clients' referral codes to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead>Referred</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        {r.referrer ? `${r.referrer.first_name} ${r.referrer.last_name}` : '—'}
                        {r.referrer?.email && <p className="text-xs text-muted-foreground">{r.referrer.email}</p>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.referred_name || r.referred_email}
                        <p className="text-xs text-muted-foreground">{r.referred_email}</p>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => { navigator.clipboard.writeText(r.referral_code); toast.success('Copied'); }}
                          className="font-mono text-xs bg-muted px-2 py-1 rounded flex items-center gap-1 hover:bg-muted/80"
                        >
                          {r.referral_code}
                          <Copy className="w-3 h-3" />
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100'}`}>
                          {r.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.credit_awarded
                          ? <span className="text-xs text-emerald-600 font-medium">${r.credit_amount} issued</span>
                          : <span className="text-xs text-muted-foreground">${r.credit_amount} pending</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {!r.credit_awarded && r.status !== 'expired' && (
                          <Button size="sm" variant="outline" className="text-xs min-h-[44px]" onClick={() => markCredited(r.id)}>
                            Mark Credited
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
