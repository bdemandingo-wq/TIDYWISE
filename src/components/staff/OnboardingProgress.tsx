import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, FileText, PenLine, Banknote, Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingProgressProps {
  staffId: string;
  organizationId: string;
  onNavigate?: (tab: string) => void;
}

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  tab: string;
  completed: boolean;
  status: 'complete' | 'pending' | 'not_started';
  statusLabel: string;
}

export function OnboardingProgress({ staffId, organizationId, onNavigate }: OnboardingProgressProps) {
  // Check documents status
  const { data: documents = [] } = useQuery({
    queryKey: ['onboarding-docs', staffId, organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_documents')
        .select('id, document_type, status')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId);
      return data || [];
    },
  });

  // Check signatures status
  const { data: signatures = [] } = useQuery({
    queryKey: ['onboarding-sigs', staffId, organizationId],
    queryFn: async () => {
      const { data: docs } = await supabase
        .from('staff_signable_documents')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (!docs?.length) return [];

      const { data: sigs } = await supabase
        .from('staff_signatures')
        .select('id, signable_document_id')
        .eq('staff_id', staffId)
        .in('signable_document_id', docs.map(d => d.id));

      return { required: docs.length, signed: sigs?.length || 0 };
    },
  });

  // Check payout status
  const { data: payoutStatus } = useQuery({
    queryKey: ['onboarding-payout', staffId, organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_payout_accounts')
        .select('account_status, details_submitted, payouts_enabled')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      return data;
    },
  });

  // Check availability
  const { data: hasAvailability } = useQuery({
    queryKey: ['onboarding-avail', staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from('working_hours')
        .select('id')
        .eq('staff_id', staffId)
        .limit(1);
      return (data?.length || 0) > 0;
    },
  });

  // Build steps
  const requiredDocTypes = ['w9', 'government_id'];
  const uploadedApprovedDocs = documents.filter(
    d => requiredDocTypes.includes(d.document_type) && d.status === 'approved'
  );
  const uploadedDocs = documents.filter(d => requiredDocTypes.includes(d.document_type));
  const docsComplete = uploadedApprovedDocs.length >= requiredDocTypes.length;
  const docsPending = uploadedDocs.length > 0 && !docsComplete;

  const sigData = signatures as { required: number; signed: number } | any[];
  const sigsRequired = Array.isArray(sigData) ? 0 : sigData?.required || 0;
  const sigsSigned = Array.isArray(sigData) ? 0 : sigData?.signed || 0;
  const sigsComplete = sigsRequired > 0 ? sigsSigned >= sigsRequired : false;
  const noSignaturesNeeded = sigsRequired === 0;

  const payoutComplete = payoutStatus?.account_status === 'active';
  const payoutPending = payoutStatus?.account_status === 'pending_verification' || payoutStatus?.account_status === 'onboarding';

  const availComplete = hasAvailability === true;

  const steps: OnboardingStep[] = [
    {
      id: 'availability',
      label: 'Set Availability',
      description: 'Configure your working hours',
      icon: <Clock className="w-5 h-5" />,
      tab: 'availability',
      completed: availComplete,
      status: availComplete ? 'complete' : 'not_started',
      statusLabel: availComplete ? 'Complete' : 'Not Set',
    },
    {
      id: 'documents',
      label: 'Upload Documents',
      description: 'W-9 and Government ID required',
      icon: <FileText className="w-5 h-5" />,
      tab: 'documents',
      completed: docsComplete,
      status: docsComplete ? 'complete' : docsPending ? 'pending' : 'not_started',
      statusLabel: docsComplete ? 'Approved' : docsPending ? 'Pending Review' : `${uploadedDocs.length}/${requiredDocTypes.length} uploaded`,
    },
    {
      id: 'signatures',
      label: 'Sign Agreements',
      description: noSignaturesNeeded ? 'No documents to sign yet' : `${sigsSigned}/${sigsRequired} signed`,
      icon: <PenLine className="w-5 h-5" />,
      tab: 'signatures',
      completed: sigsComplete || noSignaturesNeeded,
      status: sigsComplete || noSignaturesNeeded ? 'complete' : sigsSigned > 0 ? 'pending' : 'not_started',
      statusLabel: noSignaturesNeeded ? 'None Required' : sigsComplete ? 'All Signed' : `${sigsSigned}/${sigsRequired}`,
    },
    {
      id: 'payouts',
      label: 'Set Up Payouts',
      description: 'Connect your bank for direct deposits',
      icon: <Banknote className="w-5 h-5" />,
      tab: 'payouts',
      completed: payoutComplete,
      status: payoutComplete ? 'complete' : payoutPending ? 'pending' : 'not_started',
      statusLabel: payoutComplete ? 'Active' : payoutPending ? 'In Progress' : 'Not Started',
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);
  const allComplete = completedCount === steps.length;

  if (allComplete) return null; // Hide when fully onboarded

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardContent className="pt-5 pb-4 px-4 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-base">Complete Your Onboarding</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount}/{steps.length} steps complete
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'text-xs font-medium',
              progressPercent >= 75
                ? 'bg-green-500/10 text-green-500 border-green-500/30'
                : progressPercent >= 50
                ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {progressPercent}%
          </Badge>
        </div>

        {/* Progress bar */}
        <Progress value={progressPercent} className="h-2 mb-4" />

        {/* Steps */}
        <div className="space-y-2">
          {steps.map((step) => (
            <button
              key={step.id}
              onClick={() => onNavigate?.(step.tab)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
                step.completed
                  ? 'bg-green-500/5 hover:bg-green-500/10'
                  : 'bg-muted/50 hover:bg-muted'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0',
                  step.completed ? 'text-green-500' : step.status === 'pending' ? 'text-yellow-500' : 'text-muted-foreground'
                )}
              >
                {step.completed ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  step.icon
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', step.completed && 'line-through text-muted-foreground')}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">{step.description}</p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] px-1.5 py-0',
                    step.status === 'complete'
                      ? 'bg-green-500/10 text-green-500 border-green-500/30'
                      : step.status === 'pending'
                      ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
                      : 'text-muted-foreground'
                  )}
                >
                  {step.statusLabel}
                </Badge>
                {!step.completed && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
