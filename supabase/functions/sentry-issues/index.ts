// Sentry Issues proxy — fetches unresolved/actionable issues for the jointidywise org.
// Hardcoded to ORG slug to prevent cross-org leakage. Auth token is server-side only.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SENTRY_ORG = 'jointidywise';
const SENTRY_BASE = 'https://sentry.io/api/0';
const PLATFORM_SUPPORT_EMAIL = 'support@tidywisecleaning.com';

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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function decodeSentryTokenMetadata(token: string): { org?: string; url?: string; region_url?: string } | null {
  const match = token.match(/^sntrys_([^_]+)_/);
  if (!match) return null;

  try {
    const base64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch (_err) {
    return null;
  }
}

async function requirePlatformUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: 'Authentication required', status: 401 };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return { error: 'Backend auth is not configured', status: 500 };

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: 'Invalid session', status: 401 };
  if (data.user.email !== PLATFORM_SUPPORT_EMAIL) return { error: 'Platform access required', status: 403 };

  return { userId: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requirePlatformUser(req);
    if ('error' in auth) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    const token = Deno.env.get('SENTRY_AUTH_TOKEN');
    if (!token) {
      return jsonResponse({ error: 'SENTRY_AUTH_TOKEN not configured' }, 500);
    }

    const tokenMetadata = decodeSentryTokenMetadata(token);
    if (tokenMetadata?.org && tokenMetadata.org !== SENTRY_ORG) {
      return jsonResponse({ error: 'Sentry token is for a different organization' }, 403);
    }

    // Fetch unresolved & unassigned issues (actionable). Limit to 100.
    const sentryBase = `${(tokenMetadata?.region_url ?? tokenMetadata?.url ?? SENTRY_BASE.replace('/api/0', '')).replace(/\/$/, '')}/api/0`;
    const url = new URL(`${sentryBase}/organizations/${SENTRY_ORG}/issues/`);
    url.searchParams.set('query', 'is:unresolved');
    url.searchParams.set('limit', '100');
    url.searchParams.set('sort', 'freq');
    url.searchParams.set('statsPeriod', '14d');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      const missingScopeHint = res.status === 403
        ? 'The Sentry token needs org:read, project:read, and event:read scopes for this organization.'
        : undefined;

      return jsonResponse({
        error: 'Sentry API error',
        status: res.status,
        detail: text.slice(0, 500),
        hint: missingScopeHint,
      }, res.status === 403 ? 403 : 502);
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

    return jsonResponse({
        org: SENTRY_ORG,
        fetchedAt: new Date().toISOString(),
        critical: shape(grouped.critical),
        errors: shape(grouped.errors),
        warnings: shape(grouped.warnings),
      });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
