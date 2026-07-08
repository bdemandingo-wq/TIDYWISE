import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { anthropicChat, MODEL_HAIKU } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Simple in-memory per-IP rate limiter to throttle AI abuse on this public endpoint.
// 20 requests per IP per 10 minutes.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt < now) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Lead-creation throttle: 1 lead per (org+ip+email) per hour, to stop CRM spam
// even when the regex heuristics match.
const LEAD_RATE_WINDOW_MS = 60 * 60 * 1000;
const leadHits = new Map<string, number>();
function isLeadRateLimited(key: string): boolean {
  const now = Date.now();
  const last = leadHits.get(key);
  if (last && now - last < LEAD_RATE_WINDOW_MS) return true;
  leadHits.set(key, now);
  return false;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: rate-limit by client IP to prevent AI credit / lead-spam abuse
  const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Too many requests. Please try again shortly.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { message, conversationHistory, organizationId } = await req.json();

    if (!message || !organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing message or organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: validate organizationId format & input sizes to prevent abuse
    // (lead spam injection, prompt injection, AI quota burn).
    if (typeof organizationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (typeof message !== "string" || message.length > 2000) {
      return new Response(
        JSON.stringify({ success: false, error: "Message too long" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const safeHistory = Array.isArray(conversationHistory)
      ? conversationHistory
          .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-20)
          .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
      : [];

    // Get business info and services
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    // SECURITY: only allow the chatbot for orgs that have been configured
    // (business_settings row exists). Prevents arbitrary org_id targeting.
    if (!businessSettings) {
      return new Response(
        JSON.stringify({ success: false, error: "Chatbot not enabled for this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: services } = await supabase
      .from('services')
      .select('name, description, price, duration')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    const companyName = businessSettings?.company_name || 'Our Cleaning Company';
    const companyPhone = businessSettings?.company_phone || '';
    const companyEmail = businessSettings?.company_email || '';

    const servicesInfo = services?.map(s => 
      `- ${s.name}: ${s.description || 'Professional cleaning service'} - Starting at $${s.price} (${s.duration} min)`
    ).join('\n') || 'Various cleaning services available';

    const systemPrompt = `You are a friendly, helpful customer service chatbot for ${companyName}, a professional cleaning service. Your job is to:

1. Answer questions about our services
2. Help customers understand pricing
3. Guide them to book appointments
4. Collect their information for follow-up

BUSINESS INFO:
- Company: ${companyName}
- Phone: ${companyPhone || 'Available in app'}
- Email: ${companyEmail || 'Available in app'}

OUR SERVICES:
${servicesInfo}

GUIDELINES:
- Be warm, professional, and concise (max 3 sentences per response)
- If asked about exact pricing, explain that final quotes depend on home size and condition
- For booking requests, collect: name, phone, email, service type, preferred date
- If customer provides booking info, confirm you'll have someone reach out
- Don't make up information you don't know
- For complaints, apologize and offer to connect them with management

If the customer wants to book:
1. Ask which service they're interested in
2. Get their contact info (name, phone, email)
3. Ask about home size (bedrooms/bathrooms) and preferred date
4. Confirm the info and let them know someone will reach out

Always end with asking if they have other questions.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      { role: 'user', content: message }
    ];

    // Call AI
    const aiResponse = await anthropicChat(
      { model: MODEL_HAIKU, messages, max_tokens: 800 },
      { corsHeaders },
    );

    if (!aiResponse.ok) {
      // anthropicChat already returned a well-formed JSON error response — forward it.
      const errBody = await aiResponse.text();
      return new Response(errBody, {
        status: aiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices?.[0]?.message?.content || "I apologize, I'm having trouble right now. Please call us directly for assistance.";

    // Check if the conversation contains booking intent with contact info
    // This is a simple heuristic - you could make this more sophisticated
    const fullConversation = [...safeHistory, { role: 'user', content: message }].map(m => m.content).join(' ');
    const hasEmail = /[\w.-]+@[\w.-]+\.\w+/.test(fullConversation);
    const hasPhone = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(fullConversation);
    const hasBookingIntent = /book|schedule|appointment|reserve|available/i.test(fullConversation);

    let leadCreated = false;

    // SECURITY: throttle lead creation per (org, ip) to prevent CRM spam.
    // Even with valid booking intent we cap one lead per IP per org per hour.
    if (hasBookingIntent && (hasEmail || hasPhone)) {
      const emailMatch = fullConversation.match(/[\w.-]+@[\w.-]+\.\w+/);
      const phoneMatch = fullConversation.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
      const nameMatch = fullConversation.match(/(?:my name is|i'm|i am|name:?)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);

      if (emailMatch) {
        const leadKey = `${organizationId}:${clientIp}:${emailMatch[0].toLowerCase()}`;
        if (!isLeadRateLimited(leadKey)) {
          try {
            await supabase.from('leads').insert({
              organization_id: organizationId,
              name: (nameMatch?.[1] || 'Chatbot Lead').slice(0, 100),
              email: emailMatch[0].slice(0, 255),
              phone: phoneMatch?.[0]?.replace(/[-.\s]/g, '').slice(0, 20) || null,
              source: 'chatbot',
              status: 'new',
              message: `Chatbot conversation:\n${message.slice(0, 1000)}`,
              service_interest: services?.[0]?.name || 'General Inquiry',
            });
            leadCreated = true;
            console.log('[booking-chatbot] Lead created from chat');
          } catch (leadError) {
            console.error('[booking-chatbot] Failed to create lead:', leadError);
          }
        } else {
          console.log('[booking-chatbot] Lead creation rate-limited for', leadKey);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: assistantMessage,
        leadCreated 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[booking-chatbot] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
