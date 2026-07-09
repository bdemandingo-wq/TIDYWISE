import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAiRateLimit } from "../_shared/ai-rate-limit.ts";
import { enforceAiCredit } from "../_shared/ai-credits.ts";
import { anthropicChat, MODEL_HAIKU } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName, fileType } = await req.json();

    if (!fileContent) {
      return new Response(
        JSON.stringify({ error: "No file content provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      throw new Error("AI is not configured");
    }

    // AI rate limiting (per-user 30/min if authenticated; otherwise global 200/hr).
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const { data: userData } = await admin.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }
    const GLOBAL_PARSE_SCOPE = "00000000-0000-0000-0000-0000000dab11";
    const limited = await enforceAiRateLimit(admin, {
      userId,
      orgId: userId ? null : GLOBAL_PARSE_SCOPE,
      corsHeaders,
    });
    if (limited) return limited;

    // Per-org AI credit consumption (looks up the caller's primary org)
    if (userId) {
      const { data: membership } = await admin
        .from("org_memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (membership?.organization_id) {
        const denied = await enforceAiCredit(admin, { orgId: membership.organization_id, corsHeaders });
        if (denied) return denied;
      }
    }


    const prompt = `You are a pricing data extraction expert. Analyze the following content from a pricing file (${fileName}, type: ${fileType}) and extract all service pricing information.

Return a JSON object with this exact structure:
{
  "services": [
    {
      "name": "Service name",
      "description": "Brief description if available",
      "basePrice": 100,
      "duration": 60,
      "priceType": "flat" or "hourly" or "variable",
      "extras": [
        { "name": "Extra service name", "price": 25 }
      ]
    }
  ],
  "notes": "Any important pricing notes or conditions"
}

Important rules:
- Extract ALL services mentioned with their prices
- Duration should be in minutes (estimate if not specified)
- BasePrice should be a number (remove currency symbols)
- If price ranges are given, use the starting/minimum price
- Include any add-ons or extras as separate items in the extras array
- If a service has no clear price, set basePrice to 0 and add a note

Here is the file content to analyze:

${fileContent}`;

    const response = await anthropicChat(
      {
        model: MODEL_HAIKU,
        messages: [
          {
            role: "system",
            content: "You are a pricing data extraction assistant. Always respond with valid JSON only, no markdown formatting or code blocks. Extract pricing data accurately from the provided content.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4000,
      },
      { corsHeaders },
    );

    if (!response.ok) {
      const errBody = await response.text();
      return new Response(errBody, {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Try to parse the JSON response
    let parsedPricing;
    try {
      // Remove any markdown code block markers if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedPricing = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ 
          error: "Could not parse pricing data from file. Please ensure the file contains clear pricing information.",
          rawResponse: content 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, pricing: parsedPricing }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in parse-pricing-file:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
