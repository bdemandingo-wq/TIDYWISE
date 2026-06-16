import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  RefreshCw,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Raw Sentry issue shape returned by the `sentry-issues` edge function (proxy).
interface SentryIssue {
  id: string;
  title?: string;
  culprit?: string;
  level?: string;
  status?: string;
  count?: string | number;
  userCount?: number;
  firstSeen?: string | null;
  lastSeen?: string | null;
  permalink?: string | null;
  project?: { slug?: string; name?: string };
}

interface SentryProxyError {
  error?: string;
  status?: number;
  detail?: string;
  hint?: string;
}

type SeverityKey = 'critical' | 'warning' | 'info';

const SECTIONS: {
  key: SeverityKey;
  label: string;
  border: string;
  dot: string;
}[] = [
  { key: 'critical', label: 'Critical', border: 'border-l-red-500', dot: 'bg-red-500' },
  { key: 'warning', label: 'Warning', border: 'border-l-yellow-500', dot: 'bg-yellow-500' },
  { key: 'info', label: 'Info', border: 'border-l-blue-500', dot: 'bg-blue-500' },
];

// fatal/error -> critical, warning -> warning, everything else -> info.
function severityFor(level: string): SeverityKey {
  if (level === 'fatal' || level === 'error') return 'critical';
  if (level === 'warning') return 'warning';
  return 'info';
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return `${formatDistanceToNow(new Date(iso))} ago`;
  } catch {
    return '—';
  }
}

function IssueCard({ issue, border }: { issue: SentryIssue; border: string }) {
  const title = issue.title || issue.culprit || '(untitled issue)';
  const events = Number(issue.count ?? 0);
  const projectLabel = issue.project?.slug || issue.project?.name;

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-l-4 shadow-sm p-4 flex flex-col gap-3',
        border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-sm font-medium text-slate-900 leading-snug break-words"
          title={title}
        >
          {truncate(title)}
        </p>
        {issue.permalink && (
          <Button asChild variant="outline" size="sm" className="shrink-0 h-8 gap-1.5 text-xs">
            <a href={issue.permalink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">View in Sentry</span>
            </a>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        {projectLabel && (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {projectLabel}
          </span>
        )}
        {events > 0 && (
          <span className="font-medium text-slate-700">
            {events.toLocaleString()} {events === 1 ? 'event' : 'events'}
          </span>
        )}
        <span>First seen {relativeTime(issue.firstSeen)}</span>
        <span>Last seen {relativeTime(issue.lastSeen)}</span>
      </div>
    </div>
  );
}

function Section({ config, issues }: { config: (typeof SECTIONS)[number]; issues: SentryIssue[] }) {
  // Collapsed by default when empty.
  const [open, setOpen] = useState(issues.length > 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between rounded-lg bg-white border shadow-sm px-4 py-3 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2.5">
            <span className={cn('w-2.5 h-2.5 rounded-full', config.dot)} />
            <span className="text-sm font-semibold text-slate-900">{config.label}</span>
            <Badge variant="secondary" className="h-5 min-w-[1.25rem] justify-center">
              {issues.length}
            </Badge>
          </div>
          <ChevronDown
            className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pt-3">
          {issues.length === 0 ? (
            <p className="text-sm text-slate-400 px-4 py-2">
              No {config.label.toLowerCase()} issues.
            </p>
          ) : (
            issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} border={config.border} />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ErrorsIncidentsPanel() {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['sentry-issues'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sentry-issues');
      if (error) throw error;
      // The proxy returns the raw Sentry array on success, or { error } on failure.
      if (data && !Array.isArray(data) && data.error) {
        const proxyError = data as SentryProxyError;
        const message = [proxyError.error, proxyError.detail, proxyError.hint]
          .filter(Boolean)
          .join(' — ');
        throw new Error(message || 'Sentry request failed');
      }
      return (Array.isArray(data) ? data : []) as SentryIssue[];
    },
    refetchOnWindowFocus: false,
  });

  const grouped = useMemo(() => {
    const buckets: Record<SeverityKey, SentryIssue[]> = { critical: [], warning: [], info: [] };
    for (const issue of data ?? []) {
      const level = (issue.level ?? 'error').toLowerCase();
      if (level === 'debug') continue; // noise
      buckets[severityFor(level)].push(issue);
    }
    return buckets;
  }, [data]);

  const total = grouped.critical.length + grouped.warning.length + grouped.info.length;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Errors &amp; Incidents</h2>
          <p className="text-sm text-slate-500">Unresolved Sentry issues</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-800">Couldn’t load incidents</p>
            <p className="text-red-700 mt-1">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      )}

      {/* Empty state — all clear */}
      {!isLoading && !isError && total === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-10 flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="w-12 h-12 text-green-600" />
          <p className="text-base font-semibold text-green-800">
            All clear — no active incidents.
          </p>
        </div>
      )}

      {/* Sections */}
      {!isLoading && !isError && total > 0 && (
        <div className="space-y-4">
          {SECTIONS.map((config) => (
            <Section key={config.key} config={config} issues={grouped[config.key]} />
          ))}
        </div>
      )}

      {/* Refreshing indicator on subsequent loads */}
      {isFetching && !isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Refreshing…
        </div>
      )}
    </div>
  );
}
