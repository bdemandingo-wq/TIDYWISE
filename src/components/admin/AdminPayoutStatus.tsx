import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { Badge } from '@/components/ui/badge';
import { Banknote, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface AdminPayoutStatusProps {
  staffId: string;
  staffName: string;
}

export function AdminPayoutStatus({ staffId, staffName }: AdminPayoutStatusProps) {
  const { organizationId } = useOrgId();

  const { data: payoutAccount, isLoading } = useQuery({
    queryKey: ['admin-staff-payout', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_payout_accounts')
        .select('*')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!staffId && !!organizationId,
  });

  const getStatusBadge = () => {
    if (!payoutAccount) {
      return <Badge variant="outline" className="text-muted-foreground"><AlertCircle className="w-3 h-3 mr-1" />Not Set Up</Badge>;
    }
    switch (payoutAccount.account_status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
      case 'pending_verification':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'onboarding':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Clock className="w-3 h-3 mr-1" />Incomplete</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Not Set Up</Badge>;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-2">
          <Banknote className="w-4 h-4" />
          Payout Status
        </p>
        {getStatusBadge()}
      </div>
      {payoutAccount?.bank_last4 && (
        <p className="text-xs text-muted-foreground">
          Bank: •••• {payoutAccount.bank_last4}
        </p>
      )}
      {!payoutAccount && (
        <p className="text-xs text-muted-foreground">
          {staffName} hasn't set up their payout account yet.
        </p>
      )}
    </div>
  );
}
