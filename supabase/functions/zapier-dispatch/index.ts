import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface DispatchBody {
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  test_webhook_id?: string; // when set, only dispatches to this webhook (used by "Send test")
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

    const results = await Promise.all(
      (hooks ?? []).map(async (hook) => {
        try {
          const resp = await fetch(hook.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(envelope),
          });
          const success = resp.ok;
          await supabase.from('zapier_dispatch_log').insert({
            organization_id,
            webhook_id: hook.id,
            event_type,
            status_code: resp.status,
            success,
            error_message: success ? null : await resp.text().catch(() => null),
            payload: envelope,
          });
          return { webhook_id: hook.id, status: resp.status, success };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabase.from('zapier_dispatch_log').insert({
            organization_id,
            webhook_id: hook.id,
            event_type,
            status_code: null,
            success: false,
            error_message: msg,
            payload: envelope,
          });
          return { webhook_id: hook.id, success: false, error: msg };
        }
      }),
    );

    return new Response(JSON.stringify({ dispatched: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('zapier-dispatch error', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
