import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface DispatchBody {
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  test_webhook_id?: string; // when set, only dispatches to this webhook
}

const MAX_ATTEMPTS = 4;
// Exponential backoff with jitter: ~0.5s, 1.5s, 4s
const BACKOFF_MS = [500, 1500, 4000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function deliverWithRetry(url: string, body: string) {
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      lastStatus = resp.status;
      if (resp.ok) {
        return { success: true, status: resp.status, attempts: attempt, error: null as string | null };
      }
      // Retry on 5xx and 429; give up on other 4xx
      if (resp.status < 500 && resp.status !== 429) {
        lastError = await resp.text().catch(() => null);
        return { success: false, status: resp.status, attempts: attempt, error: lastError };
      }
      lastError = await resp.text().catch(() => null);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < MAX_ATTEMPTS) {
      const base = BACKOFF_MS[attempt - 1] ?? 4000;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(base + jitter);
    }
  }
  return { success: false, status: lastStatus, attempts: MAX_ATTEMPTS, error: lastError };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as DispatchBody;
    const { organization_id, event_type, payload, test_webhook_id } = body || ({} as DispatchBody);

    if (!organization_id || !event_type) {
      return new Response(
        JSON.stringify({ error: 'organization_id and event_type are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let query = supabase
      .from('org_zapier_webhooks')
      .select('id, webhook_url, organization_id, event_type, is_active')
      .eq('organization_id', organization_id)
      .eq('is_active', true);

    if (test_webhook_id) {
      query = query.eq('id', test_webhook_id);
    } else {
      query = query.eq('event_type', event_type);
    }

    const { data: hooks, error } = await query;
    if (error) {
      console.error('zapier-dispatch lookup error', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const envelope = {
      event: event_type,
      organization_id,
      occurred_at: new Date().toISOString(),
      data: payload ?? {},
    };
    const envelopeBody = JSON.stringify(envelope);

    const results = await Promise.all(
      (hooks ?? []).map(async (hook) => {
        const r = await deliverWithRetry(hook.webhook_url, envelopeBody);
        await supabase.from('zapier_dispatch_log').insert({
          organization_id,
          webhook_id: hook.id,
          event_type,
          status_code: r.status,
          success: r.success,
          error_message: r.success
            ? null
            : `[attempts:${r.attempts}] ${r.error ?? 'delivery failed'}`,
          payload: envelope,
        });
        return {
          webhook_id: hook.id,
          status: r.status,
          success: r.success,
          attempts: r.attempts,
          error: r.error,
        };
      }),
    );

    return new Response(
      JSON.stringify({ dispatched: results.length, envelope, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('zapier-dispatch error', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
