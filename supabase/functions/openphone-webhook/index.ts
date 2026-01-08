import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-openphone-signature',
};

interface OpenPhoneWebhookPayload {
  type: string;
  data: {
    object: {
      id: string;
      from: string;
      to: string;
      body: string;
      direction: string;
      createdAt: string;
      phoneNumberId: string;
    };
  };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[openphone-webhook] Missing Supabase configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json() as OpenPhoneWebhookPayload;
    console.log("[openphone-webhook] Received payload:", JSON.stringify(payload, null, 2));

    // Process both incoming messages AND outgoing messages sent from OpenPhone app
    const isInbound = payload.type === 'message.received';
    const isOutbound = payload.type === 'message.completed' || payload.type === 'message.created';
    
    if (!isInbound && !isOutbound) {
      console.log("[openphone-webhook] Ignoring event type:", payload.type);
      return new Response(
        JSON.stringify({ success: true, message: "Event type ignored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = payload.data.object;
    const fromPhone = message.from;
    const toPhone = message.to;
    const toPhoneNumberId = message.phoneNumberId;
    const content = message.body;
    const openphoneMessageId = message.id;
    const direction = isInbound ? 'inbound' : 'outbound';
    const customerPhone = isInbound ? fromPhone : toPhone;

    console.log(`[openphone-webhook] ${direction} SMS - from ${fromPhone} to ${toPhone} (phone ID: ${toPhoneNumberId})`);

    // Find the organization by the OpenPhone phone number ID
    const { data: smsSettings, error: settingsError } = await supabase
      .from('organization_sms_settings')
      .select('organization_id')
      .eq('openphone_phone_number_id', toPhoneNumberId)
      .maybeSingle();

    // Also try matching by partial phone number ID (in case URL was stored)
    let organizationId = smsSettings?.organization_id;
    
    if (!organizationId) {
      // Try finding by partial match
      const { data: allSettings } = await supabase
        .from('organization_sms_settings')
        .select('organization_id, openphone_phone_number_id');

      if (allSettings) {
        for (const setting of allSettings) {
          if (setting.openphone_phone_number_id?.includes(toPhoneNumberId) ||
              toPhoneNumberId.includes(setting.openphone_phone_number_id || '')) {
            organizationId = setting.organization_id;
            break;
          }
        }
      }
    }

    if (!organizationId) {
      console.error("[openphone-webhook] Could not find organization for phone number ID:", toPhoneNumberId);
      return new Response(
        JSON.stringify({ success: false, error: "Organization not found for this phone number" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[openphone-webhook] Found organization: ${organizationId}`);

    // Find or create conversation using the customer phone (not the org's OpenPhone number)
    const { data: existingConversation } = await supabase
      .from('sms_conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('customer_phone', customerPhone)
      .maybeSingle();

    let conversationId: string;

    if (existingConversation) {
      conversationId = existingConversation.id;
      console.log(`[openphone-webhook] Found existing conversation: ${conversationId}`);
    } else {
      // Try to find customer by phone
      const { data: customer } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .eq('organization_id', organizationId)
        .eq('phone', customerPhone)
        .maybeSingle();

      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : null;

      // Create new conversation
      const { data: newConversation, error: createError } = await supabase
        .from('sms_conversations')
        .insert({
          organization_id: organizationId,
          customer_phone: customerPhone,
          customer_name: customerName,
          customer_id: customer?.id || null,
        })
        .select('id')
        .single();

      if (createError) {
        console.error("[openphone-webhook] Error creating conversation:", createError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to create conversation" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      conversationId = newConversation.id;
      console.log(`[openphone-webhook] Created new conversation: ${conversationId}`);
    }

    // Check if message already exists (avoid duplicates from our app sending)
    const { data: existingMessage } = await supabase
      .from('sms_messages')
      .select('id')
      .eq('openphone_message_id', openphoneMessageId)
      .maybeSingle();
    
    if (existingMessage) {
      console.log(`[openphone-webhook] Message ${openphoneMessageId} already exists, skipping`);
      return new Response(
        JSON.stringify({ success: true, message: "Message already exists" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert the message
    const { error: messageError } = await supabase
      .from('sms_messages')
      .insert({
        conversation_id: conversationId,
        organization_id: organizationId,
        direction: direction,
        content: content,
        status: direction === 'inbound' ? 'received' : 'sent',
        openphone_message_id: openphoneMessageId,
        sent_at: message.createdAt || new Date().toISOString(),
      });

    if (messageError) {
      console.error("[openphone-webhook] Error inserting message:", messageError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update conversation's last_message_at and increment unread_count for inbound only
    if (direction === 'inbound') {
      // First get current unread count
      const { data: currentConv } = await supabase
        .from('sms_conversations')
        .select('unread_count')
        .eq('id', conversationId)
        .single();

      const newUnreadCount = (currentConv?.unread_count || 0) + 1;

      await supabase
        .from('sms_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: newUnreadCount,
        })
        .eq('id', conversationId);
    } else {
      // For outbound, just update last_message_at
      await supabase
        .from('sms_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
    }

    console.log(`[openphone-webhook] Successfully saved ${direction} message`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[openphone-webhook] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);