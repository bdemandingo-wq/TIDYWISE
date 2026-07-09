import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { MyMetric, PeerSnapshot, CohortType } from '@/hooks/useBenchmarks';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Insight {
  title: string;
  body: string;
  severity: 'opportunity' | 'warning' | 'good';
  suggested_action: string;
}

interface Props {
  organizationId: string;
  cohort: CohortType;
  myMetrics: MyMetric[];
  peerMetrics: PeerSnapshot[];
}

export function BenchmarkInsightsPanel({ organizationId, cohort, myMetrics, peerMetrics }: Props) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setInsights([]);
    try {
      const { data, error } = await supabase.functions.invoke('benchmark-ai-insights', {
        body: {
          org_id: organizationId,
          cohort,
          my_metrics: myMetrics,
          peer_metrics: peerMetrics,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        if ((data as any).error === 'rate_limited') toast.error('AI rate limit hit. Try again in a minute.');
        else if ((data as any).error === 'credits_exhausted') toast.error('AI is temporarily unavailable. Please try again shortly.');
        else toast.error('Could not generate insights.');
        return;
      }
      setInsights(((data as any)?.insights ?? []) as Insight[]);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">AI insights</h3>
        </div>
        <Button onClick={generate} disabled={loading || peerMetrics.length === 0} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {insights.length > 0 ? 'Regenerate' : 'Generate insights'}
        </Button>
      </div>

      {peerMetrics.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Not enough peer data in this cohort yet. Insights will unlock when at least 5 similar
          businesses share data.
        </p>
      )}

      {insights.length === 0 && !loading && peerMetrics.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Click <span className="font-medium">Generate insights</span> to see what the data is
          telling you.
        </p>
      )}

      <div className="space-y-3">
        {insights.map((ins, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{ins.title}</div>
              <Badge
                variant="secondary"
                className={cn(
                  ins.severity === 'warning' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                  ins.severity === 'opportunity' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                  ins.severity === 'good' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                )}
              >
                {ins.severity}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{ins.body}</p>
            {ins.suggested_action && (
              <p className="text-sm">
                <span className="font-medium">Try this:</span> {ins.suggested_action}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
