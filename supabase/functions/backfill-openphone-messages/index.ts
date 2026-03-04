import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdminAuth, createUnauthorizedResponse } from "../_shared/verify-admin-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.substring(1);
  return digits;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await verifyAdminAuth(req.headers.get('Authorization'), { requireAdmin: true });
    if (!authResult.success) {
      return createUnauthorizedResponse(authResult.error || 'Unauthorized', corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { organizationId, pageToken: resumeToken } = await req.json();

    if (!organizationId || organizationId !== authResult.organizationId) {
      return new Response(JSON.stringify({ success: false, error: "Organization mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[backfill] Starting for org: ${organizationId}, resumeToken: ${resumeToken || 'none'}`);

    // Get SMS settings
    const { data: smsSettings } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      return new Response(JSON.stringify({ success: false, error: "OpenPhone not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    const pnMatch = phoneNumberId.match(/(PN[A-Za-z0-9]+)/);
    if (pnMatch) phoneNumberId = pnMatch[1];

    // Load existing openphone_message_ids to skip duplicates
    const existingIds = new Set<string>();
    let offset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from('sms_messages')
        .select('openphone_message_id')
        .eq('organization_id', organizationId)
        .not('openphone_message_id', 'is', null)
        .range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      for (const m of batch) if (m.openphone_message_id) existingIds.add(m.openphone_message_id);
      if (batch.length < 1000) break;
      offset += 1000;
    }
    console.log(`[backfill] ${existingIds.size} existing messages in DB`);

    // Load local contacts for name resolution (one query, cached)
    const [customersRes, leadsRes, staffRes] = await Promise.all([
      supabase.from('customers').select('id, first_name, last_name, phone').eq('organization_id', organizationId).not('phone', 'is', null),
      supabase.from('leads').select('id, name, phone').eq('organization_id', organizationId).not('phone', 'is', null),
      supabase.from('staff').select('id, name, phone').eq('organization_id', organizationId).not('phone', 'is', null),
    ]);

    const contactLookup = new Map<string, { name: string; customerId: string | null }>();
    for (const c of customersRes.data || []) {
      if (c.phone) contactLookup.set(normalizePhoneDigits(c.phone), { name: `${c.first_name} ${c.last_name}`.trim(), customerId: c.id });
    }
    for (const l of leadsRes.data || []) {
      if (l.phone) {
        const key = normalizePhoneDigits(l.phone);
        if (!contactLookup.has(key)) contactLookup.set(key, { name: l.name, customerId: null });
      }
    }
    for (const s of staffRes.data || []) {
      if (s.phone) {
        const key = normalizePhoneDigits(s.phone);
        if (!contactLookup.has(key)) contactLookup.set(key, { name: s.name, customerId: null });
      }
    }

    // Fetch conversations from OpenPhone (limited pages to stay within timeout)
    const MAX_CONV_PAGES = 5; // ~500 conversations max per run
    const allConversations: any[] = [];
    let nextPageToken: string | null = resumeToken || null;
    let pageCount = 0;
    let isFirstPage = !resumeToken;

    do {
      const url = new URL('https://api.openphone.com/v1/conversations');
      url.searchParams.set('phoneNumbers', phoneNumberId);
      url.searchParams.set('maxResults', '100');
      if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);

      const response = await fetch(url.toString(), {
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[backfill] Conversations API error: ${response.status} - ${errorText}`);
        return new Response(JSON.stringify({ success: false, error: `OpenPhone API error: ${response.status}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      allConversations.push(...(data.data || []));
      nextPageToken = data.nextPageToken || null;
      pageCount++;
    } while (nextPageToken && pageCount < MAX_CONV_PAGES);

    console.log(`[backfill] Fetched ${allConversations.length} conversations (${pageCount} pages)`);

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Process each conversation - fetch messages & batch insert
    for (const conv of allConversations) {
      const participants: string[] = conv.participants || [];
      if (participants.length === 0) continue;

      // Fetch up to 2 pages of messages per conversation (100 msgs)
      let msgPageToken: string | null = null;
      let msgPage = 0;
      const convMessages: any[] = [];

      do {
        const msgUrl = new URL('https://api.openphone.com/v1/messages');
        msgUrl.searchParams.set('phoneNumberId', phoneNumberId);
        for (const p of participants) msgUrl.searchParams.append('participants', p);
        msgUrl.searchParams.set('maxResults', '50');
        if (msgPageToken) msgUrl.searchParams.set('pageToken', msgPageToken);

        const msgResponse = await fetch(msgUrl.toString(), {
          headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        });

        if (!msgResponse.ok) {
          console.error(`[backfill] Messages API error for ${participants.join(',')}: ${msgResponse.status}`);
          await msgResponse.text(); // consume body
          totalErrors++;
          break;
        }

        const msgData = await msgResponse.json();
        convMessages.push(...(msgData.data || []));
        msgPageToken = msgData.nextPageToken || null;
        msgPage++;
      } while (msgPageToken && msgPage < 2);

      // Filter to new SMS messages only
      const newMessages = convMessages.filter(msg =>
        msg.object === 'message' && msg.body && !existingIds.has(msg.id)
      );

      if (newMessages.length === 0) {
        totalSkipped += convMessages.length;
        continue;
      }

      // Determine the customer phone for this conversation
      // Use first participant that isn't our phone number
      const firstMsg = newMessages[0];
      const direction0 = firstMsg.direction === 'incoming' || firstMsg.direction === 'inbound' ? 'inbound' : 'outbound';
      const rawPhone = direction0 === 'inbound' ? firstMsg.from : firstMsg.to;
      let customerPhone: string;
      if (Array.isArray(rawPhone)) customerPhone = rawPhone[0] || '';
      else if (typeof rawPhone === 'string' && rawPhone.includes(',')) customerPhone = rawPhone.split(',')[0].trim();
      else customerPhone = rawPhone || '';

      if (!customerPhone) { totalErrors++; continue; }

      // Find or create DB conversation
      let { data: dbConv } = await supabase
        .from('sms_conversations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('customer_phone', customerPhone)
        .maybeSingle();

      if (!dbConv) {
        const contact = contactLookup.get(normalizePhoneDigits(customerPhone));
        const { data: newConv, error: convErr } = await supabase
          .from('sms_conversations')
          .insert({
            organization_id: organizationId,
            customer_phone: customerPhone,
            customer_name: contact?.name || null,
            customer_id: contact?.customerId || null,
            last_message_at: newMessages[0].createdAt || new Date().toISOString(),
            conversation_type: 'client',
          })
          .select('id')
          .single();

        if (convErr) { console.error(`[backfill] Conv create error:`, convErr); totalErrors++; continue; }
        dbConv = newConv;
      }

      // Batch insert messages
      const rows = newMessages.map(msg => {
        const dir = msg.direction === 'incoming' || msg.direction === 'inbound' ? 'inbound' : 'outbound';
        return {
          conversation_id: dbConv!.id,
          organization_id: organizationId,
          direction: dir,
          content: msg.body,
          status: dir === 'inbound' ? 'received' : 'sent',
          openphone_message_id: msg.id,
          sent_at: msg.createdAt || new Date().toISOString(),
        };
      });

      // Insert in batches of 50
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error: insertErr, data: inserted } = await supabase
          .from('sms_messages')
          .upsert(batch, { onConflict: 'openphone_message_id', ignoreDuplicates: true })
          .select('id');

        if (insertErr) {
          console.error(`[backfill] Batch insert error:`, insertErr);
          totalErrors += batch.length;
        } else {
          const count = inserted?.length || batch.length;
          totalInserted += count;
          for (const msg of batch) existingIds.add(msg.openphone_message_id);
        }
      }

      // Update conversation timestamp to latest message
      const latestTime = newMessages.reduce((max, m) => {
        const t = m.createdAt || '';
        return t > max ? t : max;
      }, '');
      if (latestTime) {
        await supabase.from('sms_conversations').update({ last_message_at: latestTime }).eq('id', dbConv!.id);
      }
    }

    const summary = {
      success: true,
      totalConversations: allConversations.length,
      inserted: totalInserted,
      skipped: totalSkipped,
      errors: totalErrors,
      nextPageToken: nextPageToken || null, // null means complete
      hasMore: !!nextPageToken,
    };

    console.log(`[backfill] Complete:`, summary);

    return new Response(JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[backfill] Error:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
};

serve(handler);
