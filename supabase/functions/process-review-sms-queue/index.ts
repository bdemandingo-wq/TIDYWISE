import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending items ready to send
    const { data: pendingItems, error: fetchError } = await supabase
      .from("automated_review_sms_queue")
      .select("id, booking_id, organization_id, customer_id")
      .eq("sent", false)
      .lte("send_at", new Date().toISOString())
      .limit(20);

    if (fetchError) {
      console.error("Error fetching queue:", fetchError);
      throw fetchError;
    }

    if (!pendingItems || pendingItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Processing ${pendingItems.length} review SMS requests`);
    let successCount = 0;

    // Pre-fetch automation settings
    const orgIds = [...new Set(pendingItems.map(i => i.organization_id))];
    const { data: automationSettings } = await supabase
      .from("organization_automations")
      .select("organization_id, is_enabled")
      .in("organization_id", orgIds)
      .eq("automation_type", "review_request");
    const automationMap = new Map((automationSettings || []).map(a => [a.organization_id, a.is_enabled]));

    for (const item of pendingItems) {
      try {
        // Check if automation is enabled for this org
        if (automationMap.has(item.organization_id) && !automationMap.get(item.organization_id)) {
          await supabase.from("automated_review_sms_queue")
            .update({ sent: true, sent_at: new Date().toISOString(), error: "Automation disabled" })
            .eq("id", item.id);
          continue;
        }
        // Safety check: verify booking is still completed before sending
        const { data: bookingCheck } = await supabase
          .from("bookings")
          .select("status")
          .eq("id", item.booking_id)
          .single();

        if (!bookingCheck || bookingCheck.status !== 'completed') {
          await supabase.from("automated_review_sms_queue")
            .update({ sent: true, sent_at: new Date().toISOString(), error: "Booking no longer completed" })
            .eq("id", item.id);
          continue;
        }

        // Get customer details
        const { data: customer } = await supabase
          .from("customers")
          .select("first_name, last_name, phone")
          .eq("id", item.customer_id)
          .single();

        if (!customer?.phone) {
          await supabase.from("automated_review_sms_queue")
            .update({ sent: true, sent_at: new Date().toISOString(), error: "No customer phone" })
            .eq("id", item.id);
          continue;
        }

        // Get booking + service info
        const { data: booking } = await supabase
          .from("bookings")
          .select("booking_number, service_id, staff_id, services:service_id(name)")
          .eq("id", item.booking_id)
          .single();

        // Get SMS settings
        const { data: smsSettings } = await supabase
          .from("organization_sms_settings")
          .select("openphone_api_key, openphone_phone_number_id, sms_enabled")
          .eq("organization_id", item.organization_id)
          .maybeSingle();

        if (!smsSettings?.sms_enabled || !smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
          await supabase.from("automated_review_sms_queue")
            .update({ sent: true, sent_at: new Date().toISOString(), error: "SMS not configured" })
            .eq("id", item.id);
          continue;
        }

        // Get business settings for Google review URL and app URL
        const { data: businessSettings } = await supabase
          .from("business_settings")
          .select("company_name, google_review_url, app_url")
          .eq("organization_id", item.organization_id)
          .maybeSingle();

        // Generate review token
        const token = crypto.randomUUID();
        const projectUrl = (businessSettings?.app_url || Deno.env.get("PROJECT_URL") || "https://jointidywise.lovable.app").replace(/\/+$/, '');
        const reviewPageUrl = `${projectUrl}/review/${token}`.replace(/^https?:\/\//, '');

        // Create review request record
        const { error: insertError } = await supabase
          .from("review_requests")
          .insert({
            booking_id: item.booking_id,
            customer_id: item.customer_id,
            staff_id: booking?.staff_id || null,
            status: "sent",
            sent_at: new Date().toISOString(),
            review_link_token: token,
            google_review_url: businessSettings?.google_review_url || "",
          });

        if (insertError) {
          console.error("Failed to create review request:", insertError);
          await supabase.from("automated_review_sms_queue")
            .update({ sent: true, sent_at: new Date().toISOString(), error: insertError.message })
            .eq("id", item.id);
          continue;
        }

        // Build SMS message
        const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "there";
        const message = `Hi ${customerName}! This is ${businessSettings?.company_name || 'Your cleaning service'}. If you enjoyed your cleaning today, we'd really appreciate a quick review here: ${reviewPageUrl}. Thank you for supporting our small business!`;

        // Format phone
        let formattedPhone = customer.phone.replace(/\D/g, "");
        if (formattedPhone.length === 10) formattedPhone = `+1${formattedPhone}`;
        else if (!formattedPhone.startsWith("+")) formattedPhone = `+${formattedPhone}`;

        // Extract phone number ID
        let phoneNumberId = smsSettings.openphone_phone_number_id;
        if (phoneNumberId.includes("/")) {
          const pnMatch = phoneNumberId.match(/(PN[A-Za-z0-9]+)/);
          if (pnMatch) phoneNumberId = pnMatch[1];
        }

        const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, "");

        // Send SMS via OpenPhone
        const openPhoneResponse = await fetch("https://api.openphone.com/v1/messages", {
          method: "POST",
          headers: { "Authorization": authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ content: message, from: phoneNumberId, to: [formattedPhone] }),
        });

        if (!openPhoneResponse.ok) {
          const errText = await openPhoneResponse.text();
          console.error(`OpenPhone error for booking ${item.booking_id}:`, errText);
          await supabase.from("automated_review_sms_queue")
            .update({ sent: true, sent_at: new Date().toISOString(), error: `OpenPhone ${openPhoneResponse.status}: ${errText}` })
            .eq("id", item.id);
          continue;
        }

        // Log in SMS conversation history
        const { data: conversation } = await supabase
          .from("sms_conversations")
          .select("id")
          .eq("organization_id", item.organization_id)
          .eq("phone_number", formattedPhone)
          .maybeSingle();

        const conversationId = conversation?.id;
        if (conversationId) {
          await supabase.from("sms_messages").insert({
            conversation_id: conversationId,
            organization_id: item.organization_id,
            direction: "outgoing",
            content: message,
            phone_number: formattedPhone,
          });
        } else {
          // Create new conversation
          const { data: newConv } = await supabase.from("sms_conversations").insert({
            organization_id: item.organization_id,
            phone_number: formattedPhone,
            contact_name: customerName,
            last_message: message,
            last_message_at: new Date().toISOString(),
          }).select("id").single();

          if (newConv) {
            await supabase.from("sms_messages").insert({
              conversation_id: newConv.id,
              organization_id: item.organization_id,
              direction: "outgoing",
              content: message,
              phone_number: formattedPhone,
            });
          }
        }

        // Mark as sent
        await supabase.from("automated_review_sms_queue")
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq("id", item.id);

        successCount++;
        console.log(`Review SMS sent for booking ${item.booking_id} to ${formattedPhone}`);
      } catch (itemError: any) {
        console.error(`Error processing item ${item.id}:`, itemError);
        await supabase.from("automated_review_sms_queue")
          .update({ sent: true, sent_at: new Date().toISOString(), error: itemError?.message || "Unknown error" })
          .eq("id", item.id);
      }
    }

    return new Response(JSON.stringify({ processed: pendingItems.length, sent: successCount }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in process-review-sms-queue:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
