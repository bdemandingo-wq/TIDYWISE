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

/**
 * Normalize a phone number to its last 10 digits for comparison.
 * Handles formats like +15106465090, (510) 646-5090, 5106465090, etc.
 */
function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // If 11 digits starting with 1 (US country code), strip it
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits;
}

/**
 * Find a contact name by searching customers, leads, and staff tables
 * using normalized phone number matching.
 */
async function findLocalContactName(
  supabase: any,
  organizationId: string,
  phone: string
): Promise<{ name: string | null; customerId: string | null }> {
  const normalizedPhone = normalizePhoneDigits(phone);
  
  // Fetch all org customers/leads/staff with phones in parallel
  const [customersRes, leadsRes, staffRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, first_name, last_name, phone')
      .eq('organization_id', organizationId)
      .not('phone', 'is', null),
    supabase
      .from('leads')
      .select('id, name, phone')
      .eq('organization_id', organizationId)
      .not('phone', 'is', null),
    supabase
      .from('staff')
      .select('id, name, phone')
      .eq('organization_id', organizationId)
      .not('phone', 'is', null),
  ]);

  // Check customers
  const customer = customersRes.data?.find((c: any) =>
    c.phone && normalizePhoneDigits(c.phone) === normalizedPhone
  );
  if (customer) {
    return { name: `${customer.first_name} ${customer.last_name}`.trim(), customerId: customer.id };
  }

  // Check leads
  const lead = leadsRes.data?.find((l: any) =>
    l.phone && normalizePhoneDigits(l.phone) === normalizedPhone
  );
  if (lead) {
    return { name: lead.name, customerId: null };
  }

  // Check staff
  const staffMember = staffRes.data?.find((s: any) =>
    s.phone && normalizePhoneDigits(s.phone) === normalizedPhone
  );
  if (staffMember) {
    return { name: staffMember.name, customerId: null };
  }

  return { name: null, customerId: null };
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

    // Detect if this is a call event vs a message event
    // Call events should NOT be treated as SMS messages
    const eventType = payload.type || '';
    const isCallEvent = eventType.startsWith('call.');
    const objectType = (payload.data?.object as any)?.object || '';

    // Process incoming messages, outgoing messages, and delivery status updates
    // OpenPhone event types vary; rely on payload direction when available.
    // Common types we see:
    // - message.received (inbound)
    // - message.sent / message.created / message.completed (outbound)
    // - message.delivered (delivery updates)
    const rawObjectDirection = payload.data?.object?.direction?.toLowerCase?.() || '';

    // IMPORTANT: Only use direction for SMS detection if it's NOT a call event
    const isInbound =
      !isCallEvent && (
        payload.type === 'message.received' ||
        rawObjectDirection === 'inbound' ||
        rawObjectDirection === 'incoming'
      );

    const isOutbound =
      !isCallEvent && (
        payload.type === 'message.sent' ||
        payload.type === 'message.created' ||
        payload.type === 'message.completed' ||
        rawObjectDirection === 'outbound' ||
        rawObjectDirection === 'outgoing'
      );

    const isDeliveryUpdate = payload.type === 'message.delivered';

    // Missed call detection
    const isMissedCall = payload.type === 'call.completed' && 
      (payload.data?.object as any)?.status === 'missed';

    console.log(
      `[openphone-webhook] Event type: ${payload.type}, objectType: ${objectType}, direction: ${rawObjectDirection || 'n/a'}, isCallEvent: ${isCallEvent}, isInbound: ${isInbound}, isOutbound: ${isOutbound}, isDeliveryUpdate: ${isDeliveryUpdate}, isMissedCall: ${isMissedCall}`
    );

    // Handle delivery status updates (read receipts)
    // Also insert the message if it doesn't exist (for messages sent directly from OpenPhone)
    if (isDeliveryUpdate) {
      const openphoneMessageId = payload.data.object.id;
      const messageObj = payload.data.object;
      console.log(`[openphone-webhook] Processing delivery status for message: ${openphoneMessageId}`);

      // Check if message already exists
      const { data: existingMsg } = await supabase
        .from('sms_messages')
        .select('id')
        .eq('openphone_message_id', openphoneMessageId)
        .maybeSingle();

      if (!existingMsg) {
        // Message doesn't exist - this was sent directly from OpenPhone, not through our app
        // We need to insert it first, then mark as delivered
        console.log(`[openphone-webhook] Message ${openphoneMessageId} not found, inserting as outbound message first`);

        const phoneNumberId = messageObj.phoneNumberId;
        // Handle group chats: use first phone number to avoid duplicate conversations
        const rawCustomerPhone = messageObj.to; // For outbound, 'to' is the customer
        const customerPhone = rawCustomerPhone.includes(',') 
          ? rawCustomerPhone.split(',')[0].trim() 
          : rawCustomerPhone;

        // Find organization by phone number ID
        const { data: smsSettings } = await supabase
          .from('organization_sms_settings')
          .select('organization_id')
          .eq('openphone_phone_number_id', phoneNumberId)
          .maybeSingle();

        let organizationId = smsSettings?.organization_id;

        if (!organizationId) {
          // Try partial match
          const { data: allSettings } = await supabase
            .from('organization_sms_settings')
            .select('organization_id, openphone_phone_number_id');

          if (allSettings) {
            for (const setting of allSettings) {
              if (
                setting.openphone_phone_number_id?.includes(phoneNumberId) ||
                phoneNumberId.includes(setting.openphone_phone_number_id || '')
              ) {
                organizationId = setting.organization_id;
                break;
              }
            }
          }
        }

        if (organizationId) {
          // Find or create conversation
          const { data: conv } = await supabase
            .from('sms_conversations')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('customer_phone', customerPhone)
            .maybeSingle();

          let conversationId = conv?.id;

          if (!conversationId) {
            const { data: newConv } = await supabase
              .from('sms_conversations')
              .insert({
                organization_id: organizationId,
                customer_phone: customerPhone,
                customer_name: null,
              })
              .select('id')
              .single();
            conversationId = newConv?.id;
          }

          if (conversationId) {
            // Insert the outbound message
            await supabase.from('sms_messages').insert({
              conversation_id: conversationId,
              organization_id: organizationId,
              direction: 'outbound',
              content: messageObj.body || '',
              status: 'delivered',
              delivery_status: 'delivered',
              openphone_message_id: openphoneMessageId,
              sent_at: messageObj.createdAt || new Date().toISOString(),
              delivered_at: new Date().toISOString(),
            });

            // Update conversation timestamp
            await supabase
              .from('sms_conversations')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', conversationId);

            console.log(`[openphone-webhook] Inserted outbound message ${openphoneMessageId} for conversation ${conversationId}`);
          }
        } else {
          console.log(`[openphone-webhook] Could not find organization for phoneNumberId: ${phoneNumberId}`);
        }
      } else {
        // Message exists, just update delivery status
        const { error: updateError } = await supabase
          .from('sms_messages')
          .update({
            delivery_status: 'delivered',
            delivered_at: new Date().toISOString(),
            status: 'delivered',
          })
          .eq('openphone_message_id', openphoneMessageId);

        if (updateError) {
          console.error('[openphone-webhook] Error updating delivery status:', updateError);
        } else {
          console.log(`[openphone-webhook] Updated delivery status for message: ${openphoneMessageId}`);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Delivery status processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle missed calls - auto-text back
    if (isMissedCall) {
      const callObj = payload.data.object as any;
      const callerPhone = callObj.from;
      const phoneNumberId = callObj.phoneNumberId;

      console.log(`[openphone-webhook] Missed call from ${callerPhone} on ${phoneNumberId}`);

      // Find organization by phone number ID
      const { data: smsSettingsMC } = await supabase
        .from('organization_sms_settings')
        .select('organization_id, openphone_api_key, openphone_phone_number_id, sms_enabled')
        .eq('openphone_phone_number_id', phoneNumberId)
        .maybeSingle();

      let mcOrgId = smsSettingsMC?.organization_id;
      let mcApiKey = smsSettingsMC?.openphone_api_key;
      let mcPhoneId = smsSettingsMC?.openphone_phone_number_id;

      if (!mcOrgId) {
        const { data: allSettings } = await supabase
          .from('organization_sms_settings')
          .select('organization_id, openphone_api_key, openphone_phone_number_id');
        if (allSettings) {
          for (const s of allSettings) {
            if (s.openphone_phone_number_id?.includes(phoneNumberId) || phoneNumberId.includes(s.openphone_phone_number_id || '')) {
              mcOrgId = s.organization_id;
              mcApiKey = s.openphone_api_key;
              mcPhoneId = s.openphone_phone_number_id;
              break;
            }
          }
        }
      }

      if (mcOrgId && mcApiKey && mcPhoneId) {
        // Check if missed_call_textback automation is enabled
        const { data: automationSetting } = await supabase
          .from('organization_automations')
          .select('is_enabled')
          .eq('organization_id', mcOrgId)
          .eq('automation_type', 'missed_call_textback')
          .maybeSingle();

        if (!automationSetting || automationSetting.is_enabled !== false) {
          // Get company name
          const { data: bizSettings } = await supabase
            .from('business_settings')
            .select('company_name')
            .eq('organization_id', mcOrgId)
            .maybeSingle();
          const companyName = bizSettings?.company_name || 'Our team';

          const missedCallMsg = `Hi! You just called ${companyName} and we missed it. We'll get back to you as soon as possible. Feel free to text us here in the meantime!`;

          // Format phone
          let formattedCaller = callerPhone.replace(/\D/g, '');
          if (formattedCaller.length === 10) formattedCaller = `+1${formattedCaller}`;
          else if (!formattedCaller.startsWith('+')) formattedCaller = `+${formattedCaller}`;

          const authHeader = mcApiKey.trim().replace(/^Bearer\s+/i, '');
          let sendPhoneId = mcPhoneId;
          if (sendPhoneId.includes('/')) {
            const m = sendPhoneId.match(/(PN[A-Za-z0-9]+)/);
            if (m) sendPhoneId = m[1];
          }

          const smsResp = await fetch('https://api.openphone.com/v1/messages', {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: sendPhoneId, to: [formattedCaller], content: missedCallMsg }),
          });

          if (smsResp.ok) {
            console.log(`[openphone-webhook] Missed call auto-text sent to ${formattedCaller}`);
            // Log to conversation history
            try {
              let { data: conv } = await supabase
                .from('sms_conversations')
                .select('id')
                .eq('organization_id', mcOrgId)
                .eq('customer_phone', formattedCaller)
                .maybeSingle();

              if (!conv) {
                const { data: newConv } = await supabase
                  .from('sms_conversations')
                  .insert({ organization_id: mcOrgId, customer_phone: formattedCaller, customer_name: null, last_message_at: new Date().toISOString(), conversation_type: 'automated' })
                  .select('id').single();
                conv = newConv;
              } else {
                await supabase.from('sms_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
              }
              if (conv) {
                const smsResult = await smsResp.clone().json().catch(() => ({}));
                await supabase.from('sms_messages').insert({
                  conversation_id: conv.id, organization_id: mcOrgId, direction: 'outgoing',
                  content: missedCallMsg, status: 'sent', openphone_message_id: (smsResult as any).data?.id || null,
                  sent_at: new Date().toISOString(),
                });
              }
            } catch (logErr) {
              console.error('[openphone-webhook] Missed call log error:', logErr);
            }
          } else {
            console.error(`[openphone-webhook] Missed call auto-text failed:`, await smsResp.text());
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Missed call processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isInbound && !isOutbound) {
      console.log('[openphone-webhook] Ignoring event type:', payload.type);
      return new Response(
        JSON.stringify({ success: true, message: 'Event type ignored' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const message = payload.data.object;
    const fromPhone = message.from;
    const toPhone = message.to;
    const phoneNumberId = message.phoneNumberId; // This is always the org's OpenPhone number ID
    const content = message.body;
    const openphoneMessageId = message.id;
    const direction = isInbound ? 'inbound' : 'outbound';
    
    // Handle group chats: OpenPhone may send comma-separated phone numbers
    // For group messages, use the first phone number as the primary identifier
    // to avoid creating duplicate conversations for the same group
    const rawCustomerPhone = isInbound ? fromPhone : toPhone;
    const customerPhone = rawCustomerPhone.includes(',') 
      ? rawCustomerPhone.split(',')[0].trim() 
      : rawCustomerPhone;

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
      // Try to find contact using normalized phone matching across customers, leads, staff
      const localContact = await findLocalContactName(supabase, organizationId, customerPhone);
      let customerName = localContact.name;
      let customerId = localContact.customerId;
      
      // If no local match found, try OpenPhone contacts API
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
          customer_id: customerId,
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
      console.log(`[openphone-webhook] Created new conversation: ${conversationId}, name: ${customerName || 'unknown'}`);
    }

    // If existing conversation has no name, try local DB + OpenPhone
    if (needsContactLookup && existingConversation) {
      // First try normalized local matching
      const localContact = await findLocalContactName(supabase, organizationId, customerPhone);
      let contactName = localContact.name;
      
      // Fallback to OpenPhone API
      if (!contactName && openphoneApiKey) {
        contactName = await fetchOpenPhoneContactName(customerPhone, openphoneApiKey);
      }
      
      if (contactName) {
        await supabase
          .from('sms_conversations')
          .update({ 
            customer_name: contactName,
            ...(localContact.customerId ? { customer_id: localContact.customerId } : {})
          })
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