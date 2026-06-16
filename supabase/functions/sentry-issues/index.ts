// Sentry Issues proxy — fetches unresolved/actionable issues for the jointidywise org.
// Hardcoded to ORG slug to prevent cross-org leakage. Auth token is server-side only.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SENTRY_ORG = 'jointidywise';
const SENTRY_BASE = 'https://sentry.io/api/0';

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit?: string;
  level: string;
  status: string;
  isUnhandled?: boolean;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  project?: { slug: string; name: string };
  metadata?: { value?: string; type?: string };
}

function bucket(issue: SentryIssue): 'critical' | 'errors' | 'warnings' {
  const level = (issue.level || '').toLowerCase();
  if (level === 'fatal' || issue.isUnhandled) return 'critical';
  if (level === 'warning' || level === 'info') return 'warnings';
  return 'errors';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('SENTRY_AUTH_TOKEN');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'SENTRY_AUTH_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch unresolved & unassigned issues (actionable). Limit to 100.
    const url = new URL(`${SENTRY_BASE}/organizations/${SENTRY_ORG}/issues/`);
    url.searchParams.set('query', 'is:unresolved');
    url.searchParams.set('limit', '100');
    url.searchParams.set('sort', 'freq');
    url.searchParams.set('statsPeriod', '14d');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: 'Sentry API error', status: res.status, detail: text.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const issues: SentryIssue[] = await res.json();

    const grouped = { critical: [] as SentryIssue[], errors: [] as SentryIssue[], warnings: [] as SentryIssue[] };
    for (const issue of issues) {
      if (issue.status && issue.status !== 'unresolved') continue;
      grouped[bucket(issue)].push(issue);
    }

    const shape = (list: SentryIssue[]) =>
      list.map((i) => ({
        id: i.id,
        shortId: i.shortId,
        title: i.title,
        culprit: i.culprit,
        level: i.level,
        isUnhandled: i.isUnhandled,
        count: i.count,
        userCount: i.userCount,
        firstSeen: i.firstSeen,
        lastSeen: i.lastSeen,
        permalink: i.permalink,
        project: i.project?.slug,
        message: i.metadata?.value,
      }));

    return new Response(
      JSON.stringify({
        org: SENTRY_ORG,
        fetchedAt: new Date().toISOString(),
        critical: shape(grouped.critical),
        errors: shape(grouped.errors),
        warnings: shape(grouped.warnings),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
