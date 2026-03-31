import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CLOSED_ENDERS = new Set([
  "ok", "okay", "thanks", "thank", "thank you", "got it", "sounds good",
  "sounds great", "perfect", "great", "good", "sure", "yep", "yes", "no",
  "noted", "done", "bye", "talk later", "will do", "received", "np",
  "no problem", "see you then", "see you", "kk", "k", "cool", "bet",
  "awesome", "alright", "all good",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

  if (!supabaseUrl || !serviceKey || !lovableApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing server config" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ── Owner lock ──────────────────────────────────────────────────────
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", "support@tidywisecleaning.com")
      .maybeSingle();

    if (!ownerProfile) {
      return new Response(
        JSON.stringify({ success: false, error: "Owner not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: ownerMemberships } = await supabase
      .from("org_memberships")
      .select("organization_id")
      .eq("user_id", ownerProfile.id)
      .eq("role", "owner");

    if (!ownerMemberships?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Owner org not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let orgId: string | null = null;
    for (const mem of ownerMemberships) {
      const { data: smsSettings } = await supabase
        .from("organization_sms_settings")
        .select("id")
        .eq("organization_id", mem.organization_id)
        .not("openphone_api_key", "is", null)
        .maybeSingle();
      if (smsSettings) {
        orgId = mem.organization_id;
        break;
      }
    }

    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: "No org with SMS settings found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Layer 1 — Hard filters (DB queries, no AI) ─────────────────────
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const { data: conversations, error: convErr } = await supabase
      .from("sms_conversations")
      .select("id, customer_name, customer_phone, last_message_at")
      .eq("organization_id", orgId)
      .lt("last_message_at", fifteenMinAgo)
      .gt("last_message_at", seventyTwoHoursAgo);

    if (convErr) {
      console.error("[scan] Error fetching conversations:", convErr.message);
      return new Response(
        JSON.stringify({ success: false, error: convErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!conversations?.length) {
      console.log("[scan] No candidate conversations in time window");
      return new Response(
        JSON.stringify({ success: true, scanned: 0, layer1: 0, layer2: 0, layer3: 0, layer4: 0, triggered: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stats = { scanned: conversations.length, layer1: 0, layer2: 0, layer3: 0, layer4: 0, triggered: 0 };

    const activeConvs = conversations;
    console.log(`[scan] ${conversations.length} conversations in time window`);

    // For each conversation check last message direction + AI dedup
    const layer1Passed: Array<{
      id: string;
      customer_name: string | null;
      customer_phone: string | null;
      lastInboundContent: string;
    }> = [];

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const conv of activeConvs) {
      // Get last message
      const { data: lastMsg } = await supabase
        .from("sms_messages")
        .select("direction, content")
        .eq("conversation_id", conv.id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastMsg) continue;
      // Skip if last message is outbound
      if (lastMsg.direction !== "inbound" && lastMsg.direction !== "incoming") continue;
      if (!lastMsg.content) continue;

      // Check if AI already replied in last 24h
      const { data: recentAiMsg } = await supabase
        .from("sms_messages")
        .select("id")
        .eq("conversation_id", conv.id)
        .in("direction", ["outbound", "outgoing"])
        .gte("sent_at", twentyFourHoursAgo)
        .eq("metadata->>ai_generated", "true")
        .limit(1)
        .maybeSingle();

      if (recentAiMsg) {
        continue; // AI already replied recently
      }

      layer1Passed.push({
        id: conv.id,
        customer_name: conv.customer_name,
        customer_phone: conv.customer_phone,
        lastInboundContent: lastMsg.content,
      });
    }

    stats.layer1 = layer1Passed.length;
    console.log(`[scan] Layer 1 passed: ${layer1Passed.length}`);

    if (!layer1Passed.length) {
      return new Response(JSON.stringify({ success: true, ...stats }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Layer 2 — Keyword pre-filter (no AI) ───────────────────────────
    const layer2Passed = layer1Passed.filter((cand) => {
      const msg = cand.lastInboundContent.trim().toLowerCase().replace(/[.!?,]/g, "");
      const words = msg.split(/\s+/);
      if (words.length <= 3 && CLOSED_ENDERS.has(msg)) return false;
      // Also check individual short phrases
      if (words.length <= 3) {
        for (const w of words) {
          if (CLOSED_ENDERS.has(w) && words.length === 1) return false;
        }
      }
      return true;
    });

    stats.layer2 = layer2Passed.length;
    console.log(`[scan] Layer 2 passed: ${layer2Passed.length} (keyword filter dropped ${layer1Passed.length - layer2Passed.length})`);

    if (!layer2Passed.length) {
      return new Response(JSON.stringify({ success: true, ...stats }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Layer 3 — AI judgment ──────────────────────────────────────────
    const layer3Passed: typeof layer2Passed = [];
    // Cap at 15 per run to avoid timeouts
    const layer2Batch = layer2Passed.slice(0, 10);
    console.log(`[scan] Processing ${layer2Batch.length} of ${layer2Passed.length} through AI`);

    for (const cand of layer2Batch) {
      const { data: recentMsgs } = await supabase
        .from("sms_messages")
        .select("direction, content")
        .eq("conversation_id", cand.id)
        .order("sent_at", { ascending: true })
        .limit(8);

      const transcript = (recentMsgs || [])
        .map((m: any) => {
          const role = m.direction === "inbound" || m.direction === "incoming" ? "Customer" : "Business";
          return `${role}: ${m.content}`;
        })
        .join("\n");

      const aiResp = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: `You are reviewing an SMS conversation for TidyWise, a professional cleaning company. The last message is from the other person and has not been replied to. Determine if this conversation needs a follow-up reply.

Say YES only if the person is:
- A potential client asking about booking, pricing, availability, or a cleaning service
- Someone who sent their address or details expecting a quote or follow-up
- A cleaner or job applicant asking about work, availability, or a job opening
- Someone with an unresolved question, complaint, or pending request
- A client or cleaner waiting on a confirmation, schedule, or assignment
- Someone expressing interest in booking but the conversation stopped

Say NO if:
- The conversation is clearly finished (confirmed, closed, thanked)
- The last message is a simple acknowledgment with nothing pending
- This looks like spam, a wrong number, or an irrelevant message
- The topic has nothing to do with cleaning services or staffing

Conversation:
${transcript}

Reply only YES or NO.`,
              },
            ],
            max_tokens: 10,
          }),
        }
      );

      if (!aiResp.ok) {
        console.error(`[scan] AI filter error for conv ${cand.id}: ${aiResp.status}`);
        continue;
      }

      const aiResult = await aiResp.json();
      const answer = (aiResult.choices?.[0]?.message?.content || "").trim().toUpperCase();

      if (answer.startsWith("YES")) {
        layer3Passed.push(cand);
      } else {
        console.log(`[scan] Layer 3 filtered conv ${cand.id} — AI said NO`);
      }
    }

    stats.layer3 = layer3Passed.length;
    console.log(`[scan] Layer 3 passed: ${layer3Passed.length}`);

    if (!layer3Passed.length) {
      return new Response(JSON.stringify({ success: true, ...stats }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Layer 4 — Rate limit per contact (3h window) ───────────────────
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const layer4Passed: typeof layer3Passed = [];

    for (const cand of layer3Passed) {
      if (!cand.customer_phone) {
        layer4Passed.push(cand);
        continue;
      }

      // Check if any outbound message was sent to this phone in last 3h across all convos
      const { data: recentOutbound } = await supabase
        .from("sms_messages")
        .select("id")
        .eq("conversation_id", cand.id)
        .in("direction", ["outbound", "outgoing"])
        .gte("sent_at", threeHoursAgo)
        .limit(1)
        .maybeSingle();

      if (recentOutbound) {
        console.log(`[scan] Layer 4 rate-limited conv ${cand.id} — outbound in last 3h`);
        continue;
      }

      layer4Passed.push(cand);
    }

    stats.layer4 = layer4Passed.length;
    console.log(`[scan] Layer 4 passed: ${layer4Passed.length}`);

    // ── Trigger AI replies ─────────────────────────────────────────────
    for (const conv of layer4Passed) {
      try {
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/openphone-ai-sms-reply`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              conversationId: conv.id,
              organizationId: orgId,
              inboundMessage: conv.lastInboundContent,
              customerPhone: conv.customer_phone,
              customerName: conv.customer_name,
            }),
          }
        );

        const result = await resp.json();
        if (result.success && !result.skipped) {
          stats.triggered++;
          console.log(`[scan] Triggered reply for conv ${conv.id}`);
        } else {
          console.log(`[scan] Skipped conv ${conv.id}: ${result.reason || "already handled"}`);
        }
      } catch (err) {
        console.error(`[scan] Error triggering reply for conv ${conv.id}:`, err);
      }
    }

    console.log(`[scan] Done — scanned=${stats.scanned} L1=${stats.layer1} L2=${stats.layer2} L3=${stats.layer3} L4=${stats.layer4} triggered=${stats.triggered}`);

    return new Response(
      JSON.stringify({ success: true, ...stats }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[scan] Fatal error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
