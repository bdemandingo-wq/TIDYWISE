import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FACEBOOK_VERIFY_TOKEN = Deno.env.get("FACEBOOK_VERIFY_TOKEN") ?? "";
  const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

  // ── GET: Meta webhook verification ──
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log("[facebook-lead-webhook] GET verification:", { mode, token, challenge });

    if (FACEBOOK_VERIFY_TOKEN && mode === 'subscribe' && token === FACEBOOK_VERIFY_TOKEN) {
      console.log("[facebook-lead-webhook] Verification SUCCESS");
      return new Response(challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.error("[facebook-lead-webhook] Verification FAILED – token mismatch");
    return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain' } });
  }

  // ── POST: Incoming lead events ──
  if (req.method === 'POST') {
    // Verify HMAC signature from Meta
    const sigHeader = req.headers.get('x-hub-signature-256') || '';
    const rawBody = await req.text();
    if (!META_APP_SECRET) {
      console.error("[facebook-lead-webhook] META_APP_SECRET not configured");
      return new Response('Server misconfigured', { status: 503 });
    }
    try {
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(META_APP_SECRET),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
      const expected = 'sha256=' + Array.from(new Uint8Array(sigBuf))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      // timing-safe-ish compare
      if (sigHeader.length !== expected.length) {
        return new Response('Forbidden', { status: 403 });
      }
      let diff = 0;
      for (let i = 0; i < expected.length; i++) diff |= sigHeader.charCodeAt(i) ^ expected.charCodeAt(i);
      if (diff !== 0) return new Response('Forbidden', { status: 403 });
    } catch (e) {
      console.error("[facebook-lead-webhook] sig verify error", e);
      return new Response('Forbidden', { status: 403 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response('Bad Request', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }

    console.log("[facebook-lead-webhook] POST payload:", JSON.stringify(body).slice(0, 1000));

    // Store raw event
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('facebook_lead_webhook_events').insert({ payload: body });
    } catch (err) {
      console.error("[facebook-lead-webhook] DB insert error:", err);
    }

    // Process leads in background (same logic as before)
    try {
      const FACEBOOK_PAGE_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
      if (body.object === 'page' && FACEBOOK_PAGE_ACCESS_TOKEN) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            if (change.field !== 'leadgen') continue;
            const leadgenId = change.value?.leadgen_id;
            const pageId = change.value?.page_id;
            if (!leadgenId) continue;

            console.log("[facebook-lead-webhook] Processing leadgen_id:", leadgenId);

            const graphRes = await fetch(
              `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}`
            );
            const leadData = await graphRes.json();
            if (leadData.error) {
              console.error("[facebook-lead-webhook] Graph API error:", leadData.error);
              continue;
            }

            const fields: Record<string, string> = {};
            for (const f of leadData.field_data || []) {
              fields[f.name?.toLowerCase()] = f.values?.[0] || '';
            }

            const firstName = fields['first_name'] || fields['full_name']?.split(' ')[0] || 'Facebook';
            const lastName = fields['last_name'] || fields['full_name']?.split(' ').slice(1).join(' ') || 'Lead';
            const email = fields['email'] || '';
            const phone = fields['phone_number'] || fields['phone'] || '';

            let organizationId: string | null = null;
            const { data: orgMatch } = await supabase
              .from('facebook_page_connections')
              .select('organization_id')
              .eq('page_id', String(pageId))
              .eq('is_active', true)
              .maybeSingle();

            if (orgMatch) {
              organizationId = orgMatch.organization_id;
            }

            if (!organizationId) {
              console.error("[facebook-lead-webhook] Cannot determine org for page_id:", pageId);
              continue;
            }

            if (email) {
              const { data: existing, error: existingErr } = await supabase
                .from('leads')
                .select('id')
                .eq('email', email.toLowerCase())
                .eq('organization_id', organizationId)
                .maybeSingle();
              if (existingErr) {
                console.error("[facebook-lead-webhook] Lead dedupe check failed, skipping to avoid a possible duplicate:", existingErr);
                continue;
              }
              if (existing) continue;
            }

            const { error: leadInsertErr } = await supabase.from('leads').insert({
              first_name: firstName.slice(0, 100),
              last_name: lastName.slice(0, 100),
              email: email ? email.toLowerCase().slice(0, 255) : null,
              phone: phone ? phone.slice(0, 20) : null,
              source: 'facebook',
              status: 'new',
              notes: `Auto-captured from Facebook Lead Ad (leadgen_id: ${leadgenId})`,
              organization_id: organizationId,
            });
            if (leadInsertErr) {
              console.error("[facebook-lead-webhook] Lead insert failed:", leadInsertErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("[facebook-lead-webhook] Lead processing error:", err);
    }

    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return new Response('Method not allowed', { status: 405, headers: { 'Content-Type': 'text/plain' } });
});
