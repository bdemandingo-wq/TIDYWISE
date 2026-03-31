import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Find the owner org that has SMS settings configured
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

    // Pick the org that has SMS settings with an API key
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


    // ── Step 1 — Find candidate conversations ──────────────────────────
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: conversations, error: convErr } = await supabase
      .from("sms_conversations")
      .select("id, customer_name, customer_phone, last_message_at")
      .eq("organization_id", orgId)
      .lt("last_message_at", tenMinAgo)
      .gt("last_message_at", fortyEightHoursAgo);

    if (convErr) {
      console.error("[scan-unresponded] Error fetching conversations:", convErr.message);
      return new Response(
        JSON.stringify({ success: false, error: convErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!conversations?.length) {
      console.log("[scan-unresponded] No candidate conversations found");
      return new Response(
        JSON.stringify({ success: true, scanned: 0, filtered: 0, triggered: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For each conversation, check if the last message is inbound
    const candidates: Array<{
      id: string;
      customer_name: string | null;
      customer_phone: string | null;
      lastInboundContent: string;
    }> = [];

    for (const conv of conversations) {
      const { data: lastMsg } = await supabase
        .from("sms_messages")
        .select("direction, content")
        .eq("conversation_id", conv.id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        lastMsg &&
        (lastMsg.direction === "inbound" || lastMsg.direction === "incoming") &&
        lastMsg.content
      ) {
        candidates.push({
          id: conv.id,
          customer_name: conv.customer_name,
          customer_phone: conv.customer_phone,
          lastInboundContent: lastMsg.content,
        });
      }
    }

    console.log(
      `[scan-unresponded] Scanned ${conversations.length} conversations, ${candidates.length} have unanswered inbound`
    );

    if (!candidates.length) {
      return new Response(
        JSON.stringify({ success: true, scanned: conversations.length, filtered: 0, triggered: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 2 — AI filter for closed-ended conversations ──────────────
    const needsReply: typeof candidates = [];

    for (const cand of candidates) {
      const { data: recentMsgs } = await supabase
        .from("sms_messages")
        .select("direction, content")
        .eq("conversation_id", cand.id)
        .order("sent_at", { ascending: true })
        .limit(6);

      const transcript = (recentMsgs || [])
        .map((m: any) => {
          const role =
            m.direction === "inbound" || m.direction === "incoming"
              ? "Customer"
              : "Business";
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
            model: "google/gemini-2.0-flash-001",
            messages: [
              {
                role: "user",
                content: `Review this SMS conversation. The last message is from the customer/staff. Does this conversation clearly require a follow-up response? Answer only YES or NO. Say NO if the last message is a closed-ended statement like 'ok', 'thanks', 'got it', 'sounds good', 'no problem', 'perfect', a one-word reply, or anything that naturally ends the conversation. Say YES only if there is an unanswered question, a request that hasn't been addressed, a complaint, pricing inquiry, scheduling request, or anything that clearly expects a reply.\n\nConversation:\n${transcript}`,
              },
            ],
            max_tokens: 10,
          }),
        }
      );

      if (!aiResp.ok) {
        console.error(
          `[scan-unresponded] AI filter error for conv ${cand.id}: ${aiResp.status}`
        );
        continue;
      }

      const aiResult = await aiResp.json();
      const answer = (aiResult.choices?.[0]?.message?.content || "")
        .trim()
        .toUpperCase();

      if (answer.startsWith("YES")) {
        needsReply.push(cand);
      } else {
        console.log(
          `[scan-unresponded] Filtered out conv ${cand.id} — AI said NO`
        );
      }
    }

    console.log(
      `[scan-unresponded] ${needsReply.length} conversations passed AI filter`
    );

    // ── Step 3 — Trigger AI reply ──────────────────────────────────────
    let triggered = 0;

    for (const conv of needsReply) {
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
          triggered++;
          console.log(`[scan-unresponded] Triggered reply for conv ${conv.id}`);
        } else {
          console.log(
            `[scan-unresponded] Skipped conv ${conv.id}: ${result.reason || "already handled"}`
          );
        }
      } catch (err) {
        console.error(
          `[scan-unresponded] Error triggering reply for conv ${conv.id}:`,
          err
        );
      }
    }

    console.log(
      `[scan-unresponded] Done — scanned=${conversations.length}, filtered=${needsReply.length}, triggered=${triggered}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        scanned: conversations.length,
        candidates: candidates.length,
        filtered: needsReply.length,
        triggered,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[scan-unresponded] Fatal error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
