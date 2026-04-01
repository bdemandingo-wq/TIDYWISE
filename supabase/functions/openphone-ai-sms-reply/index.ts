import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TEST_PHONE = "+15615718725";

const REACTION_PREFIXES = [
  "Liked", "Loved", "Laughed at", "Emphasized",
  "Le gustó", "Le encantó", "Disliked",
  "Questioned", "Le dio risa", "Enfatizó",
];

const VERIFICATION_CODE_RE = /\b\d{4,8}\b/;

const SYSTEM_PROMPT = `You are the messaging assistant for TidyWise, a professional cleaning company based in South Florida. You reply on behalf of the owner Emmanuel.

Tone: friendly, direct, professional. Like a real person texting — not a bot.

Length: 1-2 sentences max. This is SMS.

Language: always reply in English unless the customer texted in Spanish first.

Never say 'déjame saber', 'I acknowledge', 'as an AI', or any robotic phrases.

Never repeat what was already said in the conversation.

For pricing questions: ask for square footage before quoting. Do NOT ask for bedrooms or bathrooms — our pricing is based on square footage only.

For staff/cleaner messages: be direct and operational — jobs, schedules, addresses.

For clients: be warm and helpful — bookings, pricing, availability.

IMPORTANT: Never quote a flat rate unless the customer is a returning client with a booking on file. For new clients always ask for square footage before quoting. If the customer already provided their square footage in the conversation, look up the exact price from the pricing table and quote it — do not ask again.`;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const testMode = Deno.env.get("AI_REPLY_TEST_MODE") === "true";

  if (!supabaseUrl || !serviceKey || !lovableApiKey) {
    return json({ success: false, error: "Missing server config" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const {
      conversationId,
      organizationId,
      inboundMessage,
      customerPhone,
      customerName,
      openphoneMessageId,
      inboundToPhone,
    } = await req.json();

    // ── Hard stop 1: required fields ────────────────────────────────────
    if (!conversationId || !organizationId || !inboundMessage) {
      return json({ success: false, error: "Missing required fields" }, 400);
    }

    // ── Test mode lock ──────────────────────────────────────────────────
    const normalizedTestPhone = TEST_PHONE.replace(/\D/g, "");
    const normalizedInboundToPhone = String(inboundToPhone || "").replace(/\D/g, "");
    const normalizedCustomerPhone = String(customerPhone || "").replace(/\D/g, "");
    const isTestPhoneMatch =
      normalizedInboundToPhone === normalizedTestPhone ||
      normalizedCustomerPhone === normalizedTestPhone;

    if (testMode && !isTestPhoneMatch) {
      console.log(
        `[ai-reply] Test mode — skipping non-test numbers to=${inboundToPhone || "n/a"} from=${customerPhone || "n/a"}`,
      );
      return json({ success: true, skipped: true, reason: "test_mode" });
    }

    // ── Hard stop 2: reaction messages ──────────────────────────────────
    const trimmed = inboundMessage.trim();
    if (REACTION_PREFIXES.some((p) => trimmed.startsWith(p))) {
      console.log(`[ai-reply] Skipping reaction: "${trimmed.slice(0, 30)}"`);
      return json({ success: true, skipped: true, reason: "reaction" });
    }

    // ── Hard stop 3: verification codes ─────────────────────────────────
    if (VERIFICATION_CODE_RE.test(trimmed) && trimmed.replace(/\D/g, "").length >= 4 && trimmed.length <= 20) {
      console.log(`[ai-reply] Skipping verification code: "${trimmed}"`);
      return json({ success: true, skipped: true, reason: "verification_code" });
    }

    // ── Hard stop 4: relative cooldown ────────────────────────────────
    // Only block if AI already replied AFTER the last inbound message
    const { data: lastInbound } = await supabase
      .from("sms_messages")
      .select("sent_at")
      .eq("conversation_id", conversationId)
      .in("direction", ["inbound", "incoming"])
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastAiOutbound } = await supabase
      .from("sms_messages")
      .select("sent_at")
      .eq("conversation_id", conversationId)
      .in("direction", ["outbound", "outgoing"])
      .eq("metadata->>ai_generated", "true")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastInboundAt = lastInbound?.sent_at ? new Date(lastInbound.sent_at).getTime() : 0;
    const lastAiAt = lastAiOutbound?.sent_at ? new Date(lastAiOutbound.sent_at).getTime() : 0;

    if (lastAiAt > 0 && lastAiAt > lastInboundAt) {
      console.log(`[ai-reply] Cooldown — AI already replied after last inbound for conv ${conversationId}`);
      return json({ success: true, skipped: true, reason: "cooldown" });
    }

    // ── Hard stop 5: dedup via ai_reply_log ─────────────────────────────
    const messageId = openphoneMessageId || `${conversationId}_${Date.now()}`;
    const { error: dedupError } = await supabase
      .from("ai_reply_log")
      .insert({ inbound_message_id: messageId })
      .select()
      .single();

    if (dedupError?.code === "23505") {
      console.log(`[ai-reply] Dedup — already processed ${messageId}`);
      return json({ success: true, skipped: true, reason: "duplicate" });
    }

    // ── Fetch conversation context (last 8 messages, THIS conv only) ────
    const { data: recentMsgs } = await supabase
      .from("sms_messages")
      .select("direction, content, sent_at")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true })
      .limit(8);

    const transcript = (recentMsgs || [])
      .map((m: any) => {
        const role = m.direction === "inbound" || m.direction === "incoming" ? "Customer" : "Business";
        return `${role}: ${m.content || ""}`;
      })
      .join("\n");

    // ── Check for existing customer booking history ─────────────────────
    let pricingContext = "";
    if (customerPhone) {
      const { data: customer } = await supabase
        .from("customers")
        .select("id, first_name")
        .eq("organization_id", organizationId)
        .or(`phone.eq.${customerPhone},phone.eq.${customerPhone.replace("+1", "")}`)
        .limit(1)
        .maybeSingle();

      if (customer) {
        const { data: lastBooking } = await supabase
          .from("bookings")
          .select("total_amount, bedrooms, bathrooms, square_footage, service_id, services(name)")
          .eq("customer_id", customer.id)
          .eq("organization_id", organizationId)
          .in("status", ["completed", "confirmed"])
          .order("scheduled_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastBooking) {
          pricingContext = `\n\nReturning client${customer.first_name ? ` (${customer.first_name})` : ""}. Last booking: $${lastBooking.total_amount}${lastBooking.bedrooms ? `, ${lastBooking.bedrooms}bed/${lastBooking.bathrooms}bath` : ""}${lastBooking.square_footage ? `, ${lastBooking.square_footage} sqft` : ""}${(lastBooking as any).services?.name ? `, service: ${(lastBooking as any).services.name}` : ""}. You can reference their previous pricing.`;
        }
      }
    }

    // ── Fetch org services for pricing reference ────────────────────────
    const { data: services } = await supabase
      .from("services")
      .select("name, price, duration")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(10);

    let servicesContext = "";
    if (services?.length) {
      servicesContext = "\n\nAvailable services:\n" +
        services.map((s: any) => `- ${s.name}: starting at $${s.price} (${s.duration} min)`).join("\n");
    }

    // ── Call AI ─────────────────────────────────────────────────────────
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + pricingContext + servicesContext },
          { role: "user", content: `Conversation:\n${transcript}\n\nReply to the customer's last message. SMS only, 1-2 sentences.` },
        ],
        max_tokens: 200,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`[ai-reply] AI gateway error ${aiResp.status}: ${errText}`);
      return json({ success: false, error: "AI gateway error" }, 500);
    }

    const aiResult = await aiResp.json();
    const reply = aiResult.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      console.error("[ai-reply] Empty AI response");
      return json({ success: false, error: "Empty AI response" }, 500);
    }

    // ── Fetch OpenPhone settings ────────────────────────────────────────
    const { data: smsSettings } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      console.error("[ai-reply] Missing OpenPhone settings");
      return json({ success: false, error: "Missing SMS settings" }, 500);
    }

    // ── Send via OpenPhone ──────────────────────────────────────────────
    const sendResp = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: smsSettings.openphone_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: reply,
        to: [customerPhone],
        from: smsSettings.openphone_phone_number_id,
      }),
    });

    if (!sendResp.ok) {
      const errBody = await sendResp.text();
      console.error(`[ai-reply] OpenPhone send failed ${sendResp.status}: ${errBody}`);
      return json({ success: false, error: "Failed to send SMS" }, 500);
    }

    // ── Log the outbound message ────────────────────────────────────────
    await supabase.from("sms_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: reply,
      sent_at: new Date().toISOString(),
      metadata: { ai_generated: true },
    });

    // ── Mark conversation as AI-engaged for lead attribution ────────────
    await supabase
      .from("sms_conversations")
      .update({
        metadata: {
          ai_engaged: true,
          ai_last_reply_at: new Date().toISOString(),
        },
      })
      .eq("id", conversationId);

    console.log(`[ai-reply] Sent reply for conv ${conversationId}: "${reply.slice(0, 50)}..."`);

    return json({ success: true, reply, conversationId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[ai-reply] Fatal:", msg);
    return json({ success: false, error: msg }, 500);
  }
});
