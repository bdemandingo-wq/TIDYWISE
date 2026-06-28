// AI Message Assist
// Modes:
//   - suggest_reply: returns 3 suggested replies for a conversation. Pulls
//     the last messages, business settings, and upcoming bookings so it can
//     propose availability-aware responses.
//   - inbox_summary: summarizes unread/needs-reply conversations into a
//     prioritized list.
//
// SECURITY: Validates org membership of the caller. Never trusts client
// organizationId without verifying via JWT.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  mode: "suggest_reply" | "inbox_summary";
  organizationId: string;
  conversationId?: string;
  customInstruction?: string;
  unreadConversations?: Array<{
    name: string;
    lastMessage: string;
    hoursSinceLastInbound: number;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ReqBody;
    if (!body.organizationId || !body.mode) {
      return new Response(JSON.stringify({ error: "Missing organizationId or mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify org membership
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("organization_id")
      .eq("user_id", userData.user.id)
      .eq("organization_id", body.organizationId)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Business settings for tone/name
    const { data: settings } = await supabase
      .from("business_settings")
      .select("company_name, company_phone, company_email")
      .eq("organization_id", body.organizationId)
      .maybeSingle();
    const companyName = settings?.company_name || "our team";

    if (body.mode === "suggest_reply") {
      if (!body.conversationId) {
        return new Response(JSON.stringify({ error: "Missing conversationId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Last 12 messages
      const { data: msgs } = await supabase
        .from("sms_messages")
        .select("direction, content, sent_at")
        .eq("conversation_id", body.conversationId)
        .order("sent_at", { ascending: false })
        .limit(12);
      const history = (msgs || []).reverse();

      // Upcoming bookings (next 7 days) for availability suggestions
      const now = new Date();
      const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { data: bookings } = await supabase
        .from("bookings")
        .select("scheduled_at, duration, status")
        .eq("organization_id", body.organizationId)
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", in7.toISOString())
        .in("status", ["confirmed", "scheduled", "in_progress"])
        .order("scheduled_at");

      const bookedSlots = (bookings || [])
        .map((b: any) => new Date(b.scheduled_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))
        .join(", ");

      const systemPrompt = `You are an SMS reply assistant for ${companyName}, a cleaning business. Generate 3 brief, friendly reply options to send to the customer. Each reply must be:
- Under 280 characters
- Professional but warm (no robotic tone)
- Match the context of the conversation
- If the customer is asking about availability/scheduling, suggest open times. The next 7 days have these slots ALREADY BOOKED: ${bookedSlots || "(none booked)"}. Suggest times that don't conflict (assume business hours 8am-5pm).

Return STRICT JSON: {"suggestions":[{"label":"Friendly","text":"..."},{"label":"Direct","text":"..."},{"label":"With availability","text":"..."}]}
No markdown, no commentary, just JSON.`;

      const conversation = history.map((m: any) =>
        `${m.direction === "inbound" ? "Customer" : "You"}: ${m.content}`,
      ).join("\n");

      const userMsg = `Conversation so far:\n${conversation}\n\n${body.customInstruction ? `Additional instruction: ${body.customInstruction}` : "Generate 3 reply suggestions."}`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
          response_format: { type: "json_object" },
        }),
      });

      if (!aiRes.ok) {
        const txt = await aiRes.text();
        console.error("[ai-message-assist] AI error:", aiRes.status, txt);
        if (aiRes.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (aiRes.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error("AI request failed");
      }

      const aiData = await aiRes.json();
      const raw = aiData.choices?.[0]?.message?.content || "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { parsed = { suggestions: [] }; }
      return new Response(JSON.stringify({ success: true, suggestions: parsed.suggestions || [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === "inbox_summary") {
      // Always re-compute server-side: find conversations where the LAST
      // message is inbound (customer waiting on a reply) within last 30 days.
      // This is more reliable than the client's unread_count which can drift.
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: convs, error: convsErr } = await supabase
        .from("sms_conversations")
        .select("id, customer_name, customer_phone, last_message_at")
        .eq("organization_id", body.organizationId)
        .gte("last_message_at", cutoff)
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (convsErr) console.error("[ai-message-assist] convs query err:", convsErr);

      const needsReply: Array<{ name: string; lastMessage: string; hoursSinceLastInbound: number }> = [];
      for (const c of convs || []) {
        const { data: lastMsg, error: msgErr } = await supabase
          .from("sms_messages")
          .select("direction, content, sent_at")
          .eq("conversation_id", c.id)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (msgErr) { console.error("[ai-message-assist] msg query err:", msgErr); continue; }
        if (lastMsg && lastMsg.direction === "inbound") {
          needsReply.push({
            name: c.customer_name || c.customer_phone || "Unknown",
            lastMessage: lastMsg.content || "",
            hoursSinceLastInbound: (Date.now() - new Date(lastMsg.sent_at).getTime()) / 3_600_000,
          });
        }
      }
      console.log(`[ai-message-assist] inbox_summary: scanned ${convs?.length || 0} conversations, ${needsReply.length} need reply`);

      const items = needsReply.sort((a, b) => b.hoursSinceLastInbound - a.hoursSinceLastInbound).slice(0, 15);
      if (items.length === 0) {
        return new Response(JSON.stringify({ success: true, summary: "✅ All clear — every customer has gotten a reply. Nice work!", count: 0 }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const systemPrompt = `You are an inbox assistant for ${companyName}. Summarize unread/needs-reply customer SMS threads in plain English for the business owner. Prioritize threads that look urgent or have been waiting longest. Be concise (under 200 words total). Use a short bulleted list. End with one sentence recommending which to reply to first.`;
      const userMsg = items.map((c, i) => `${i + 1}. ${c.name} — "${c.lastMessage}" (waiting ${c.hoursSinceLastInbound.toFixed(1)}h)`).join("\n");
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
        }),
      });
      if (!aiRes.ok) {
        const txt = await aiRes.text();
        console.error("[ai-message-assist] summary err:", aiRes.status, txt);
        if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error("AI summary failed");
      }
      const aiData = await aiRes.json();
      const summary = aiData.choices?.[0]?.message?.content || "Could not generate summary.";
      return new Response(JSON.stringify({ success: true, summary, count: items.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown mode" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-message-assist] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
