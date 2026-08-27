import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquareText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { QueryError } from '@/components/QueryError';
import { format } from 'date-fns';

interface CancellationFeedbackRow {
  id: string;
  canceled_at: string;
  reason: string;
  feedback_text: string | null;
  kept_text?: string | null;
  competitor_name: string | null;
  missing_feature: string | null;
  plan: string | null;
  user_email: string | null;
  eligible_for_winback: boolean;
}

const REASON_LABELS: Record<string, string> = {
  too_expensive: 'Too expensive',
  missing_feature: 'Missing feature',
  switching_crm: 'Switching CRM',
  not_using: 'Not using it',
  closing_business: 'Closing business',
  other: 'Other',
};

/**
 * CancellationFeedbackPanel — exit-survey answers from every self-cancel,
 * shown on the platform-admin Churn tab so the "why they left" data is
 * one place instead of buried in the database.
 */
export function CancellationFeedbackPanel() {
  const { data: rows, isLoading, error: rowsError } = useQuery({
    queryKey: ['platform-cancellation-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cancellation_feedback')
        .select('*')
        .order('canceled_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as CancellationFeedbackRow[];
    },
  });

  // Reason distribution for a quick read on the biggest churn drivers
  const reasonCounts = (rows || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] || 0) + 1;
    return acc;
  }, {});
  const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquareText className="w-5 h-5 text-primary" />
          Cancellation Feedback
          <Badge variant="secondary" className="ml-auto">
            {rows?.length ?? 0} responses
          </Badge>
        </CardTitle>
        {sortedReasons.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {sortedReasons.map(([reason, count]) => (
              <Badge key={reason} variant="outline" className="text-xs">
                {REASON_LABELS[reason] || reason}: {count}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {rowsError ? (
          <QueryError subject="cancellation feedback" />
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (rows || []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No cancellation feedback yet — that's a good thing.
          </p>
        ) : (
          <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
            {(rows || []).map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="destructive" className="text-[10px]">
                    {REASON_LABELS[r.reason] || r.reason}
                  </Badge>
                  {r.plan && <Badge variant="outline" className="text-[10px]">{r.plan}</Badge>}
                  <span className="text-muted-foreground">
                    {format(new Date(r.canceled_at), 'MMM d, yyyy')}
                  </span>
                  {r.user_email && (
                    <span className="text-muted-foreground truncate">{r.user_email}</span>
                  )}
                </div>
                {r.feedback_text && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Why: </span>
                    {r.feedback_text}
                  </p>
                )}
                {r.kept_text && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Would've stayed for: </span>
                    {r.kept_text}
                  </p>
                )}
                {(r.competitor_name || r.missing_feature) && (
                  <p className="text-xs text-muted-foreground">
                    {r.competitor_name && <>Switched to: {r.competitor_name} · </>}
                    {r.missing_feature && <>Missing: {r.missing_feature}</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
