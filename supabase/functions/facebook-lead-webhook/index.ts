import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FACEBOOK_VERIFY_TOKEN = "footprint_leads_2025";

  // ── GET: Meta webhook verification ──
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log("[facebook-lead-webhook] GET verification:", { mode, token, challenge });

    if (mode === 'subscribe' && token === FACEBOOK_VERIFY_TOKEN) {
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
    let body: any;
    try {
      body = await req.json();
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
              .from('business_settings')
              .select('organization_id')
              .eq('facebook_page_id', pageId)
              .maybeSingle();

            if (orgMatch) {
              organizationId = orgMatch.organization_id;
            } else {
              const { data: allOrgs } = await supabase.from('organizations').select('id').limit(2);
              if (allOrgs && allOrgs.length === 1) organizationId = allOrgs[0].id;
            }

            if (!organizationId) {
              console.error("[facebook-lead-webhook] Cannot determine org for page_id:", pageId);
              continue;
            }

            if (email) {
              const { data: existing } = await supabase
                .from('leads')
                .select('id')
                .eq('email', email.toLowerCase())
                .eq('organization_id', organizationId)
                .maybeSingle();
              if (existing) continue;
            }

            await supabase.from('leads').insert({
              first_name: firstName.slice(0, 100),
              last_name: lastName.slice(0, 100),
              email: email ? email.toLowerCase().slice(0, 255) : null,
              phone: phone ? phone.slice(0, 20) : null,
              source: 'facebook',
              status: 'new',
              notes: `Auto-captured from Facebook Lead Ad (leadgen_id: ${leadgenId})`,
              organization_id: organizationId,
            });
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
