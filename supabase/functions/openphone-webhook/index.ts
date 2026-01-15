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

interface OpenPhoneContact {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phoneNumbers?: Array<{ phoneNumber: string }>;
}

// Fetch contact name from OpenPhone API
async function fetchOpenPhoneContactName(
  phoneNumber: string,
  apiKey: string
): Promise<string | null> {
  try {
    // Format phone number for query (remove + if present)
    const formattedPhone = phoneNumber.replace(/^\+/, '');
    
    console.log(`[openphone-webhook] Fetching contact for phone: ${phoneNumber}`);
    
    const response = await fetch(
      `https://api.openphone.com/v1/contacts?phoneNumbers=${encodeURIComponent(phoneNumber)}`,
      {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.log(`[openphone-webhook] OpenPhone API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[openphone-webhook] OpenPhone contacts response:`, JSON.stringify(data));
    
    // OpenPhone returns { data: [...contacts] }
    const contacts = data.data as OpenPhoneContact[] | undefined;
    
    if (!contacts || contacts.length === 0) {
      console.log(`[openphone-webhook] No contacts found for ${phoneNumber}`);
      return null;
    }

    const contact = contacts[0];
    const firstName = contact.firstName?.trim() || '';
    const lastName = contact.lastName?.trim() || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    
    if (fullName) {
      console.log(`[openphone-webhook] Found contact name: ${fullName}`);
      return fullName;
    }
    
    // Fallback to company name if no personal name
    if (contact.company) {
      console.log(`[openphone-webhook] Found company name: ${contact.company}`);
      return contact.company;
    }
    
    return null;
  } catch (error) {
    console.error(`[openphone-webhook] Error fetching contact:`, error);
    return null;
  }
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
    // OpenPhone event types: message.received (inbound), message.created/message.completed/message.delivered (outbound)
    const isInbound = payload.type === 'message.received';
    const isOutbound = payload.type === 'message.completed' || payload.type === 'message.created' || payload.type === 'message.delivered';
    
    console.log(`[openphone-webhook] Event type: ${payload.type}, isInbound: ${isInbound}, isOutbound: ${isOutbound}`);
    
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
    const phoneNumberId = message.phoneNumberId; // This is always the org's OpenPhone number ID
    const content = message.body;
    const openphoneMessageId = message.id;
    const direction = isInbound ? 'inbound' : 'outbound';
    const customerPhone = isInbound ? fromPhone : toPhone;

    console.log(`[openphone-webhook] ${direction} SMS - from ${fromPhone} to ${toPhone} (phoneNumberId: ${phoneNumberId})`);

    // Find the organization by the OpenPhone phone number ID and get API key
    const { data: smsSettings, error: settingsError } = await supabase
      .from('organization_sms_settings')
      .select('organization_id, openphone_api_key')
      .eq('openphone_phone_number_id', phoneNumberId)
      .maybeSingle();

    // Also try matching by partial phone number ID (in case URL was stored)
    let organizationId = smsSettings?.organization_id;
    let openphoneApiKey = smsSettings?.openphone_api_key;
    
    if (!organizationId) {
      // Try finding by partial match
      const { data: allSettings } = await supabase
        .from('organization_sms_settings')
        .select('organization_id, openphone_phone_number_id, openphone_api_key');

      if (allSettings) {
        for (const setting of allSettings) {
          if (setting.openphone_phone_number_id?.includes(phoneNumberId) ||
              phoneNumberId.includes(setting.openphone_phone_number_id || '')) {
            organizationId = setting.organization_id;
            openphoneApiKey = setting.openphone_api_key;
            break;
          }
        }
      }
    }

    if (!organizationId) {
      console.error("[openphone-webhook] Could not find organization for phone number ID:", phoneNumberId);
      return new Response(
        JSON.stringify({ success: false, error: "Organization not found for this phone number" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[openphone-webhook] Found organization: ${organizationId}`);

    // Find or create conversation using the customer phone (not the org's OpenPhone number)
    const { data: existingConversation } = await supabase
      .from('sms_conversations')
      .select('id, customer_name')
      .eq('organization_id', organizationId)
      .eq('customer_phone', customerPhone)
      .maybeSingle();

    let conversationId: string;
    let needsContactLookup = false;

    if (existingConversation) {
      conversationId = existingConversation.id;
      needsContactLookup = !existingConversation.customer_name;
      console.log(`[openphone-webhook] Found existing conversation: ${conversationId}, has name: ${!needsContactLookup}`);
    } else {
      // Try to find customer by phone in our customers table
      const { data: customer } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .eq('organization_id', organizationId)
        .eq('phone', customerPhone)
        .maybeSingle();

      let customerName = customer ? `${customer.first_name} ${customer.last_name}` : null;
      
      // If no local customer found and we have API key, try OpenPhone
      if (!customerName && openphoneApiKey) {
        customerName = await fetchOpenPhoneContactName(customerPhone, openphoneApiKey);
      }
      
      needsContactLookup = !customerName;

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

    // If existing conversation has no name, try to fetch from OpenPhone
    if (needsContactLookup && openphoneApiKey && existingConversation) {
      const contactName = await fetchOpenPhoneContactName(customerPhone, openphoneApiKey);
      if (contactName) {
        await supabase
          .from('sms_conversations')
          .update({ customer_name: contactName })
          .eq('id', conversationId);
        console.log(`[openphone-webhook] Updated conversation with contact name: ${contactName}`);
      }
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