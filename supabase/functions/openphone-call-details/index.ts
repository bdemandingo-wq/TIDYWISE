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

    const { organizationId, callId, detailType } = await req.json();

    if (!organizationId || !callId) {
      return new Response(
        JSON.stringify({ error: "organizationId and callId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get org's OpenPhone settings
    const { data: smsSettings } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!smsSettings?.openphone_api_key) {
      return new Response(
        JSON.stringify({ error: "OpenPhone not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = smsSettings.openphone_api_key;
    const headers = { Authorization: apiKey, "Content-Type": "application/json" };

    const result: Record<string, unknown> = {};

    // Fetch requested detail type(s)
    const types = detailType ? [detailType] : ["summary", "transcript", "recording", "voicemail"];

    for (const type of types) {
      try {
        let url = "";
        switch (type) {
          case "summary":
            url = `https://api.openphone.com/v1/call-summaries/${callId}`;
            break;
          case "transcript":
            url = `https://api.openphone.com/v1/call-transcripts/${callId}`;
            break;
          case "recording":
            url = `https://api.openphone.com/v1/call-recordings/${callId}`;
            break;
          case "voicemail":
            url = `https://api.openphone.com/v1/call-voicemails/${callId}`;
            break;
          default:
            continue;
        }

        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          result[type] = data.data || data;
        } else {
          const status = res.status;
          if (status === 404) {
            result[type] = null;
          } else if (status === 403) {
            result[type] = { unavailable: true, reason: "Requires OpenPhone Business or Scale plan" };
          } else {
            result[type] = { unavailable: true, reason: `API returned ${status}` };
          }
        }
      } catch (fetchErr) {
        console.error(`[openphone-call-details] Error fetching ${type}:`, fetchErr);
        result[type] = { unavailable: true, reason: "Fetch error" };
      }
    }

    // Cache results in the database
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (result.summary && !(result.summary as any)?.unavailable) {
      updateData.ai_summary = typeof result.summary === "string" ? result.summary : (result.summary as any)?.summary || JSON.stringify(result.summary);
      updateData.has_summary = true;
    }
    if (result.transcript && !(result.transcript as any)?.unavailable) {
      updateData.transcript = result.transcript;
      updateData.has_transcript = true;
    }
    if (result.recording && !(result.recording as any)?.unavailable) {
      updateData.recording_url = (result.recording as any)?.url || (result.recording as any)?.media?.url;
      updateData.has_recording = true;
    }
    if (result.voicemail && !(result.voicemail as any)?.unavailable) {
      updateData.voicemail_url = (result.voicemail as any)?.url || (result.voicemail as any)?.media?.url;
      updateData.voicemail_transcript = (result.voicemail as any)?.transcript;
      updateData.has_voicemail = true;
    }

    if (Object.keys(updateData).length > 1) {
      await supabase
        .from("openphone_calls")
        .update(updateData)
        .eq("organization_id", organizationId)
        .eq("openphone_call_id", callId);
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[openphone-call-details] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
