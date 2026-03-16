import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, messages, businessSnapshot } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (type === "insights") {
      const snap = businessSnapshot || {};
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are TidyWise AI, a business intelligence assistant for cleaning companies. Given this business snapshot: Revenue: $${snap.revenue || 0}, Hot Leads: ${snap.hotLeads || 0}, Churn Risk Clients: ${snap.churnCount || 0}, Conversion Rate: ${snap.conversionRate || 0}%, Best Day: ${snap.bestDay || "N/A"}, return exactly 4 JSON objects in an array. Each object: { "priority": "Urgent|Watch|Opportunity|Pricing", "insight": "2-sentence specific business insight with dollar amounts", "confidence": "High confidence|Medium confidence", "action": "short CTA label", "promptText": "full prompt the user can send for help" }. Return only valid JSON array, no markdown, no code fences.`,
            },
            { role: "user", content: "Generate 4 business insights based on the current data." },
          ],
          tools: [
            {
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
            },
          ],
          tool_choice: { type: "function", function: { name: "generate_insights" } },
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const t = await response.text();
        console.error("AI gateway error:", status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      let insights = [];
      if (toolCall?.function?.arguments) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments);
          insights = parsed.insights || [];
        } catch { insights = []; }
      }
      return new Response(JSON.stringify({ insights }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "chat") {
      const snap = businessSnapshot || {};
      const systemPrompt = `You are TidyWise AI, a business intelligence assistant for a cleaning company. Here is their current business snapshot: Monthly Revenue: $${snap.revenue || 0}, Hot Leads: ${snap.hotLeads || 0}, Churn Risk Clients: ${snap.churnCount || 0}, Conversion Rate: ${snap.conversionRate || 0}%, Best Day: ${snap.bestDay || "N/A"}. Provide specific, actionable advice referencing their actual numbers. Keep answers concise (under 200 words).`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
          stream: true,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const t = await response.text();
        console.error("AI gateway error:", status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    if (type === "scheduling") {
      const snap = businessSnapshot || {};
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are TidyWise AI. Give one short scheduling recommendation (2-3 sentences) based on the data." },
            { role: "user", content: `Weekly booking distribution: ${JSON.stringify(snap.weeklyData || {})}. Best day: ${snap.bestDay || "N/A"}. Total staff: ${snap.staffCount || "unknown"}.` },
          ],
        }),
      });

      if (!response.ok) {
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const recommendation = data.choices?.[0]?.message?.content || "Unable to generate recommendation.";
      return new Response(JSON.stringify({ recommendation }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-analysis-center error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
