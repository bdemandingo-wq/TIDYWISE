import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { companyName, serviceType = "cleaning", audience = "all_eligible", timestamp } = await req.json();
    
    const uniqueId = timestamp || Date.now();

    // Audience-specific prompts
    const audienceContext = {
      leads: "Target: LEADS who have NOT booked yet. Write HIGH-PRESSURE conversion copy with urgency, limited-time offers, and strong calls-to-action to get them to book their FIRST service.",
      active_clients: "Target: ACTIVE CLIENTS who have already booked. Write LOYALTY and UPSELL copy - thank them for their business, offer exclusive perks, referral bonuses, or premium add-on services.",
      all_eligible: "Target: MIXED audience of leads and clients. Write balanced, friendly messaging that works for both new prospects and existing customers."
    };

    const systemPrompt = `You are an expert SMS marketing copywriter for ${serviceType} service businesses. 
${audienceContext[audience as keyof typeof audienceContext] || audienceContext.all_eligible}

Generate 3 UNIQUE high-conversion SMS templates that are:
- Under 160 characters each (SMS limit)
- Personal and friendly
- Include a clear call-to-action
- Use {first_name} and {company_name} placeholders
- End with "Reply STOP to opt out"
- Be creative and vary the approach each time

Important: Each generation should produce DIFFERENT messages. Be creative!
Always return valid JSON with exactly 3 templates.`;

    const userPrompt = `Generate 3 FRESH SMS templates for "${companyName || 'a cleaning business'}" targeting ${audience === 'leads' ? 'LEADS (non-converted prospects)' : audience === 'active_clients' ? 'ACTIVE CLIENTS (existing customers)' : 'all eligible customers'} (ID: ${uniqueId}):

1. "The Discount Offer" - ${audience === 'leads' ? 'First-time booking discount with urgency' : audience === 'active_clients' ? 'Loyalty reward or exclusive client discount' : 'A time-limited discount'}
2. "The Follow-Up" - ${audience === 'leads' ? 'Friendly nudge asking if they need help booking' : audience === 'active_clients' ? 'Check-in thanking them for their loyalty' : 'A friendly check-in'}
3. "The Referral Request" - ${audience === 'leads' ? 'Offer incentive if they refer before trying service' : audience === 'active_clients' ? 'Ask happy clients to refer friends for mutual rewards' : 'Referral with incentive'}

Return JSON format:
{
  "templates": [
    {"name": "The Discount Offer", "message": "..."},
    {"name": "The Follow-Up", "message": "..."},
    {"name": "The Referral Request", "message": "..."}
  ]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse the JSON from the response
    let templates;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      templates = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Return default templates if parsing fails
      templates = {
        templates: [
          {
            name: "The Discount Offer",
            message: `Hi {first_name}! 🎉 Get 20% off your next clean with {company_name}! Book by Friday to save. Reply STOP to opt out.`
          },
          {
            name: "The Follow-Up", 
            message: `Hi {first_name}! It's been a while. We miss you at {company_name}! Need a refresh? We're here when you're ready. Reply STOP to opt out.`
          },
          {
            name: "The Referral Request",
            message: `Hi {first_name}! Know someone who needs cleaning? Refer a friend to {company_name} & you both get $25 off! Reply STOP to opt out.`
          }
        ]
      };
    }

    return new Response(
      JSON.stringify({ success: true, ...templates }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-campaign-templates] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);