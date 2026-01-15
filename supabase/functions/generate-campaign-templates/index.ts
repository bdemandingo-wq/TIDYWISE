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

    // Audience-specific prompts - Alex Hormozi Million Dollar Offers style
    const audienceContext = {
      inactive_clients: "Target: INACTIVE CLIENTS who haven't booked in a while. Write WIN-BACK copy that's direct, valuable, and creates FOMO. Make them feel like they're missing out on something amazing.",
      active_clients: "Target: ACTIVE CLIENTS who have already booked. Write LOYALTY and UPSELL copy - make them feel like VIPs, offer exclusive insider deals, stack value so they can't say no.",
      all_eligible: "Target: MIXED audience. Write punchy, value-stacked messaging that makes the offer feel irresistible to anyone."
    };

    const systemPrompt = `You are a DIRECT RESPONSE SMS copywriter in the style of Alex Hormozi from "$100M Offers".

Your style rules:
- CASUAL and conversational, like texting a friend
- Lead with VALUE and SPECIFICS (not vague promises)
- Create URGENCY without being sleazy
- Stack the value so saying no feels stupid
- Use pattern interrupts and unexpected hooks
- Short punchy sentences. No fluff.
- Sound like a real person, not a corporation

${audienceContext[audience as keyof typeof audienceContext] || audienceContext.all_eligible}

Generate 3 UNIQUE SMS templates that are:
- Under 160 characters (SMS limit)
- Casual, punchy, Hormozi-style direct response
- Include clear CTA
- Use {first_name} and {company_name} placeholders
- End with "Reply STOP to opt out"

Always return valid JSON with exactly 3 templates.`;

    const userPrompt = `Generate 3 FRESH Hormozi-style SMS templates for "${companyName || 'a cleaning business'}" targeting ${audience === 'inactive_clients' ? 'INACTIVE CLIENTS (win them back)' : audience === 'active_clients' ? 'ACTIVE CLIENTS (VIP treatment)' : 'all eligible customers'} (ID: ${uniqueId}):

1. "The No-Brainer" - ${audience === 'inactive_clients' ? 'Stack so much value they feel dumb not booking. Make coming back irresistible.' : audience === 'active_clients' ? 'Exclusive VIP deal that makes them feel special for being loyal' : 'An offer so good it sells itself'}
2. "The Pattern Interrupt" - ${audience === 'inactive_clients' ? 'Unexpected angle - maybe self-deprecating, maybe bold question' : audience === 'active_clients' ? 'Surprising way to show appreciation or offer upgrade' : 'Something unexpected that stops the scroll'}
3. "The FOMO Bomb" - ${audience === 'inactive_clients' ? 'Limited spots/time, social proof, fear of missing out' : audience === 'active_clients' ? 'Exclusive early access or members-only deal expiring soon' : 'Scarcity + value combo'}

Return JSON format:
{
  "templates": [
    {"name": "The No-Brainer", "message": "..."},
    {"name": "The Pattern Interrupt", "message": "..."},
    {"name": "The FOMO Bomb", "message": "..."}
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