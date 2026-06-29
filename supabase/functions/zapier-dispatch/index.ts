import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface DispatchBody {
  organization_id: string;
  event_type: string;
  payload?: Record<string, unknown>;
  test_webhook_id?: string;
  // When set, re-dispatches a stored log row's payload to its original webhook
  retry_log_id?: string;
  // When set, performs a lightweight ping to validate a single webhook URL
  validate_webhook_id?: string;
}

const MAX_ATTEMPTS = 4;
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

async function checkAndFireAlert(
  supabase: ReturnType<typeof createClient>,
  organization_id: string,
) {
  try {
    const { data: settings } = await supabase
      .from('org_zapier_alert_settings')
      .select('*')
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (!settings || !(settings as any).enabled) return;
    const s: any = settings;
    const windowMs = (s.window_minutes ?? 15) * 60_000;
    const cooldownMs = (s.cooldown_minutes ?? 30) * 60_000;
    if (s.last_alerted_at && Date.now() - new Date(s.last_alerted_at).getTime() < cooldownMs) {
      return;
    }
    const since = new Date(Date.now() - windowMs).toISOString();
    const { count } = await supabase
      .from('zapier_dispatch_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .eq('success', false)
      .gte('created_at', since);
    const fails = count ?? 0;
    if (fails < (s.failure_threshold ?? 5)) return;

    const title = 'Zapier delivery failures';
    const message = `${fails} Zapier dispatch failure${fails === 1 ? '' : 's'} in the last ${s.window_minutes} minutes. Check Settings → Integrations → Dispatch log.`;

    if (s.notify_inapp) {
      await supabase.from('admin_system_notifications').insert({
        organization_id,
        type: 'zapier_failure_alert',
        title,
        message,
        link: '/admin/settings?tab=integrations',
        metadata: { fails, window_minutes: s.window_minutes },
        dedupe_key: `zapier_alert_${organization_id}_${Math.floor(Date.now() / cooldownMs)}`,
      });
    }

    if (s.notify_email && s.recipient_email) {
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            to: s.recipient_email,
            subject: `[Alert] ${title}`,
            html: `<p>${message}</p>`,
            purpose: 'transactional',
            template_name: 'zapier_failure_alert',
          },
        });
      } catch (_) { /* email is best-effort */ }
    }

    await supabase
      .from('org_zapier_alert_settings')
      .update({ last_alerted_at: new Date().toISOString() })
      .eq('organization_id', organization_id);
  } catch (e) {
    console.warn('alert check failed', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as DispatchBody;
    const { organization_id, event_type, payload, test_webhook_id, retry_log_id, validate_webhook_id } =
      body || ({} as DispatchBody);

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // --- Validate-only mode: ping the webhook with a minimal payload ---
    if (validate_webhook_id) {
      const { data: hook, error: hErr } = await supabase
        .from('org_zapier_webhooks')
        .select('id, webhook_url, organization_id')
        .eq('id', validate_webhook_id)
        .eq('organization_id', organization_id)
        .maybeSingle();
      if (hErr || !hook) {
        return new Response(JSON.stringify({ error: 'webhook not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const pingBody = JSON.stringify({
        event: 'webhook.validate',
        organization_id,
        occurred_at: new Date().toISOString(),
        data: { ping: true },
      });
      const r = await deliverWithRetry((hook as any).webhook_url, pingBody);
      return new Response(
        JSON.stringify({ validated: true, success: r.success, status: r.status, error: r.error }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Retry mode: re-send a stored failed log row ---
    if (retry_log_id) {
      const { data: logRow, error: lErr } = await supabase
        .from('zapier_dispatch_log')
        .select('id, organization_id, webhook_id, event_type, payload')
        .eq('id', retry_log_id)
        .eq('organization_id', organization_id)
        .maybeSingle();
      if (lErr || !logRow) {
        return new Response(JSON.stringify({ error: 'log row not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const lr: any = logRow;
      if (!lr.webhook_id) {
        return new Response(JSON.stringify({ error: 'original webhook no longer exists' }), {
          status: 410,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: hook } = await supabase
        .from('org_zapier_webhooks')
        .select('id, webhook_url')
        .eq('id', lr.webhook_id)
        .eq('organization_id', organization_id)
        .maybeSingle();
      if (!hook) {
        return new Response(JSON.stringify({ error: 'webhook not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const envelope = lr.payload ?? {
        event: lr.event_type,
        organization_id,
        occurred_at: new Date().toISOString(),
        data: {},
      };
      const r = await deliverWithRetry((hook as any).webhook_url, JSON.stringify(envelope));
      await supabase.from('zapier_dispatch_log').insert({
        organization_id,
        webhook_id: lr.webhook_id,
        event_type: lr.event_type,
        status_code: r.status,
        success: r.success,
        error_message: r.success ? null : `[retry attempts:${r.attempts}] ${r.error ?? 'delivery failed'}`,
        payload: envelope,
      });
      if (!r.success) await checkAndFireAlert(supabase, organization_id);
      return new Response(
        JSON.stringify({ retried: true, success: r.success, status: r.status, attempts: r.attempts, error: r.error }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!event_type) {
      return new Response(JSON.stringify({ error: 'event_type is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let query = supabase
      .from('org_zapier_webhooks')
      .select('id, webhook_url, organization_id, event_type, is_active')
      .eq('organization_id', organization_id)
      .eq('is_active', true);

    if (test_webhook_id) query = query.eq('id', test_webhook_id);
    else query = query.eq('event_type', event_type);

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
      (hooks ?? []).map(async (hook: any) => {
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

    if (results.some((r) => !r.success)) {
      await checkAndFireAlert(supabase, organization_id);
    }

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
