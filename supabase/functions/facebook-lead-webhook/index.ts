import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mapMetaFieldData,
  buildLeadRow,
  resolveOrgFromConnection,
  classifyIngestionClaim,
} from "../_shared/facebook-lead-mapping.ts";


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

    // Store raw event (tenant-stamped so per-org briefs can filter it)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const eventPageId = body?.entry?.[0]?.changes?.[0]?.value?.page_id ?? body?.entry?.[0]?.id;
      let eventOrgId: string | null = null;
      if (eventPageId) {
        const { data: conn } = await supabase
          .from('facebook_page_connections')
          .select('organization_id')
          .eq('page_id', String(eventPageId))
          .eq('is_active', true)
          .maybeSingle();
        eventOrgId = conn?.organization_id ?? null;
      }
      await supabase.from('facebook_lead_webhook_events').insert({ payload: body, organization_id: eventOrgId });
    } catch (err) {
      console.error("[facebook-lead-webhook] DB insert error:", err);
    }

    // Process leads in background (same logic as before)
    try {
      // Env token is now only a fallback for pages with no token of their own.
      const ENV_PAGE_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
      if (body.object === 'page') {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            if (change.field !== 'leadgen') continue;
            const leadgenId = change.value?.leadgen_id;
            const pageId = change.value?.page_id;
            if (!leadgenId) continue;

            console.log("[facebook-lead-webhook] Processing leadgen_id:", leadgenId);

            // 1. Which tenant? Select all three columns the module needs, and
            //    do NOT filter on is_active in SQL - let the module tell the
            //    difference between "not mapped" and "inactive" so the log
            //    says which. Capture BOTH data and error.
            const { data: connection, error: connError } = await supabase
              .from('facebook_page_connections')
              .select('organization_id, page_access_token, is_active')
              .eq('page_id', String(pageId))
              .maybeSingle();

            const resolution = resolveOrgFromConnection({
              pageId,
              connection,
              queryError: connError,
            });
            if (!resolution.ok) {
              console.error(
                `[facebook-lead-webhook] dropping leadgen_id=${leadgenId}: ${resolution.reason}`,
              );
              continue;
            }
            const { organizationId, pageAccessToken } = resolution;

            // 2. Per-page token, env var only as fallback.
            const token = pageAccessToken ?? ENV_PAGE_ACCESS_TOKEN;
            if (!token) {
              console.error(
                `[facebook-lead-webhook] no page access token for page_id=${pageId}`,
              );
              continue;
            }

            // 3. Fetch the lead. leadgenId comes from an inbound request, so
            //    it must be escaped before going into a URL.
            const graphRes = await fetch(
              `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}` +
              `?access_token=${encodeURIComponent(token)}`,
            );
            const leadData = await graphRes.json();
            if (leadData.error) {
              console.error("[facebook-lead-webhook] Graph API error:", leadData.error);
              continue;
            }

            // 4. Map via the shared module. Do not inline this.
            const fields = mapMetaFieldData(leadData.field_data);
            const row = buildLeadRow({ fields, leadgenId, organizationId });

            // 5. Skip a same-email lead already in this org. Only meaningful
            //    for real emails - phone-only leads get a synthesized address
            //    that is unique per leadgen_id, which step 6 handles instead.
            if (fields.email) {
              const { data: existing, error: dupErr } = await supabase
                .from('leads')
                .select('id')
                .eq('email', fields.email)
                .eq('organization_id', organizationId)
                .maybeSingle();
              if (dupErr) {
                console.error("[facebook-lead-webhook] dedupe check failed, skipping:", dupErr);
                continue;
              }
              if (existing) {
                console.log(
                  `[facebook-lead-webhook] duplicate email, skipping leadgen_id=${leadgenId}`,
                );
                continue;
              }
            }

            // 6. Claim the leadgen_id immediately before inserting, so a Meta
            //    retry cannot produce a second lead.
            const { error: claimErr } = await supabase
              .from('facebook_lead_ingestions')
              .insert({ leadgen_id: leadgenId, organization_id: organizationId });
            const claim = classifyIngestionClaim(claimErr);
            if (claim === 'failed') {
              console.error(
                `[facebook-lead-webhook] claim insert failed for leadgen_id=${leadgenId}:`,
                claimErr,
              );
              continue;
            }
            if (claim === 'duplicate') {
              // A claim row exists. If it never received a lead_id then a
              // previous attempt died between claiming and inserting - that is
              // an orphan, not a duplicate, and skipping it would lose a paid
              // lead permanently. Fall through and retry the insert.
              const { data: prior } = await supabase
                .from('facebook_lead_ingestions')
                .select('lead_id')
                .eq('leadgen_id', leadgenId)
                .maybeSingle();
              if (prior?.lead_id) {
                console.log(
                  `[facebook-lead-webhook] leadgen_id=${leadgenId} already ingested as lead ${prior.lead_id}, skipping`,
                );
                continue;
              }
              console.warn(
                `[facebook-lead-webhook] orphaned claim for leadgen_id=${leadgenId}, retrying insert`,
              );
            }

            // 7. Insert. `row` comes from buildLeadRow and contains exactly
            //    the seven columns public.leads has: name, email, phone,
            //    source, status, notes, organization_id. There is NO
            //    first_name or last_name on that table, and email is NOT NULL.
            const { data: inserted, error: leadInsertErr } = await supabase
              .from('leads')
              .insert(row)
              .select('id')
              .single();

            if (leadInsertErr) {
              console.error(
                `[facebook-lead-webhook] lead insert FAILED for leadgen_id=${leadgenId}:`,
                leadInsertErr,
              );
              // Release the claim so a genuine Meta retry can still succeed.
              await supabase
                .from('facebook_lead_ingestions')
                .delete()
                .eq('leadgen_id', leadgenId);
            } else {
              await supabase
                .from('facebook_lead_ingestions')
                .update({ lead_id: inserted.id })
                .eq('leadgen_id', leadgenId);
              console.log(
                `[facebook-lead-webhook] created lead ${inserted.id} org=${organizationId} leadgen_id=${leadgenId}`,
              );
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
