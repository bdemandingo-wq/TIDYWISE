import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Human handoff: keywords that signal escalation ---
const ESCALATION_KEYWORDS = [
  "refund", "dispute", "lawyer", "attorney", "sue", "legal", "bbb",
  "better business bureau", "complaint", "stolen", "damage", "broke",
  "ruined", "furious", "unacceptable", "worst", "scam", "rip off",
  "ripoff", "disgusting", "threatening", "harassment", "police",
  "insurance claim", "small claims", "court",
];

function needsHumanHandoff(message: string): boolean {
  const lower = message.toLowerCase();
  return ESCALATION_KEYWORDS.some((kw) => lower.includes(kw));
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function formatPhoneForSend(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (!digits.startsWith("+")) return `+${digits}`;
  return digits;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ success: false, error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { conversationId, organizationId, inboundMessage, customerPhone, customerName } = await req.json();

    if (!conversationId || !organizationId || !inboundMessage || !customerPhone) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[openphone-ai-sms-reply] org=${organizationId} conv=${conversationId}`);

    // --- Bug 2 Fix: Verify last message is actually inbound ---
    const { data: lastMsg } = await supabase
      .from("sms_messages")
      .select("direction")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastMsg || (lastMsg.direction !== "inbound" && lastMsg.direction !== "incoming")) {
      console.log(`[openphone-ai-sms-reply] Last message is not inbound (${lastMsg?.direction || "none"}), skipping`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_inbound_message" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Fix 1: Skip message reactions (iMessage/OpenPhone tapbacks) ---
    const REACTION_PREFIXES = [
      "Liked", "Loved", "Laughed at", "Emphasized", "Disliked", "Questioned",
      "Le gustó", "Le encantó", "Se rió de", "Enfatizó", "No le gustó",
      "Liked \"", "Loved \"", "Laughed at \"", "Emphasized \"",
    ];
    if (REACTION_PREFIXES.some((prefix) => inboundMessage.startsWith(prefix))) {
      console.log(`[openphone-ai-sms-reply] Reaction message detected, skipping: "${inboundMessage.substring(0, 40)}"`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "reaction" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Bug 3 Fix: Database-level lock to prevent duplicate sends ---
    const lockCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Check for existing lock
    const { data: existingLock } = await supabase
      .from("ai_reply_locks")
      .select("id")
      .eq("conversation_id", conversationId)
      .gte("created_at", lockCutoff)
      .maybeSingle();

    if (existingLock) {
      console.log("[openphone-ai-sms-reply] Lock active for conversation, skipping duplicate");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "locked" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Acquire lock (upsert to handle unique constraint)
    const { error: lockError } = await supabase
      .from("ai_reply_locks")
      .upsert({ conversation_id: conversationId, created_at: new Date().toISOString() }, { onConflict: "conversation_id" });

    if (lockError) {
      console.log("[openphone-ai-sms-reply] Failed to acquire lock, another instance likely running");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "lock_contention" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Cooldown: any outbound in last 15 minutes ---
    const cooldownCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: cooldownHit } = await supabase
      .from("sms_messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .gte("sent_at", cooldownCutoff)
      .limit(1)
      .maybeSingle();

    if (cooldownHit) {
      // Release lock before returning
      await supabase.from("ai_reply_locks").delete().eq("conversation_id", conversationId);
      console.log("[openphone-ai-sms-reply] Cooldown active (outbound within 15 min), skipping");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "cooldown" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Human handoff check ---
    if (needsHumanHandoff(inboundMessage)) {
      console.log(`[openphone-ai-sms-reply] ESCALATION detected, handing off to human`);
      
      // Mark conversation as needing human attention + increment unread
      try {
        await supabase.from("sms_conversations")
          .update({ 
            metadata: { escalation: true, escalation_reason: inboundMessage.substring(0, 200), escalated_at: new Date().toISOString() },
            unread_count: 999, // High number to catch admin's attention
          })
          .eq("id", conversationId);
      } catch (e) {
        console.warn("[openphone-ai-sms-reply] Failed to flag escalation:", e);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        skipped: true, 
        reason: "escalation",
        message: "Message flagged for human review" 
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: automationRow } = await supabase
      .from("organization_automations")
      .select("settings")
      .eq("organization_id", organizationId)
      .eq("automation_type", "ai_sms_reply")
      .maybeSingle();

    const aiSettings = (automationRow?.settings as any) || {};
    const mode = aiSettings.mode || "off";

    if (mode === "off") {
      console.log("[openphone-ai-sms-reply] Mode is off, skipping");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "after_hours") {
      const tz = aiSettings.timezone || "America/New_York";
      const startStr = aiSettings.after_hours_start || "18:00";
      const endStr = aiSettings.after_hours_end || "08:00";

      // Get current hour/minute in the org's timezone
      const nowParts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
      }).formatToParts(new Date());
      const nowHour = parseInt(nowParts.find((p: any) => p.type === "hour")?.value || "0");
      const nowMin = parseInt(nowParts.find((p: any) => p.type === "minute")?.value || "0");
      const nowTotal = nowHour * 60 + nowMin;

      const [startH, startM] = startStr.split(":").map(Number);
      const [endH, endM] = endStr.split(":").map(Number);
      const startTotal = startH * 60 + (startM || 0);
      const endTotal = endH * 60 + (endM || 0);

      // After-hours window: e.g. 18:00 → 08:00 (wraps midnight)
      // Business hours = between endTotal and startTotal
      let isDuringBusinessHours: boolean;
      if (endTotal <= startTotal) {
        // Normal case: business hours are endTotal..startTotal (e.g. 08:00-18:00)
        isDuringBusinessHours = nowTotal >= endTotal && nowTotal < startTotal;
      } else {
        // Inverted: business hours wrap midnight (unusual but handle it)
        isDuringBusinessHours = nowTotal >= endTotal || nowTotal < startTotal;
      }

      if (isDuringBusinessHours) {
        console.log(`[openphone-ai-sms-reply] Business hours (${endStr}-${startStr} ${tz}), current=${nowHour}:${nowMin}, skipping`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "business_hours" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`[openphone-ai-sms-reply] After hours active (${startStr}-${endStr} ${tz}), current=${nowHour}:${nowMin}, proceeding`);
    }

    // --- Parallel data fetch ---
    const [smsSettingsRes, bizSettingsRes, servicesRes, servicePricingRes, convHistoryRes, orgOutboundRes, staffRes] = await Promise.all([
      supabase.from("organization_sms_settings").select("openphone_api_key, openphone_phone_number_id").eq("organization_id", organizationId).maybeSingle(),
      supabase.from("business_settings").select("company_name, company_phone, company_email").eq("organization_id", organizationId).maybeSingle(),
      supabase.from("services").select("id, name, price, description").eq("organization_id", organizationId).eq("is_active", true),
      supabase.from("service_pricing").select("service_id, sqft_prices, bedroom_pricing, extras, minimum_price, pet_options, home_condition_options").eq("organization_id", organizationId),
      supabase.from("sms_messages").select("direction, content, sent_at").eq("conversation_id", conversationId).order("sent_at", { ascending: true }).limit(15),
      supabase.from("sms_messages").select("content").eq("organization_id", organizationId).in("direction", ["outbound", "outgoing"]).neq("conversation_id", conversationId).order("sent_at", { ascending: false }).limit(40),
      supabase.from("staff").select("phone, name").eq("organization_id", organizationId).eq("is_active", true),
    ]);

    const smsSettings = smsSettingsRes.data;
    if (!smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      return new Response(JSON.stringify({ success: false, error: "OpenPhone not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, "");
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    const pnMatch = phoneNumberId.match(/(PN[A-Za-z0-9]+)/);
    if (pnMatch) phoneNumberId = pnMatch[1];

    const companyName = bizSettingsRes.data?.company_name || "Our company";
    const companyPhone = bizSettingsRes.data?.company_phone || "";
    const companyEmail = bizSettingsRes.data?.company_email || "";

    // --- Detect staff ---
    const normalizedCustomer = normalizePhone(customerPhone);
    const staffMatch = (staffRes.data || []).find((s: any) => s.phone && normalizePhone(s.phone) === normalizedCustomer);
    const isStaff = !!staffMatch;

    // --- CRM context lookup ---
    let crmContext = "";
    try {
      if (!isStaff) {
        // Client CRM: find customer by phone
        const { data: customers } = await supabase
          .from("customers")
          .select("id, first_name, last_name, notes, created_at, phone")
          .eq("organization_id", organizationId);

        const matchedCustomer = (customers || []).find((c: any) => c.phone && normalizePhone(c.phone) === normalizedCustomer);

        if (matchedCustomer) {
          const [upcomingRes, lastCompletedRes, leadRes] = await Promise.all([
            supabase
              .from("bookings")
              .select("scheduled_at, status, address, total_amount, notes, square_footage, bedrooms, bathrooms, staff:staff_id(name), service:service_id(name)")
              .eq("customer_id", matchedCustomer.id)
              .eq("organization_id", organizationId)
              .neq("status", "cancelled")
              .gte("scheduled_at", new Date().toISOString())
              .order("scheduled_at", { ascending: true })
              .limit(20),
            supabase
              .from("bookings")
              .select("scheduled_at, address, total_amount, square_footage, bedrooms, bathrooms, service:service_id(name), staff:staff_id(name)")
              .eq("customer_id", matchedCustomer.id)
              .eq("organization_id", organizationId)
              .eq("status", "completed")
              .order("scheduled_at", { ascending: false })
              .limit(50),
            supabase
              .from("leads")
              .select("name, status, notes, phone")
              .eq("organization_id", organizationId),
          ]);

          const matchedLead = (leadRes.data || []).find((l: any) => l.phone && normalizePhone(l.phone) === normalizedCustomer);

          // Group upcoming bookings by address (property)
          const upcomingByProperty = new Map<string, any[]>();
          for (const b of upcomingRes.data || []) {
            const addr = b.address || "Address TBD";
            if (!upcomingByProperty.has(addr)) upcomingByProperty.set(addr, []);
            upcomingByProperty.get(addr)!.push(b);
          }

          // Group last completed booking per property
          const lastCompletedByProperty = new Map<string, any>();
          for (const b of lastCompletedRes.data || []) {
            const addr = b.address || "Address TBD";
            if (!lastCompletedByProperty.has(addr)) lastCompletedByProperty.set(addr, b);
          }

          // Collect all unique property addresses
          const allAddresses = new Set([...upcomingByProperty.keys(), ...lastCompletedByProperty.keys()]);
          const multiProperty = allAddresses.size > 1;

          const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

          let propertyBlock: string;
          // Helper to format property details from a booking
          const fmtPropertyDetails = (b: any) => {
            const parts: string[] = [];
            if (b.square_footage) parts.push(`${b.square_footage} sqft`);
            if (b.bedrooms) parts.push(`${b.bedrooms} bed`);
            if (b.bathrooms) parts.push(`${b.bathrooms} bath`);
            if (b.total_amount) parts.push(`$${b.total_amount}`);
            return parts.length ? ` (${parts.join(", ")})` : "";
          };

          // Determine if this is a returning client with booking history
          const hasBookingHistory = (lastCompletedRes.data || []).length > 0 || (upcomingRes.data || []).length > 0;

          if (multiProperty) {
            let i = 0;
            const blocks: string[] = [];
            for (const addr of allAddresses) {
              i++;
              const upcoming = upcomingByProperty.get(addr) || [];
              const lastB = lastCompletedByProperty.get(addr);
              const upLines = upcoming.map((b: any) =>
                `    • ${fmtDate(b.scheduled_at)} at ${fmtTime(b.scheduled_at)} — ${(b.service as any)?.name || "Service"}${fmtPropertyDetails(b)}${(b.staff as any)?.name ? ` (Cleaner: ${(b.staff as any).name})` : ""}${b.notes ? ` [${b.notes.substring(0, 80)}]` : ""}`
              ).join("\n") || "    None scheduled";
              const lastLine = lastB
                ? `${new Date(lastB.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${(lastB.service as any)?.name || "Service"}${fmtPropertyDetails(lastB)}${(lastB.staff as any)?.name ? ` by ${(lastB.staff as any).name}` : ""}`
                : "No completed bookings";
              blocks.push(`  Property ${i}: ${addr}\n    - Last cleaning: ${lastLine}\n    - Upcoming:\n${upLines}`);
            }
            propertyBlock = blocks.join("\n");
          } else {
            const addr = [...allAddresses][0] || "Address TBD";
            const upcoming = upcomingByProperty.get(addr) || [];
            const lastB = lastCompletedByProperty.get(addr);
            const upLines = upcoming.map((b: any) =>
              `  • ${fmtDate(b.scheduled_at)} at ${fmtTime(b.scheduled_at)} — ${(b.service as any)?.name || "Service"} at ${addr}${fmtPropertyDetails(b)}${(b.staff as any)?.name ? ` (Cleaner: ${(b.staff as any).name})` : ""}`
            ).join("\n") || "  None scheduled";
            const lastLine = lastB
              ? `${new Date(lastB.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${(lastB.service as any)?.name || "Service"}${fmtPropertyDetails(lastB)}${(lastB.staff as any)?.name ? ` by ${(lastB.staff as any).name}` : ""}`
              : "No completed bookings on file";
            propertyBlock = `- Last cleaning: ${lastLine}\n- Upcoming bookings:\n${upLines}`;
          }

          crmContext = `\nCRM CONTEXT${multiProperty ? " — MULTIPLE PROPERTIES" : ""}:
- Customer: ${matchedCustomer.first_name || ""} ${matchedCustomer.last_name || ""}
- Customer since: ${new Date(matchedCustomer.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
- Returning client: ${hasBookingHistory ? "YES — quote based on their previous service pricing" : "NO — new client, no booking history"}
${propertyBlock}
${matchedLead ? `- Lead status: ${matchedLead.status}${matchedLead.notes ? ` — ${matchedLead.notes.substring(0, 200)}` : ""}` : ""}
${matchedCustomer.notes ? `- Notes: ${matchedCustomer.notes.substring(0, 300)}` : ""}
${multiProperty ? "- IMPORTANT: This client has MULTIPLE properties. If they ask about scheduling without specifying an address, ask which property they mean and list the addresses." : ""}\n`;
        }
      } else {
        // Staff CRM: get staff details and upcoming assignments
        const { data: staffDetail } = await supabase
          .from("staff")
          .select("id, name, is_active, phone")
          .eq("organization_id", organizationId)
          .eq("is_active", true);

        const matchedStaffRow = (staffDetail || []).find((s: any) => s.phone && normalizePhone(s.phone) === normalizedCustomer);

        if (matchedStaffRow) {
          const { data: staffBookings } = await supabase
            .from("bookings")
            .select("scheduled_at, address, notes, customer:customer_id(first_name, last_name), service:service_id(name)")
            .eq("staff_id", matchedStaffRow.id)
            .eq("organization_id", organizationId)
            .in("status", ["pending", "confirmed"])
            .gte("scheduled_at", new Date().toISOString())
            .order("scheduled_at", { ascending: true })
            .limit(5);

          const jobList = (staffBookings || []).map((b: any) => {
            const cust = b.customer as any;
            const custName = cust ? `${cust.first_name || ""} ${cust.last_name || ""}`.trim() : "TBD";
            return `  • ${new Date(b.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${new Date(b.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} — ${(b.service as any)?.name || "Job"} for ${custName} at ${b.address || "TBD"}`;
          }).join("\n") || "  No upcoming jobs";

          crmContext = `\nCRM CONTEXT:
- Staff member: ${matchedStaffRow.name}
- Upcoming jobs:\n${jobList}\n`;
        }
      }
    } catch (e) {
      console.warn("[openphone-ai-sms-reply] CRM context fetch failed:", e);
    }

    // --- Call transcripts from OpenPhone ---
    let callSummaries = "";
    try {
      const transcriptResp = await fetch(
        `https://api.openphone.com/v1/call-transcripts?phoneNumberId=${phoneNumberId}&participants=${encodeURIComponent(customerPhone)}&maxResults=5`,
        { headers: { Authorization: authHeader } }
      );
      if (transcriptResp.ok) {
        const transcriptData = await transcriptResp.json();
        const summaries = (transcriptData.data || []).map((item: any) => {
          if (item.summary) return item.summary.substring(0, 600);
          if (item.transcript?.length) {
            return item.transcript.map((t: any) => `${t.speaker || "Unknown"}: ${t.text || ""}`).join("\n").substring(0, 600);
          }
          return null;
        }).filter(Boolean);
        if (summaries.length) callSummaries = "\nRECENT CALL SUMMARIES:\n" + summaries.join("\n---\n");
      } else {
        await transcriptResp.text();
      }
    } catch (e) {
      console.warn("[openphone-ai-sms-reply] Failed to fetch call transcripts:", e);
    }

    // --- Done conversation style examples from OpenPhone ---
    let doneConvExamples: string[] = [];
    try {
      const convResp = await fetch(
        `https://api.openphone.com/v1/conversations?phoneNumbers=${phoneNumberId}&status=done&maxResults=20`,
        { headers: { Authorization: authHeader } }
      );
      if (convResp.ok) {
        const convData = await convResp.json();
        const conversations = convData.data || [];
        const msgFetches = conversations.slice(0, 10).map(async (conv: any) => {
          try {
            const participant = conv.participants?.[0];
            if (!participant) return [];
            const msgResp = await fetch(
              `https://api.openphone.com/v1/messages?phoneNumberId=${phoneNumberId}&participants=${encodeURIComponent(participant)}&maxResults=10`,
              { headers: { Authorization: authHeader } }
            );
            if (!msgResp.ok) { await msgResp.text(); return []; }
            const msgData = await msgResp.json();
            return (msgData.data || [])
              .filter((m: any) => m.direction === "outgoing" && m.body)
              .map((m: any) => m.body);
          } catch { return []; }
        });
        const results = await Promise.all(msgFetches);
        doneConvExamples = results.flat().filter((c: string) => c.length > 10 && c.length < 500);
      } else {
        await convResp.text();
      }
    } catch (e) {
      console.warn("[openphone-ai-sms-reply] Failed to fetch done conversations:", e);
    }

    // --- Build style examples ---
    const dbExamples = (orgOutboundRes.data || [])
      .map((m: any) => m.content)
      .filter((c: string) => c && c.length > 10 && c.length < 500);
    const allExamples = [...dbExamples, ...doneConvExamples].slice(0, 25);
    const styleBlock = allExamples.length
      ? `\nSTYLE EXAMPLES (match this exact tone and style):\n${allExamples.join("\n---\n")}\n`
      : "";

    // --- Conversation history ---
    const historyText = (convHistoryRes.data || [])
      .map((msg: any) => {
        const role = msg.direction === "inbound" || msg.direction === "incoming" ? (customerName || "Customer") : companyName;
        return `${role}: ${msg.content}`;
      })
      .join("\n");

    // --- Services & Pricing ---
    const pricingMap = new Map<string, any>();
    for (const sp of servicePricingRes.data || []) {
      pricingMap.set(sp.service_id, sp);
    }

    const servicesLines: string[] = [];
    for (const s of servicesRes.data || []) {
      const sp = pricingMap.get(s.id);
      let line = `- ${s.name}: Base price $${s.price}`;
      if (sp) {
        if (sp.sqft_prices && typeof sp.sqft_prices === "object") {
          const ranges = Object.entries(sp.sqft_prices as Record<string, number>)
            .map(([range, price]) => `${range}: $${price}`)
            .join(", ");
          if (ranges) line += `\n  Square footage pricing: ${ranges}`;
        }
        if (sp.bedroom_pricing && typeof sp.bedroom_pricing === "object") {
          const beds = Object.entries(sp.bedroom_pricing as Record<string, number>)
            .map(([count, price]) => `${count} bed: $${price}`)
            .join(", ");
          if (beds) line += `\n  Bedroom pricing: ${beds}`;
        }
        if (sp.extras && Array.isArray(sp.extras) && sp.extras.length) {
          const extrasStr = sp.extras.map((e: any) => `${e.name || e.label}: $${e.price}`).join(", ");
          line += `\n  Add-ons: ${extrasStr}`;
        }
        if (sp.minimum_price) line += `\n  Minimum: $${sp.minimum_price}`;
      }
      servicesLines.push(line);
    }
    const servicesText = servicesLines.join("\n");

    // --- System prompt ---
    const toneInstruction = isStaff
      ? "This contact is a STAFF MEMBER. Be direct, operational, and brief. No marketing language."
      : "This contact is a CLIENT. Be warm, professional, and helpful. Match the style examples closely.";

    const systemPrompt = `You are the AI assistant for "${companyName}". You reply to SMS messages exactly as the business owner would.

${toneInstruction}

CRITICAL RULES:
- Keep replies SHORT (1-3 sentences max). This is SMS, not email.
- Match the tone from the style examples below exactly.
- Never say you are an AI, bot, or automated system.
- If CRM CONTEXT contains upcoming bookings or last cleaning info, USE IT to answer scheduling questions directly.

PRICING & QUOTING RULES:
- IMPORTANT: Never quote a flat rate unless the customer is a returning client with a booking on file. For new clients always ask for square footage or bedroom/bathroom count before quoting. Our pricing is based on home size, not a single flat rate.
- RETURNING CLIENTS: If CRM CONTEXT shows "Returning client: YES" and their previous booking has a price, quote based on that. Example: "Your last cleaning was $X for [service]. Want me to book the same?"
- NEW CLIENTS: If CRM CONTEXT shows "Returning client: NO" or there is no CRM CONTEXT, and they ask about pricing, ask for their home details first. Example: "Our pricing is based on the size of your home. What's the approximate square footage?" or "How many bedrooms and bathrooms does your home have?"
- If the conversation history already contains their square footage or bedroom/bathroom count, use the SERVICES OFFERED pricing tiers to calculate and give them the actual price. Do NOT ask again.
- If SERVICES OFFERED has square footage or bedroom pricing tiers, use those to match the customer's info to the right price.

- If asked about something NOT in CRM CONTEXT or SERVICES, say something like "Let me check on that and get back to you!"
- If the customer seems upset, be empathetic and say you'll look into it personally.
- Do NOT use emojis unless the style examples show the business uses them.
- Do NOT include any greeting label like "Customer:" or "${companyName}:" in your output.
- Do NOT wrap your reply in quotes.
- Output ONLY the reply text, nothing else.
${styleBlock}
${callSummaries}

BUSINESS INFO:
Company: ${companyName}
${companyPhone ? `Phone: ${companyPhone}` : ""}
${companyEmail ? `Email: ${companyEmail}` : ""}

${servicesText ? `SERVICES OFFERED:\n${servicesText}\n` : ""}
${crmContext}
CONVERSATION HISTORY:
${historyText}`;

    // --- Call AI ---
    console.log("[openphone-ai-sms-reply] Calling AI gateway");
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: inboundMessage },
        ],
        max_tokens: 300,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[openphone-ai-sms-reply] AI error: ${aiResponse.status} - ${errText}`);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ success: false, error: "AI rate limited" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ success: false, error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: false, error: "AI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiResult = await aiResponse.json();
    const generatedReply = aiResult.choices?.[0]?.message?.content?.trim();

    if (!generatedReply) {
      return new Response(JSON.stringify({ success: false, error: "AI returned empty response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[openphone-ai-sms-reply] Reply: ${generatedReply.substring(0, 80)}...`);

    // --- Send via OpenPhone ---
    const formattedPhone = formatPhoneForSend(customerPhone);
    const smsResp = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ from: phoneNumberId, to: [formattedPhone], content: generatedReply }),
    });

    if (!smsResp.ok) {
      const errText = await smsResp.text();
      console.error(`[openphone-ai-sms-reply] OpenPhone send failed: ${smsResp.status} - ${errText}`);
      return new Response(JSON.stringify({ success: false, error: "Failed to send via OpenPhone" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const smsResult = await smsResp.json();

    // --- Save to DB ---
    await Promise.all([
      supabase.from("sms_messages").insert({
        conversation_id: conversationId,
        organization_id: organizationId,
        direction: "outbound",
        content: generatedReply,
        status: "sent",
        openphone_message_id: smsResult?.data?.id || null,
        sent_at: new Date().toISOString(),
        metadata: { ai_generated: true, customer_phone: customerPhone },
      }),
      supabase.from("sms_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId),
    ]);

    // --- Lead conversion tracking ---
    // Tag the conversation so that when a booking is later created for this customer,
    // we can attribute it to AI. We store the conversation ID in sms_conversations metadata.
    try {
      await supabase.from("sms_conversations")
        .update({ metadata: { ai_engaged: true, ai_last_reply_at: new Date().toISOString() } })
        .eq("id", conversationId);
    } catch (e) {
      console.warn("[openphone-ai-sms-reply] Failed to tag conversation for lead tracking:", e);
    }

    return new Response(JSON.stringify({ success: true, reply: generatedReply }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[openphone-ai-sms-reply] Error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
