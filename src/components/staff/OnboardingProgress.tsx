import { useQuery } from '@tanstack/react-query';
import { combinedPhase } from '@/lib/queryState';
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
  taxClassification?: string | null;
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

export function OnboardingProgress({ staffId, organizationId, onNavigate, taxClassification }: OnboardingProgressProps) {
  /*
    Every read below THROWS on error. It used to destructure only `data`, so a
    failed query became `[]` / `undefined` / `false` and the checklist rendered
    steps the cleaner had already finished as "Not Set". §5.1 names this exact
    case: never render a count on failure, because "1/4 steps complete" reads
    as a statement about the cleaner rather than about the request.
  */
  // Check documents status
  const docsQ = useQuery({
    queryKey: ['onboarding-docs', staffId, organizationId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_documents')
        .select('id, document_type, status')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Check signatures status
  const sigsQ = useQuery({
    queryKey: ['onboarding-sigs', staffId, organizationId],
    staleTime: 0,
    refetchOnMount: 'always',
    // Returns [] when no documents are required and an object otherwise —
    // the consumer at sigData branches on Array.isArray. Annotated rather
    // than normalised, so this stays a pure typing change.
    queryFn: async (): Promise<{ required: number; signed: number } | []> => {
      const { data: docs, error: docsErr } = await supabase
        .from('staff_signable_documents')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      if (docsErr) throw docsErr;

      // Genuinely none required — a real "nothing to do", not a failure.
      if (!docs?.length) return [];

      const { data: sigs, error: sigsErr } = await supabase
        .from('staff_signatures')
        .select('id, signable_document_id')
        .eq('staff_id', staffId)
        .in('signable_document_id', docs.map(d => d.id));
      if (sigsErr) throw sigsErr;

      return { required: docs.length, signed: sigs?.length ?? 0 };
    },
  });

  // Check payout status
  const payoutQ = useQuery({
    queryKey: ['onboarding-payout', staffId, organizationId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_payout_accounts')
        .select('account_status, details_submitted, payouts_enabled')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Check availability
  const availQ = useQuery({
    queryKey: ['onboarding-avail', staffId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('working_hours')
        .select('id')
        .eq('staff_id', staffId)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });

  const documents = docsQ.data ?? [];
  const signatures = sigsQ.data ?? [];
  const payoutStatus = payoutQ.data;
  const hasAvailability = availQ.data;

  /*
    A failed read must not become a count. The card hides itself when every
    step is complete, so on error we cannot know whether to hide — and
    guessing either way is a claim. Say what happened instead, and keep the
    reassurance explicit: nothing the cleaner already did has been lost.
  */
  const phase = combinedPhase([docsQ, sigsQ, payoutQ, availQ]);

  /*
    Offline is checked before loading, not folded into it. A PAUSED query has
    isPending true, so the loading gate below would swallow this case and show
    a skeleton that never resolves — better than the original bug, which
    rendered finished steps as "Not Set", but still a lie: an endless spinner
    says "nearly there" when the honest answer is "no signal".
  */
  if (phase === 'offline') {
    return (
      <Card className="mb-6 border-primary/20">
        <CardContent className="pt-5 pb-4 px-4 sm:px-6" role="status">
          <h3 className="font-semibold text-base">Complete Your Onboarding</h3>
          <p className="text-sm text-muted-foreground mt-1">You&rsquo;re offline.</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your progress is saved. This will load when you have a signal again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const loadError = phase === 'error';
  if (loadError) {
    return (
      <Card className="mb-6 border-primary/20">
        <CardContent className="pt-5 pb-4 px-4 sm:px-6" role="alert">
          <h3 className="font-semibold text-base">Complete Your Onboarding</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Couldn&rsquo;t load your setup.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Steps you have already finished are unaffected.
          </p>
          <button
            type="button"
            onClick={() => {
              docsQ.refetch();
              sigsQ.refetch();
              payoutQ.refetch();
              availQ.refetch();
            }}
            className="mt-2 text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  /*
    Loading is its own state. While a read is still in flight there is no data
    to count, so `documents = []` would render finished steps as "Not Set" —
    the same false claim as the error case, just briefer. A cached result makes
    the query `success`, not `pending`, so this does not flash on warm loads.
  */
  const isLoading = phase === 'loading';
  if (isLoading) {
    return (
      <Card className="mb-6 border-primary/20">
        <CardContent className="pt-5 pb-4 px-4 sm:px-6">
          <h3 className="font-semibold text-base">Complete Your Onboarding</h3>
          <div className="mt-2 h-2 w-full rounded-full bg-muted animate-pulse" />
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
            <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
          </div>
          <span className="sr-only">Loading your onboarding steps</span>
        </CardContent>
      </Card>
    );
  }

  // Build steps
  const isW2 = taxClassification === 'w2';
  // Upload UI saves Government ID as document_type 'id'; older data may use
  // 'government_id'. Match either so the step can actually complete.
  const requiredDocGroups: string[][] = isW2
    ? [['id', 'government_id']]
    : [['w9'], ['id', 'government_id']];
  const groupsWithApproved = requiredDocGroups.filter(group =>
    documents.some(d => group.includes(d.document_type) && d.status === 'approved')
  );
  const groupsWithUpload = requiredDocGroups.filter(group =>
    documents.some(d => group.includes(d.document_type))
  );
  const docsComplete = groupsWithApproved.length >= requiredDocGroups.length;
  const docsPending = groupsWithUpload.length > 0 && !docsComplete;
  const uploadedDocs = groupsWithUpload;
  const requiredDocTypes = requiredDocGroups;

  /* The query returns [] when nothing is required and an object otherwise;
     sigsQ.data is typed, so the `any[]` cast this used to need is gone. */
  const sigData = signatures;
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
      description: isW2 ? 'Government ID required' : 'W-9 and Government ID required',
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
                ? 'bg-success/10 text-success border-success/30'
                : progressPercent >= 50
                ? 'bg-warning/10 text-warning border-warning/30'
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
                  ? 'bg-success/5 hover:bg-success/10'
                  : 'bg-muted/50 hover:bg-muted'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0',
                  step.completed ? 'text-success' : step.status === 'pending' ? 'text-warning' : 'text-muted-foreground'
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
                      ? 'bg-success/10 text-success border-success/30'
                      : step.status === 'pending'
                      ? 'bg-warning/10 text-warning border-warning/30'
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
