import { useState, useCallback, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Users,
  Activity,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SEOHead } from '@/components/SEOHead';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Issue {
  id: string;
  shortId: string;
  title: string;
  culprit?: string;
  level: string;
  isUnhandled?: boolean;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  project?: string;
  message?: string;
}

interface Payload {
  fetchedAt: string;
  critical: Issue[];
  errors: Issue[];
  warnings: Issue[];
}

const SECTIONS: Array<{
  key: 'critical' | 'errors' | 'warnings';
  label: string;
  Icon: typeof AlertOctagon;
  tone: string;
  border: string;
}> = [
  { key: 'critical', label: 'Critical', Icon: AlertOctagon, tone: 'text-red-600 bg-red-50', border: 'border-l-red-500' },
  { key: 'errors', label: 'Errors', Icon: AlertTriangle, tone: 'text-orange-600 bg-orange-50', border: 'border-l-orange-500' },
  { key: 'warnings', label: 'Warnings', Icon: AlertCircle, tone: 'text-amber-600 bg-amber-50', border: 'border-l-amber-400' },
];

function IssueCard({ issue, border }: { issue: Issue; border: string }) {
  return (
    <Card className={`p-4 border-l-4 ${border} hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{issue.shortId}</span>
            {issue.isUnhandled && (
              <Badge variant="destructive" className="text-[10px] h-5">UNHANDLED</Badge>
            )}
            {issue.project && (
              <Badge variant="outline" className="text-[10px] h-5">{issue.project}</Badge>
            )}
          </div>
          <h3 className="font-semibold text-sm text-foreground line-clamp-2 break-words">
            {issue.title}
          </h3>
          {issue.culprit && (
            <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
              {issue.culprit}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {Number(issue.count).toLocaleString()} events
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {issue.userCount} users
            </span>
            <span>
              Last: {formatDistanceToNow(new Date(issue.lastSeen), { addSuffix: true })}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="shrink-0"
        >
          <a href={issue.permalink} target="_blank" rel="noopener noreferrer" aria-label="Open in Sentry">
            <ExternalLink className="w-4 h-4" />
          </a>
        </Button>
      </div>
    </Card>
  );
}

export default function ErrorsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('sentry-issues');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setData(data as Payload);
    } catch (e: any) {
      setError(e.message || 'Failed to load issues');
      toast.error('Could not load Sentry issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCount =
    (data?.critical.length ?? 0) + (data?.errors.length ?? 0) + (data?.warnings.length ?? 0);

  return (
    <AdminLayout
      title="Errors & Incidents"
      subtitle="Live unresolved issues from Sentry"
    >
      <SEOHead title="Errors & Incidents | TidyWise" description="Monitor unresolved production errors" noIndex />

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {data?.fetchedAt && (
            <>Last updated {formatDistanceToNow(new Date(data.fetchedAt), { addSuffix: true })}</>
          )}
        </div>
        <Button onClick={load} disabled={loading} size="sm" variant="outline">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="p-4 mb-6 border-l-4 border-l-red-500 bg-red-50">
          <p className="text-sm text-red-800 font-medium">Error loading issues</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && totalCount === 0 && !error && (
        <Card className="p-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">All clear</h2>
          <p className="text-sm text-muted-foreground mt-2">No active incidents.</p>
        </Card>
      )}

      {data && totalCount > 0 && (
        <div className="space-y-8">
          {SECTIONS.map(({ key, label, Icon, tone, border }) => {
            const items = data[key];
            if (items.length === 0) return null;
            return (
              <section key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">{label}</h2>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
                <div className="space-y-3">
                  {items.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} border={border} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
