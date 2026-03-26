import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CheckCircle2, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StaffComplianceDashboardProps {
  organizationId: string;
}

interface StaffCompliance {
  id: string;
  name: string;
  email: string;
  hasAvailability: boolean;
  docsStatus: 'complete' | 'pending' | 'missing';
  sigsStatus: 'complete' | 'none_required' | 'incomplete';
  payoutStatus: 'active' | 'pending' | 'not_started';
  percentage: number;
}

export function StaffComplianceDashboard({ organizationId }: StaffComplianceDashboardProps) {
  const { data: complianceData = [], isLoading } = useQuery({
    queryKey: ['staff-compliance', organizationId],
    queryFn: async () => {
      // Get active staff
      const { data: staffList } = await supabase
        .from('staff')
        .select('id, name, email')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (!staffList?.length) return [];

      const staffIds = staffList.map(s => s.id);

      // Batch fetch all compliance data
      const [docsResult, sigsResult, payoutResult, availResult, signableDocsResult] = await Promise.all([
        supabase.from('staff_documents').select('staff_id, document_type, status').eq('organization_id', organizationId).in('staff_id', staffIds),
        supabase.from('staff_signatures').select('staff_id, signable_document_id').in('staff_id', staffIds),
        supabase.from('staff_payout_accounts').select('staff_id, account_status').eq('organization_id', organizationId).in('staff_id', staffIds),
        supabase.from('working_hours').select('staff_id').in('staff_id', staffIds),
        supabase.from('staff_signable_documents').select('id').eq('organization_id', organizationId).eq('is_active', true),
      ]);

      const docs = docsResult.data || [];
      const sigs = sigsResult.data || [];
      const payouts = payoutResult.data || [];
      const avails = availResult.data || [];
      const signableDocs = signableDocsResult.data || [];

      const requiredDocTypes = ['w9', 'government_id'];
      const totalSignable = signableDocs.length;
      const signableIds = signableDocs.map(d => d.id);

      return staffList.map((staff): StaffCompliance => {
        // Availability
        const hasAvailability = avails.some(a => a.staff_id === staff.id);

        // Documents
        const staffDocs = docs.filter(d => d.staff_id === staff.id && requiredDocTypes.includes(d.document_type));
        const approvedDocs = staffDocs.filter(d => d.status === 'approved');
        const docsStatus: 'complete' | 'pending' | 'missing' =
          approvedDocs.length >= requiredDocTypes.length ? 'complete' :
          staffDocs.length > 0 ? 'pending' : 'missing';

        // Signatures
        const staffSigs = sigs.filter(s => s.staff_id === staff.id && signableIds.includes(s.signable_document_id));
        const sigsStatus: 'complete' | 'none_required' | 'incomplete' =
          totalSignable === 0 ? 'none_required' :
          staffSigs.length >= totalSignable ? 'complete' : 'incomplete';

        // Payouts
        const payout = payouts.find(p => p.staff_id === staff.id);
        const payoutStatus: 'active' | 'pending' | 'not_started' =
          payout?.account_status === 'active' ? 'active' :
          payout ? 'pending' : 'not_started';

        // Calculate percentage
        let completed = 0;
        const total = 4;
        if (hasAvailability) completed++;
        if (docsStatus === 'complete') completed++;
        if (sigsStatus === 'complete' || sigsStatus === 'none_required') completed++;
        if (payoutStatus === 'active') completed++;

        return {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          hasAvailability,
          docsStatus,
          sigsStatus,
          payoutStatus,
          percentage: Math.round((completed / total) * 100),
        };
      }).sort((a, b) => a.percentage - b.percentage); // Show least complete first
    },
    enabled: !!organizationId,
  });

  if (isLoading) return null;
  if (!complianceData.length) return null;

  const fullyCompliant = complianceData.filter(s => s.percentage === 100).length;
  const overallPercent = complianceData.length > 0
    ? Math.round(complianceData.reduce((sum, s) => sum + s.percentage, 0) / complianceData.length)
    : 0;

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

  const StatusIcon = ({ status }: { status: 'complete' | 'pending' | 'missing' | 'none_required' | 'incomplete' | 'active' | 'not_started' }) => {
    if (status === 'complete' || status === 'active' || status === 'none_required') {
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    }
    if (status === 'pending') {
      return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
    }
    return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Staff Compliance
          </CardTitle>
          <Badge variant="outline" className={cn(
            'text-xs',
            overallPercent >= 80 ? 'text-green-500 border-green-500/30' : 'text-yellow-500 border-yellow-500/30'
          )}>
            {fullyCompliant}/{complianceData.length} ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {complianceData.map((staff) => (
          <div key={staff.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="text-xs">{getInitials(staff.name)}</AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium truncate">{staff.name}</p>
                <span className="text-xs text-muted-foreground ml-2">{staff.percentage}%</span>
              </div>
              <Progress value={staff.percentage} className="h-1.5 mb-1.5" />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <StatusIcon status={staff.hasAvailability ? 'complete' : 'missing'} />
                  Hours
                </span>
                <span className="flex items-center gap-1">
                  <StatusIcon status={staff.docsStatus} />
                  Docs
                </span>
                <span className="flex items-center gap-1">
                  <StatusIcon status={staff.sigsStatus} />
                  Sigs
                </span>
                <span className="flex items-center gap-1">
                  <StatusIcon status={staff.payoutStatus} />
                  Payout
                </span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
