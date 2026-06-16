import { useEffect, useMemo, useState } from 'react';
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
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Dismissals are persisted in `public.sentry_dismissed_issues` so the
// "Mark Fixed" state is shared across refreshes and browsers for the
// platform admin. We keep a localStorage cache so the UI hides
// known-dismissed cards instantly on first paint, before the DB query
// resolves — but the DB row is the source of truth.
const DISMISSED_CACHE_KEY = 'sentry-dismissed-issues-v1';

function loadDismissedCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DISMISSED_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDismissedCache(map: Record<string, string>) {
  try {
    localStorage.setItem(DISMISSED_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}


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
  metadata?: { environment?: string };
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
  badge: string;
}[] = [
  {
    key: 'critical',
    label: 'Critical',
    border: 'border-l-red-500',
    dot: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  {
    key: 'warning',
    label: 'Warning',
    border: 'border-l-yellow-500',
    dot: 'bg-yellow-500',
    badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  },
  {
    key: 'info',
    label: 'Info',
    border: 'border-l-blue-500',
    dot: 'bg-blue-500',
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
];

function severityFor(level: string): SeverityKey {
  if (level === 'fatal' || level === 'error') return 'critical';
  if (level === 'warning') return 'warning';
  return 'info';
}

function truncate(text: string, max = 120): string {
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

function buildFixPrompt(issue: SentryIssue): string {
  const title = issue.title || issue.culprit || '(untitled issue)';
  const env = issue.metadata?.environment || 'production';
  const events = Number(issue.count ?? 0);
  return `Fix this Sentry error in TidyWise CRM:

Error: ${title}
Environment: ${env}
Events: ${events} in last 7 days
First seen: ${relativeTime(issue.firstSeen)}
Last seen: ${relativeTime(issue.lastSeen)}

Find the root cause in the codebase and fix it. Do not break any existing functionality.`;
}

function IssueCard({ issue, border }: { issue: SentryIssue; border: string }) {
  const title = issue.title || issue.culprit || '(untitled issue)';
  const events = Number(issue.count ?? 0);
  const projectLabel = issue.project?.slug || issue.project?.name;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildFixPrompt(issue));
      setCopied(true);
      toast.success('Prompt copied — paste in Lovable', {
        duration: 2000,
        style: {
          background: '#16a34a',
          color: '#fff',
          border: '1px solid #15803d',
        },
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy prompt');
    }
  };

  return (
    <div
      className="rounded-lg shadow-sm flex flex-col gap-3 border-l-[6px] bg-[#1a1a2e] text-white"
      style={{ borderLeftColor: undefined, paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16 }}
    >
      {/* hidden trick to keep tailwind border class */}
      <div className={cn('hidden', border)} />
      <div className="flex items-start justify-between gap-3">
        <p
          className="font-medium text-white leading-snug break-words"
          style={{ fontSize: '15px' }}
          title={title}
        >
          {truncate(title)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="shrink-0 h-8 gap-1.5 text-xs bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy Fix Prompt'}</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/60">
        {projectLabel && (
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-medium text-white/80">
            {projectLabel}
          </span>
        )}
        {events > 0 && (
          <span className="font-medium text-white/80">
            {events.toLocaleString()} {events === 1 ? 'event' : 'events'}
          </span>
        )}
        <span>First seen {relativeTime(issue.firstSeen)}</span>
        <span>Last seen {relativeTime(issue.lastSeen)}</span>
      </div>
    </div>
  );
}

function IssueCardWrapper({
  issue,
  border,
  onDismiss,
}: {
  issue: SentryIssue;
  border: string;
  onDismiss: (issue: SentryIssue) => void;
}) {
  return (
    <div className={cn('rounded-lg border-l-[6px]', border)} style={{ background: '#1a1a2e' }}>
      <InnerCard issue={issue} onDismiss={onDismiss} />
    </div>
  );
}

function InnerCard({
  issue,
  onDismiss,
}: {
  issue: SentryIssue;
  onDismiss: (issue: SentryIssue) => void;
}) {
  const title = issue.title || issue.culprit || '(untitled issue)';
  const events = Number(issue.count ?? 0);
  const projectLabel = issue.project?.slug || issue.project?.name;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildFixPrompt(issue));
      setCopied(true);
      toast.success('Prompt copied — auto-hides when fixed', {
        duration: 2000,
        style: { background: '#16a34a', color: '#fff', border: '1px solid #15803d' },
      });
      // Auto-dismiss: assume the user is about to fix it. If it reappears
      // in Sentry (lastSeen advances past dismissed_at), the card returns.
      onDismiss(issue);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy prompt');
    }
  };

  return (
    <div className="py-4 px-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p
          className="font-medium text-white leading-snug break-words"
          style={{ fontSize: '15px' }}
          title={title}
        >
          {truncate(title)}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 gap-1.5 text-xs bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy Fix Prompt'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDismiss(issue)}
            title="Mark fixed and hide"
            className="h-8 gap-1.5 text-xs bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 hover:text-emerald-200"
          >
            <Check className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mark Fixed</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/60">
        {projectLabel && (
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-medium text-white/80">
            {projectLabel}
          </span>
        )}
        {events > 0 && (
          <span className="font-medium text-white/80">
            {events.toLocaleString()} {events === 1 ? 'event' : 'events'}
          </span>
        )}
        <span>First seen {relativeTime(issue.firstSeen)}</span>
        <span>Last seen {relativeTime(issue.lastSeen)}</span>
      </div>
    </div>
  );
}


function Section({
  config,
  issues,
  onDismiss,
}: {
  config: (typeof SECTIONS)[number];
  issues: SentryIssue[];
  onDismiss: (issue: SentryIssue) => void;
}) {
  const [open, setOpen] = useState(issues.length > 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between rounded-lg bg-white border shadow-sm px-5 py-4 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-3">
            <span className={cn('w-3.5 h-3.5 rounded-full', config.dot)} />
            <span className="text-lg font-bold text-slate-900 tracking-tight">{config.label}</span>
            <Badge
              variant="outline"
              className={cn(
                'h-7 px-2.5 min-w-[2rem] justify-center text-sm font-semibold border',
                config.badge,
              )}
            >
              {issues.length}
            </Badge>
          </div>
          <ChevronDown
            className={cn('w-5 h-5 text-slate-400 transition-transform', open && 'rotate-180')}
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
              <IssueCardWrapper
                key={issue.id}
                issue={issue}
                border={config.border}
                onDismiss={onDismiss}
              />
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

  // Dismissals persisted in `public.sentry_dismissed_issues`.
  // Local state mirrors the DB row map: { [issue_id]: dismissed_at ISO }.
  // We seed from localStorage so dismissals hide instantly on first paint,
  // then reconcile with the DB (source of truth) once the query resolves.
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Record<string, string>>(() =>
    loadDismissedCache(),
  );

  const { data: dbDismissed } = useQuery({
    queryKey: ['sentry-dismissed-issues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentry_dismissed_issues')
        .select('issue_id, dismissed_at');
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.issue_id] = row.dismissed_at;
      return map;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (dbDismissed) {
      setDismissed(dbDismissed);
      saveDismissedCache(dbDismissed);
    }
  }, [dbDismissed]);

  const isDismissed = (issue: SentryIssue): boolean => {
    const at = dismissed[issue.id];
    if (!at) return false;
    if (!issue.lastSeen) return true;
    return new Date(issue.lastSeen).getTime() <= new Date(at).getTime();
  };

  const persistDismissals = (next: Record<string, string>) => {
    setDismissed(next);
    saveDismissedCache(next);
  };

  const handleDismiss = async (issue: SentryIssue) => {
    const now = new Date().toISOString();
    const previous = dismissed;
    const next = { ...dismissed, [issue.id]: now };
    persistDismissals(next);

    const { error } = await supabase
      .from('sentry_dismissed_issues')
      .upsert(
        {
          issue_id: issue.id,
          dismissed_at: now,
          last_seen_at_dismiss: issue.lastSeen ?? null,
        },
        { onConflict: 'issue_id' },
      );

    if (error) {
      persistDismissals(previous);
      toast.error(`Couldn't save dismissal: ${error.message}`);
      return;
    }

    toast.success('Marked fixed — removed from dashboard', {
      duration: 4000,
      action: {
        label: 'Undo',
        onClick: async () => {
          const copy = { ...next };
          delete copy[issue.id];
          persistDismissals(copy);
          await supabase
            .from('sentry_dismissed_issues')
            .delete()
            .eq('issue_id', issue.id);
          queryClient.invalidateQueries({ queryKey: ['sentry-dismissed-issues'] });
        },
      },
    });
    queryClient.invalidateQueries({ queryKey: ['sentry-dismissed-issues'] });
  };

  const clearDismissed = async () => {
    const previous = dismissed;
    persistDismissals({});
    const ids = Object.keys(previous);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('sentry_dismissed_issues')
      .delete()
      .in('issue_id', ids);
    if (error) {
      persistDismissals(previous);
      toast.error(`Couldn't restore: ${error.message}`);
      return;
    }
    toast.success('Restored all hidden issues');
    queryClient.invalidateQueries({ queryKey: ['sentry-dismissed-issues'] });
  };

  const grouped = useMemo(() => {
    const buckets: Record<SeverityKey, SentryIssue[]> = { critical: [], warning: [], info: [] };
    for (const issue of data ?? []) {
      const level = (issue.level ?? 'error').toLowerCase();
      if (level === 'debug') continue;
      if (isDismissed(issue)) continue;
      buckets[severityFor(level)].push(issue);
    }
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dismissed]);

  const total = grouped.critical.length + grouped.warning.length + grouped.info.length;
  const hiddenCount = Object.keys(dismissed).length;

  // Silence unused-warning for legacy component kept for diff safety
  void IssueCard;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Errors &amp; Incidents</h2>
          <p className="text-sm text-slate-500">
            Unresolved Sentry issues
            {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDismissed}
              className="gap-1.5 text-slate-600"
            >
              <RotateCcw className="w-4 h-4" />
              Restore hidden
            </Button>
          )}
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
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

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

      {!isLoading && !isError && total === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-10 flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="w-12 h-12 text-green-600" />
          <p className="text-base font-semibold text-green-800">
            All clear — no active incidents.
          </p>
        </div>
      )}

      {!isLoading && !isError && total > 0 && (
        <div className="space-y-4">
          {SECTIONS.map((config) => (
            <Section
              key={config.key}
              config={config}
              issues={grouped[config.key]}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}


      {isFetching && !isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Refreshing…
        </div>
      )}
    </div>
  );
}
