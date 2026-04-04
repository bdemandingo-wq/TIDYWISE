import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function aiRequest(apiKey: string, body: Record<string, unknown>) {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function handleRateLimit(status: number) {
  if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return null;
}

async function fetchBusinessContext(supabaseAdmin: any, orgId: string) {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  // Parallel queries
  const [
    bookings90d,
    bookingsThisMonth,
    bookingsPrevMonth,
    cancelledBookings,
    allCustomers,
    unconvertedLeads,
    services,
    staff,
  ] = await Promise.all([
    supabaseAdmin.from("bookings").select("id, total_amount, scheduled_at, status, service_id, staff_id, customer_id, duration").eq("organization_id", orgId).gte("scheduled_at", ninetyDaysAgo).order("scheduled_at", { ascending: false }),
    supabaseAdmin.from("bookings").select("total_amount, status").eq("organization_id", orgId).gte("scheduled_at", monthStart).in("status", ["confirmed", "completed"]),
    supabaseAdmin.from("bookings").select("total_amount, status").eq("organization_id", orgId).gte("scheduled_at", prevMonthStart).lte("scheduled_at", prevMonthEnd).in("status", ["confirmed", "completed"]),
    supabaseAdmin.from("bookings").select("id, scheduled_at, customer_id, booking_number, status").eq("organization_id", orgId).in("status", ["cancelled", "no_show"]).gte("scheduled_at", ninetyDaysAgo),
    supabaseAdmin.from("customers").select("id, first_name, last_name, email, phone").eq("organization_id", orgId),
    supabaseAdmin.from("leads").select("id, name, email, status, created_at, estimated_value, source").eq("organization_id", orgId).neq("status", "converted").neq("status", "lost"),
    supabaseAdmin.from("services").select("id, name, price, duration").eq("organization_id", orgId).eq("is_active", true),
    supabaseAdmin.from("staff").select("id, name, is_active").eq("organization_id", orgId).eq("is_active", true),
  ]);

  const bookings = bookings90d.data || [];
  const thisMonthBookings = bookingsThisMonth.data || [];
  const prevMonthBookings = bookingsPrevMonth.data || [];
  const customers = allCustomers.data || [];
  const leads = unconvertedLeads.data || [];
  const serviceList = services.data || [];
  const staffList = staff.data || [];
  const cancelled = cancelledBookings.data || [];

  // Revenue
  const revenueThisMonth = thisMonthBookings.reduce((s: number, b: any) => s + (b.total_amount || 0), 0);
  const revenuePrevMonth = prevMonthBookings.reduce((s: number, b: any) => s + (b.total_amount || 0), 0);
  const revenueDelta = revenuePrevMonth > 0 ? Math.round(((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100) : 0;

  // Revenue by service
  const serviceRevenue: Record<string, { name: string; revenue: number; count: number }> = {};
  for (const b of bookings) {
    if (b.service_id && ["confirmed", "completed"].includes(b.status)) {
      if (!serviceRevenue[b.service_id]) {
        const svc = serviceList.find((s: any) => s.id === b.service_id);
        serviceRevenue[b.service_id] = { name: svc?.name || "Unknown", revenue: 0, count: 0 };
      }
      serviceRevenue[b.service_id].revenue += b.total_amount || 0;
      serviceRevenue[b.service_id].count++;
    }
  }
  const topServices = Object.values(serviceRevenue).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Day/time distribution
  const dayCount: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const hourCount: Record<number, number> = {};
  for (const b of bookings) {
    if (!["cancelled", "no_show"].includes(b.status)) {
      const d = new Date(b.scheduled_at);
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      dayCount[dayNames[d.getUTCDay()]]++;
      const hour = d.getUTCHours();
      hourCount[hour] = (hourCount[hour] || 0) + 1;
    }
  }
  const bestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
  const worstDay = Object.entries(dayCount).sort((a, b) => a[1] - b[1])[0]?.[0] || "N/A";
  const peakHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  // Clients who haven't booked
  const customerLastBooking: Record<string, string> = {};
  for (const b of bookings) {
    if (b.customer_id && !["cancelled", "no_show"].includes(b.status)) {
      if (!customerLastBooking[b.customer_id] || b.scheduled_at > customerLastBooking[b.customer_id]) {
        customerLastBooking[b.customer_id] = b.scheduled_at;
      }
    }
  }
  const inactive30: string[] = [];
  const inactive60: string[] = [];
  const inactive90: string[] = [];
  for (const c of customers) {
    const last = customerLastBooking[c.id];
    if (!last) { inactive90.push(`${c.first_name} ${c.last_name}`); continue; }
    const days = Math.floor((now.getTime() - new Date(last).getTime()) / 86400000);
    if (days >= 90) inactive90.push(`${c.first_name} ${c.last_name}`);
    else if (days >= 60) inactive60.push(`${c.first_name} ${c.last_name}`);
    else if (days >= 30) inactive30.push(`${c.first_name} ${c.last_name}`);
  }

  // Cancellation patterns
  const cancellationRate = bookings.length > 0 ? Math.round((cancelled.length / bookings.length) * 100) : 0;

  // Staff performance
  const staffBookings: Record<string, { name: string; count: number; revenue: number }> = {};
  for (const b of bookings) {
    if (b.staff_id && ["confirmed", "completed"].includes(b.status)) {
      if (!staffBookings[b.staff_id]) {
        const s = staffList.find((s: any) => s.id === b.staff_id);
        staffBookings[b.staff_id] = { name: s?.name || "Unknown", count: 0, revenue: 0 };
      }
      staffBookings[b.staff_id].count++;
      staffBookings[b.staff_id].revenue += b.total_amount || 0;
    }
  }
  const staffPerformance = Object.values(staffBookings).sort((a, b) => b.count - a.count);

  return {
    revenueThisMonth: Math.round(revenueThisMonth),
    revenuePrevMonth: Math.round(revenuePrevMonth),
    revenueDelta,
    totalBookings90d: bookings.filter((b: any) => !["cancelled", "no_show"].includes(b.status)).length,
    cancellationRate,
    cancelledCount: cancelled.length,
    topServices,
    bestDay,
    worstDay,
    peakHour: peakHour !== "N/A" ? `${Number(peakHour) % 12 || 12}${Number(peakHour) >= 12 ? "pm" : "am"}` : "N/A",
    dayDistribution: dayCount,
    inactive30: inactive30.slice(0, 10),
    inactive60: inactive60.slice(0, 10),
    inactive90: inactive90.slice(0, 10),
    inactive30Count: inactive30.length,
    inactive60Count: inactive60.length,
    inactive90Count: inactive90.length,
    unconvertedLeadsCount: leads.length,
    topUnconvertedLeads: leads.slice(0, 8).map((l: any) => ({ name: l.name, source: l.source, daysOpen: Math.floor((now.getTime() - new Date(l.created_at).getTime()) / 86400000), value: l.estimated_value })),
    totalCustomers: customers.length,
    activeStaff: staffList.length,
    staffPerformance: staffPerformance.slice(0, 5),
  };
}

function buildSystemPrompt(ctx: any) {
  return `You are TidyWise AI — a brilliant, data-driven business advisor for cleaning companies. You have access to REAL business data. Always reference specific numbers, names, and dates. Never give generic advice.

## REAL BUSINESS DATA (Last 90 Days)

**Revenue:**
- This month: $${ctx.revenueThisMonth.toLocaleString()} (${ctx.revenueDelta >= 0 ? "+" : ""}${ctx.revenueDelta}% vs last month's $${ctx.revenuePrevMonth.toLocaleString()})
- Total bookings (90d): ${ctx.totalBookings90d}

**Top Services by Revenue:**
${ctx.topServices.map((s: any, i: number) => `${i + 1}. ${s.name}: $${Math.round(s.revenue).toLocaleString()} (${s.count} bookings)`).join("\n") || "No data yet"}

**Scheduling Patterns:**
- Best day: ${ctx.bestDay} | Worst day: ${ctx.worstDay} | Peak time: ${ctx.peakHour}
- Daily distribution: ${Object.entries(ctx.dayDistribution).map(([d, c]) => `${d}:${c}`).join(", ")}

**Client Retention:**
- ${ctx.inactive30Count} clients inactive 30+ days${ctx.inactive30.length > 0 ? `: ${ctx.inactive30.join(", ")}` : ""}
- ${ctx.inactive60Count} clients inactive 60+ days${ctx.inactive60.length > 0 ? `: ${ctx.inactive60.join(", ")}` : ""}
- ${ctx.inactive90Count} clients inactive 90+ days${ctx.inactive90.length > 0 ? `: ${ctx.inactive90.join(", ")}` : ""}
- Total customers: ${ctx.totalCustomers}

**Cancellations:**
- Rate: ${ctx.cancellationRate}% (${ctx.cancelledCount} in 90 days)

**Leads Pipeline:**
- ${ctx.unconvertedLeadsCount} unconverted leads
${ctx.topUnconvertedLeads.map((l: any) => `  • ${l.name} (${l.source}, ${l.daysOpen}d open${l.value ? `, ~$${l.value}` : ""})`).join("\n") || "  None"}

**Team:**
- ${ctx.activeStaff} active staff
${ctx.staffPerformance.map((s: any) => `  • ${s.name}: ${s.count} bookings, $${Math.round(s.revenue).toLocaleString()} revenue`).join("\n") || "  No data"}

## RESPONSE FORMAT
1. Always reference actual data: "Based on your last 90 days..."
2. Give specific actions: "Here's exactly what to do..."
3. Offer to help execute: "Want me to draft the message/campaign?"
4. Use markdown for formatting. Bold key numbers. Use bullet points.
5. Keep answers focused and actionable (under 300 words).`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, messages, organizationId, businessSnapshot } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Create supabase admin client for data fetching
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const orgId = organizationId;

    // ─── PROACTIVE INSIGHTS (data-driven, no AI needed for basic ones) ───
    if (type === "proactive-insights" && orgId) {
      const ctx = await fetchBusinessContext(supabaseAdmin, orgId);
      const proactiveInsights: any[] = [];

      // Revenue comparison
      if (ctx.revenueDelta < 0) {
        proactiveInsights.push({
          type: "critical",
          icon: "🔴",
          title: `Revenue down ${Math.abs(ctx.revenueDelta)}% vs last month`,
          body: `You lost $${Math.abs(ctx.revenueThisMonth - ctx.revenuePrevMonth).toLocaleString()} this month vs last. Your ${ctx.worstDay} slots are consistently the emptiest. Consider running a ${ctx.worstDay} discount campaign.`,
          action: `Draft a ${ctx.worstDay} discount campaign to fill empty slots`,
        });
      } else if (ctx.revenueDelta > 15) {
        proactiveInsights.push({
          type: "positive",
          icon: "🟢",
          title: `Revenue up ${ctx.revenueDelta}% — great momentum!`,
          body: `You're earning $${ctx.revenueThisMonth.toLocaleString()} this month vs $${ctx.revenuePrevMonth.toLocaleString()} last month. ${ctx.bestDay} is your best day — consider adding capacity.`,
          action: "How can I keep this growth going?",
        });
      }

      // Inactive clients
      if (ctx.inactive60Count > 0) {
        proactiveInsights.push({
          type: "warning",
          icon: "🟡",
          title: `${ctx.inactive60Count} clients haven't booked in 60+ days`,
          body: `These clients are at risk of churning: ${ctx.inactive60.slice(0, 5).join(", ")}${ctx.inactive60Count > 5 ? ` and ${ctx.inactive60Count - 5} more` : ""}. A personalized re-engagement message could bring them back.`,
          action: "Draft a re-engagement message for these clients",
        });
      }

      // Top service upsell
      if (ctx.topServices.length >= 2) {
        const top = ctx.topServices[0];
        const second = ctx.topServices[1];
        if (top.count > second.count * 1.5) {
          proactiveInsights.push({
            type: "positive",
            icon: "🟢",
            title: `${top.name} is your money maker`,
            body: `${top.name} generated $${Math.round(top.revenue).toLocaleString()} from ${top.count} bookings — ${Math.round(top.revenue / (top.count || 1))} avg/booking. Consider upselling it to ${second.name} clients.`,
            action: `How do I upsell ${top.name} to more clients?`,
          });
        }
      }

      // Open slots suggestion
      const totalWeekBookings = Object.values(ctx.dayDistribution).reduce((s: number, c: number) => s + c, 0);
      if (totalWeekBookings < ctx.activeStaff * 5 && ctx.activeStaff > 0) {
        proactiveInsights.push({
          type: "tip",
          icon: "💡",
          title: "You have open capacity this week",
          body: `With ${ctx.activeStaff} staff and only ${totalWeekBookings} bookings this week, you have room to fill. Your slowest day is ${ctx.worstDay}. Want to draft a last-minute campaign?`,
          action: "Draft a last-minute availability campaign",
        });
      }

      // Unconverted leads
      if (ctx.unconvertedLeadsCount > 3) {
        proactiveInsights.push({
          type: "warning",
          icon: "🟡",
          title: `${ctx.unconvertedLeadsCount} leads sitting unconverted`,
          body: `Your oldest open leads: ${ctx.topUnconvertedLeads.slice(0, 3).map((l: any) => `${l.name} (${l.daysOpen}d)`).join(", ")}. Quick follow-ups convert 3x better within the first week.`,
          action: "Which leads should I call today?",
        });
      }

      // Cancellation warning
      if (ctx.cancellationRate > 10) {
        proactiveInsights.push({
          type: "critical",
          icon: "🔴",
          title: `${ctx.cancellationRate}% cancellation rate is high`,
          body: `${ctx.cancelledCount} cancellations in 90 days. This is costing you revenue and schedule gaps. Consider adding a cancellation fee or requiring deposits.`,
          action: "How do I reduce cancellations?",
        });
      }

      return new Response(JSON.stringify({ insights: proactiveInsights.slice(0, 6) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DYNAMIC CHIPS ───
    if (type === "dynamic-chips" && orgId) {
      const ctx = await fetchBusinessContext(supabaseAdmin, orgId);
      const chips: string[] = [];

      if (ctx.revenueDelta < 0) chips.push("Why did revenue drop this month?");
      else chips.push("How do I grow revenue further this month?");

      chips.push("Which 5 clients should I call today?");
      chips.push(`What's my most profitable day of the week?`);

      if (ctx.staffPerformance.length > 1) chips.push("Which cleaner has the best retention?");
      if (ctx.inactive60Count > 0) chips.push(`Draft a win-back text for ${ctx.inactive60[0] || "inactive clients"}`);
      if (ctx.unconvertedLeadsCount > 0) chips.push("Which leads are most likely to convert?");

      chips.push("What should I charge for a deep clean?");

      return new Response(JSON.stringify({ chips: chips.slice(0, 6) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── AI INSIGHTS (structured) ───
    if (type === "insights") {
      let ctx: any = null;
      if (orgId) {
        try { ctx = await fetchBusinessContext(supabaseAdmin, orgId); } catch (e) { console.error("Context fetch error:", e); }
      }
      const snap = ctx || businessSnapshot || {};

      const response = await aiRequest(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: ctx
              ? buildSystemPrompt(ctx) + "\n\nReturn exactly 4 insights as structured data via the tool."
              : `You are TidyWise AI. Given snapshot: Revenue: $${snap.revenue || 0}, Hot Leads: ${snap.hotLeads || 0}, Churn: ${snap.churnCount || 0}, Conversion: ${snap.conversionRate || 0}%. Return 4 insights via the tool.`,
          },
          { role: "user", content: "Generate 4 specific, data-backed business insights." },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_insights",
            description: "Return 4 business insights as structured data.",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      priority: { type: "string", enum: ["Urgent", "Watch", "Opportunity", "Pricing"] },
                      insight: { type: "string" },
                      confidence: { type: "string", enum: ["High confidence", "Medium confidence"] },
                      action: { type: "string" },
                      promptText: { type: "string" },
                    },
                    required: ["priority", "insight", "confidence", "action", "promptText"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["insights"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_insights" } },
      });

      if (!response.ok) {
        const r = handleRateLimit(response.status);
        if (r) return r;
        const t = await response.text();
        console.error("AI error:", response.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      let insights: any[] = [];
      if (toolCall?.function?.arguments) {
        try { insights = JSON.parse(toolCall.function.arguments).insights || []; } catch { insights = []; }
      }
      return new Response(JSON.stringify({ insights }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── CHAT (streaming with full context) ───
    if (type === "chat") {
      let ctx: any = null;
      if (orgId) {
        try { ctx = await fetchBusinessContext(supabaseAdmin, orgId); } catch (e) { console.error("Context fetch error:", e); }
      }

      const systemPrompt = ctx
        ? buildSystemPrompt(ctx)
        : `You are TidyWise AI for a cleaning company. Snapshot: Revenue: $${(businessSnapshot?.revenue || 0)}, Leads: ${businessSnapshot?.hotLeads || 0}, Churn: ${businessSnapshot?.churnCount || 0}, Conversion: ${businessSnapshot?.conversionRate || 0}%. Give specific, actionable advice.`;

      const response = await aiRequest(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
        stream: true,
      });

      if (!response.ok) {
        const r = handleRateLimit(response.status);
        if (r) return r;
        const t = await response.text();
        console.error("AI error:", response.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    // ─── SCHEDULING ───
    if (type === "scheduling") {
      let ctx: any = null;
      if (orgId) {
        try { ctx = await fetchBusinessContext(supabaseAdmin, orgId); } catch (e) { console.error("Context fetch error:", e); }
      }
      const snap = ctx || businessSnapshot || {};

      const response = await aiRequest(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are TidyWise AI. Give one specific scheduling recommendation (2-3 sentences) referencing actual numbers." },
          { role: "user", content: ctx
            ? `Day distribution: ${JSON.stringify(ctx.dayDistribution)}. Best day: ${ctx.bestDay}. Worst day: ${ctx.worstDay}. Peak hour: ${ctx.peakHour}. Staff: ${ctx.activeStaff}. Total bookings (90d): ${ctx.totalBookings90d}.`
            : `Weekly distribution: ${JSON.stringify(snap.weeklyData || {})}. Best day: ${snap.bestDay || "N/A"}.`
          },
        ],
      });

      if (!response.ok) {
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      return new Response(JSON.stringify({ recommendation: data.choices?.[0]?.message?.content || "Unable to generate." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GROWTH PLAYBOOK ───
    if (type === "growth-playbook") {
      let ctx: any = null;
      if (orgId) {
        try { ctx = await fetchBusinessContext(supabaseAdmin, orgId); } catch (e) { console.error("Context fetch error:", e); }
      }

      const response = await aiRequest(LOVABLE_API_KEY, {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: ctx ? buildSystemPrompt(ctx) : "You are TidyWise AI, an expert cleaning business advisor.",
          },
          {
            role: "user",
            content: `Generate 6 unconventional, specific growth tips for my cleaning business. These should be non-obvious strategies that cleaning business owners don't learn traditionally. Include topics like:
- Using cancellations to upsell rescheduling with add-ons
- Identifying most profitable zip codes
- Turning 1-star reviews into 5-star recoveries
- Pricing psychology ($149 vs $150)
- Building a referral engine from top clients
- Catching "silent churn" early
- Using slow seasons to lock in recurring contracts

For each tip, reference my actual data where relevant. Format each with a bold title, explanation, and a specific action step.`,
          },
        ],
      });

      if (!response.ok) {
        const r = handleRateLimit(response.status);
        if (r) return r;
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      return new Response(JSON.stringify({ playbook: data.choices?.[0]?.message?.content || "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-analysis-center error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
