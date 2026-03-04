import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }
  return digits;
}

async function findLocalContactName(
  supabase: any,
  organizationId: string,
  phone: string
): Promise<{ name: string | null; customerId: string | null }> {
  const normalizedPhone = normalizePhoneDigits(phone);

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

  const customer = customersRes.data?.find((c: any) =>
    c.phone && normalizePhoneDigits(c.phone) === normalizedPhone
  );
  if (customer) {
    return { name: `${customer.first_name} ${customer.last_name}`.trim(), customerId: customer.id };
  }

  const lead = leadsRes.data?.find((l: any) =>
    l.phone && normalizePhoneDigits(l.phone) === normalizedPhone
  );
  if (lead) {
    return { name: lead.name, customerId: null };
  }

  const staffMember = staffRes.data?.find((s: any) =>
    s.phone && normalizePhoneDigits(s.phone) === normalizedPhone
  );
  if (staffMember) {
    return { name: staffMember.name, customerId: null };
  }

  return { name: null, customerId: null };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { organizationId } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[backfill] Starting backfill for org: ${organizationId}`);

    // Get SMS settings for the organization
    const { data: smsSettings } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      return new Response(
        JSON.stringify({ success: false, error: "OpenPhone not configured for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');
    let phoneNumberId = smsSettings.openphone_phone_number_id;

    // Extract phone number ID if a full URL was provided
    if (phoneNumberId.includes('/') || phoneNumberId.includes('openphone')) {
      const pnMatch = phoneNumberId.match(/(PN[A-Za-z0-9]+)/);
      if (pnMatch) phoneNumberId = pnMatch[1];
    }

    console.log(`[backfill] Using phoneNumberId: ${phoneNumberId}`);

    // Step 1: List all conversations from OpenPhone to get participant phone numbers
    const allConversations: any[] = [];
    let nextPageToken: string | null = null;
    let pageCount = 0;

    do {
      const url = new URL('https://api.openphone.com/v1/conversations');
      url.searchParams.set('phoneNumbers', phoneNumberId);
      url.searchParams.set('maxResults', '100');
      if (nextPageToken) {
        url.searchParams.set('pageToken', nextPageToken);
      }

      console.log(`[backfill] Fetching conversations page ${pageCount + 1}...`);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[backfill] OpenPhone conversations API error: ${response.status} - ${errorText}`);
        return new Response(
          JSON.stringify({ success: false, error: `OpenPhone API error: ${response.status}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const conversations = data.data || [];
      allConversations.push(...conversations);
      nextPageToken = data.nextPageToken || null;
      pageCount++;

      console.log(`[backfill] Conversations page ${pageCount}: got ${conversations.length} (total: ${allConversations.length})`);

      if (pageCount >= 20) break;
    } while (nextPageToken);

    console.log(`[backfill] Total conversations from OpenPhone: ${allConversations.length}`);

    // Get existing openphone_message_ids to avoid duplicates
    const existingIds = new Set<string>();
    const { data: existingMessages } = await supabase
      .from('sms_messages')
      .select('openphone_message_id')
      .eq('organization_id', organizationId)
      .not('openphone_message_id', 'is', null);

    if (existingMessages) {
      for (const msg of existingMessages) {
        if (msg.openphone_message_id) existingIds.add(msg.openphone_message_id);
      }
    }

    console.log(`[backfill] Existing messages in DB: ${existingIds.size}`);

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Step 2: For each conversation, fetch messages using the participants array
    for (const conv of allConversations) {
      const participants: string[] = conv.participants || [];
      if (participants.length === 0) continue;

      // Fetch messages for this conversation's participants
      let msgPageToken: string | null = null;
      let msgPageCount = 0;

      do {
        const msgUrl = new URL('https://api.openphone.com/v1/messages');
        msgUrl.searchParams.set('phoneNumberId', phoneNumberId);
        // Add each participant
        for (const p of participants) {
          msgUrl.searchParams.append('participants', p);
        }
        msgUrl.searchParams.set('maxResults', '50');
        if (msgPageToken) {
          msgUrl.searchParams.set('pageToken', msgPageToken);
        }

        const msgResponse = await fetch(msgUrl.toString(), {
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (!msgResponse.ok) {
          const errText = await msgResponse.text();
          console.error(`[backfill] Messages API error for ${participants.join(',')}: ${msgResponse.status} - ${errText}`);
          totalErrors++;
          break;
        }

        const msgData = await msgResponse.json();
        const messages = msgData.data || [];
        msgPageToken = msgData.nextPageToken || null;
        msgPageCount++;

        // Process messages
        for (const msg of messages) {
          // Skip non-SMS or empty
          if (msg.object !== 'message' || !msg.body) continue;
          if (existingIds.has(msg.id)) {
            totalSkipped++;
            continue;
          }

          const direction = msg.direction === 'incoming' || msg.direction === 'inbound' ? 'inbound' : 'outbound';
          const rawCustomerPhone = direction === 'inbound' ? msg.from : msg.to;
          let customerPhone: string;
          if (Array.isArray(rawCustomerPhone)) {
            customerPhone = rawCustomerPhone[0] || '';
          } else if (typeof rawCustomerPhone === 'string' && rawCustomerPhone.includes(',')) {
            customerPhone = rawCustomerPhone.split(',')[0].trim();
          } else {
            customerPhone = rawCustomerPhone || '';
          }

          if (!customerPhone) {
            totalErrors++;
            continue;
          }

          // Find or create conversation in DB
          let { data: dbConversation } = await supabase
            .from('sms_conversations')
            .select('id, customer_name')
            .eq('organization_id', organizationId)
            .eq('customer_phone', customerPhone)
            .maybeSingle();

          if (!dbConversation) {
            const localContact = await findLocalContactName(supabase, organizationId, customerPhone);

            const { data: newConv, error: convError } = await supabase
              .from('sms_conversations')
              .insert({
                organization_id: organizationId,
                customer_phone: customerPhone,
                customer_name: localContact.name,
                customer_id: localContact.customerId,
                last_message_at: msg.createdAt || new Date().toISOString(),
                conversation_type: 'client',
              })
              .select('id, customer_name')
              .single();

            if (convError) {
              console.error(`[backfill] Error creating conversation for ${customerPhone}:`, convError);
              totalErrors++;
              continue;
            }
            dbConversation = newConv;
          }

          // Insert message
          const { error: insertError } = await supabase
            .from('sms_messages')
            .insert({
              conversation_id: dbConversation!.id,
              organization_id: organizationId,
              direction: direction,
              content: msg.body,
              status: direction === 'inbound' ? 'received' : 'sent',
              openphone_message_id: msg.id,
              sent_at: msg.createdAt || new Date().toISOString(),
            });

          if (insertError) {
            if (insertError.code === '23505') {
              totalSkipped++;
            } else {
              console.error(`[backfill] Error inserting message ${msg.id}:`, insertError);
              totalErrors++;
            }
            continue;
          }

          existingIds.add(msg.id);
          totalInserted++;
        }

        // Limit pages per conversation
        if (msgPageCount >= 10) break;
      } while (msgPageToken);
    }

    // Update conversation timestamps
    const { data: convos } = await supabase
      .from('sms_conversations')
      .select('id')
      .eq('organization_id', organizationId);

    if (convos) {
      for (const conv of convos) {
        const { data: latestMsg } = await supabase
          .from('sms_messages')
          .select('sent_at')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestMsg) {
          await supabase
            .from('sms_conversations')
            .update({ last_message_at: latestMsg.sent_at })
            .eq('id', conv.id);
        }
      }
    }

    const summary = {
      success: true,
      totalConversations: allConversations.length,
      inserted: totalInserted,
      skipped: totalSkipped,
      errors: totalErrors,
    };

    console.log(`[backfill] Complete:`, summary);

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[backfill] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
