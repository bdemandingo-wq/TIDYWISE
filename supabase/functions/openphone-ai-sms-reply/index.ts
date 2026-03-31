import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIReplyRequest {
  conversationId: string;
  organizationId: string;
  inboundMessage: string;
  customerPhone: string;
  customerName?: string | null;
}

/**
 * Fetch recent call transcripts from OpenPhone API to learn communication style.
 */
async function fetchCallTranscripts(apiKey: string, phoneNumberId: string): Promise<string[]> {
  try {
    const url = new URL('https://api.openphone.com/v1/call-transcripts');
    url.searchParams.set('phoneNumberId', phoneNumberId);
    url.searchParams.set('maxResults', '10');

    const resp = await fetch(url.toString(), {
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    });

    if (!resp.ok) {
      console.log(`[ai-sms-reply] Transcripts API returned ${resp.status}, skipping`);
      return [];
    }

    const data = await resp.json();
    const transcripts: string[] = [];

    for (const item of (data.data || []).slice(0, 5)) {
      // transcript may be a string or array of dialogue turns
      if (typeof item.transcript === 'string' && item.transcript.trim()) {
        transcripts.push(item.transcript.trim().substring(0, 800));
      } else if (Array.isArray(item.transcript)) {
        const lines = item.transcript
          .map((t: any) => `${t.speaker || 'Agent'}: ${t.text || ''}`)
          .join('\n');
        if (lines.trim()) transcripts.push(lines.substring(0, 800));
      }
    }

    return transcripts;
  } catch (err) {
    console.error('[ai-sms-reply] Error fetching transcripts:', err);
    return [];
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.error('[ai-sms-reply] LOVABLE_API_KEY not configured');
      return new Response(JSON.stringify({ success: false, error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json() as AIReplyRequest;
    const { conversationId, organizationId, inboundMessage, customerPhone, customerName } = body;

    if (!conversationId || !organizationId || !inboundMessage) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[ai-sms-reply] Processing reply for org=${organizationId} conv=${conversationId}`);

    // Fetch all context in parallel
    const [
      smsSettingsRes,
      businessSettingsRes,
      servicesRes,
      conversationHistoryRes,
      styleExamplesRes,
    ] = await Promise.all([
      // OpenPhone settings (for API key + phone number)
      supabase.from('organization_sms_settings')
        .select('openphone_api_key, openphone_phone_number_id')
        .eq('organization_id', organizationId)
        .maybeSingle(),

      // Business info
      supabase.from('business_settings')
        .select('company_name, company_phone, company_email, business_address')
        .eq('organization_id', organizationId)
        .maybeSingle(),

      // Services offered
      supabase.from('services')
        .select('name, description, price')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .limit(10),

      // This conversation's history (last 12 messages for context)
      supabase.from('sms_messages')
        .select('direction, content, sent_at')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: false })
        .limit(12),

      // Past OUTBOUND messages from this org across conversations (style examples)
      supabase.from('sms_messages')
        .select('content, sent_at')
        .eq('organization_id', organizationId)
        .eq('direction', 'outbound')
        .not('conversation_id', 'eq', conversationId)
        .order('sent_at', { ascending: false })
        .limit(50),
    ]);

    const smsSettings = smsSettingsRes.data;
    const business = businessSettingsRes.data;
    const services = servicesRes.data || [];
    const conversationHistory = (conversationHistoryRes.data || []).reverse();
    const styleExamples = styleExamplesRes.data || [];

    if (!smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      console.error('[ai-sms-reply] OpenPhone not configured for org:', organizationId);
      return new Response(JSON.stringify({ success: false, error: 'OpenPhone not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');
    const pnMatch = smsSettings.openphone_phone_number_id.match(/(PN[A-Za-z0-9]+)/);
    const phoneNumberId = pnMatch ? pnMatch[1] : smsSettings.openphone_phone_number_id;
    const companyName = business?.company_name || 'our company';

    // Fetch call transcripts (non-blocking, best-effort)
    const transcripts = await fetchCallTranscripts(apiKey, phoneNumberId);

    // Build style examples section
    const styleSection = styleExamples.length > 0
      ? `Here are examples of how ${companyName} typically texts customers (most recent first):\n` +
        styleExamples
          .slice(0, 30)
          .map(m => `• "${m.content}"`)
          .join('\n')
      : '';

    // Build transcript section
    const transcriptSection = transcripts.length > 0
      ? `\nHere are excerpts from recent call transcripts showing how the team communicates:\n` +
        transcripts.map((t, i) => `[Call ${i + 1}]:\n${t}`).join('\n\n')
      : '';

    // Build conversation context
    const conversationContext = conversationHistory.length > 0
      ? conversationHistory.map(m =>
          `${m.direction === 'inbound' ? (customerName || 'Customer') : companyName}: ${m.content}`
        ).join('\n')
      : '(No prior messages in this conversation)';

    // Build services info
    const servicesInfo = services.length > 0
      ? services.map(s => `• ${s.name}${s.price ? ` – $${s.price}` : ''}`).join('\n')
      : '';

    const systemPrompt = `You are the customer service representative for ${companyName}, a professional cleaning company. Your job is to reply to incoming text messages from customers.

${styleSection}
${transcriptSection}

BUSINESS INFO:
- Company: ${companyName}
${business?.company_phone ? `- Phone: ${business.company_phone}` : ''}
${business?.company_email ? `- Email: ${business.company_email}` : ''}
${servicesInfo ? `\nSERVICES:\n${servicesInfo}` : ''}

INSTRUCTIONS:
- Match the tone and style shown in the examples above (casual yet professional, warm, concise)
- Keep replies SHORT (1-3 sentences max) — this is SMS, not email
- Be helpful and friendly
- If they ask about pricing/booking, invite them to book or provide a quick answer
- Do NOT use emojis unless you see them in the examples above
- Do NOT start with "Hi [name]!" unless that pattern appears in the examples
- Reply ONLY with the SMS text — no quotes, no explanation, no "Reply:" prefix`;

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `CONVERSATION HISTORY:\n${conversationContext}\n\nNEW MESSAGE FROM ${customerName || 'CUSTOMER'}:\n${inboundMessage}\n\nWrite a reply:`,
      },
    ];

    console.log(`[ai-sms-reply] Calling AI API for org=${organizationId}`);

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages,
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`[ai-sms-reply] AI API error ${aiResp.status}: ${errText}`);
      return new Response(JSON.stringify({ success: false, error: 'AI generation failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiResp.json();
    const generatedReply = aiData.choices?.[0]?.message?.content?.trim();

    if (!generatedReply) {
      console.error('[ai-sms-reply] Empty reply from AI');
      return new Response(JSON.stringify({ success: false, error: 'AI returned empty reply' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[ai-sms-reply] Generated reply: "${generatedReply}"`);

    // Format customer phone
    let formattedPhone = customerPhone.replace(/\D/g, '');
    if (formattedPhone.length === 10) formattedPhone = `+1${formattedPhone}`;
    else if (!formattedPhone.startsWith('+')) formattedPhone = `+${formattedPhone}`;

    // Send the reply via OpenPhone
    const sendResp = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: phoneNumberId,
        to: [formattedPhone],
        content: generatedReply,
      }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text();
      console.error(`[ai-sms-reply] OpenPhone send error ${sendResp.status}: ${errText}`);
      return new Response(JSON.stringify({ success: false, error: 'Failed to send reply via OpenPhone' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sendResult = await sendResp.json();
    const openphoneMessageId = sendResult.data?.id;

    console.log(`[ai-sms-reply] Reply sent successfully, openphoneMessageId=${openphoneMessageId}`);

    // Save the sent reply to the DB
    await supabase.from('sms_messages').insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      direction: 'outbound',
      content: generatedReply,
      status: 'sent',
      openphone_message_id: openphoneMessageId || null,
      sent_at: new Date().toISOString(),
      metadata: { ai_generated: true },
    });

    // Update conversation timestamp
    await supabase.from('sms_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return new Response(JSON.stringify({ success: true, reply: generatedReply }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ai-sms-reply] Error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
};

serve(handler);
