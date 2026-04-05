import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { organizationId, maxResults } = body;

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "organizationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get org's OpenPhone settings
    const { data: smsSettings } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      return new Response(
        JSON.stringify({ error: "OpenPhone not configured", code: "NOT_CONFIGURED" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = smsSettings.openphone_api_key;
    const phoneNumberId = smsSettings.openphone_phone_number_id;

    // Fetch calls from OpenPhone
    const limit = maxResults || 50;
    const callsUrl = `https://api.openphone.com/v1/calls?phoneNumberId=${encodeURIComponent(phoneNumberId)}&maxResults=${limit}`;

    const callsRes = await fetch(callsUrl, {
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
    });

    if (!callsRes.ok) {
      const errText = await callsRes.text();
      console.error("[sync-openphone-calls] API error:", callsRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch calls from OpenPhone", status: callsRes.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callsData = await callsRes.json();
    const calls = callsData.data || [];

    // Get all customer phones for matching
    const { data: customers } = await supabase
      .from("customers")
      .select("id, phone, first_name, last_name")
      .eq("organization_id", organizationId)
      .not("phone", "is", null);

    const { data: leads } = await supabase
      .from("leads")
      .select("id, phone, name")
      .eq("organization_id", organizationId)
      .not("phone", "is", null);

    const normalizePhone = (p: string) => {
      const digits = p.replace(/\D/g, "");
      return digits.startsWith("1") && digits.length === 11 ? digits.substring(1) : digits;
    };

    const customerMap = new Map<string, { id: string; name: string }>();
    (customers || []).forEach((c) => {
      if (c.phone) customerMap.set(normalizePhone(c.phone), { id: c.id, name: `${c.first_name} ${c.last_name}`.trim() });
    });

    const leadMap = new Map<string, { id: string; name: string }>();
    (leads || []).forEach((l) => {
      if (l.phone) leadMap.set(normalizePhone(l.phone), { id: l.id, name: l.name || "" });
    });

    let synced = 0;
    for (const call of calls) {
      const callerPhone = call.from || call.to || "";
      const externalPhone = call.direction === "inbound" ? call.from : call.to;
      const normalizedExternal = externalPhone ? normalizePhone(externalPhone) : "";
      const matchedCustomer = customerMap.get(normalizedExternal);
      const matchedLead = !matchedCustomer ? leadMap.get(normalizedExternal) : undefined;

      const callerName = call.contact?.name || matchedCustomer?.name || matchedLead?.name || null;

      const record = {
        organization_id: organizationId,
        openphone_call_id: call.id,
        direction: call.direction || "inbound",
        status: call.status || "completed",
        duration: call.duration || 0,
        caller_phone: externalPhone || callerPhone,
        caller_name: callerName,
        phone_number_id: phoneNumberId,
        started_at: call.createdAt || call.startedAt,
        ended_at: call.completedAt || call.endedAt,
        has_recording: !!call.recording,
        has_transcript: !!call.transcript,
        has_summary: false,
        has_voicemail: !!call.voicemail,
        recording_url: call.recording?.url || null,
        voicemail_url: call.voicemail?.url || null,
        voicemail_transcript: call.voicemail?.transcript || null,
        matched_customer_id: matchedCustomer?.id || null,
        matched_lead_id: matchedLead?.id || null,
        raw_data: call,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("openphone_calls")
        .upsert(record, { onConflict: "organization_id,openphone_call_id" });

      if (error) {
        console.error("[sync-openphone-calls] Upsert error:", error.message);
      } else {
        synced++;
      }
    }

    console.log(`[sync-openphone-calls] Synced ${synced}/${calls.length} calls for org ${organizationId}`);

    return new Response(
      JSON.stringify({ success: true, synced, total: calls.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[sync-openphone-calls] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
