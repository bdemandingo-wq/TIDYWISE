import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date().toISOString();

    // Fetch pending items ready to send
    const { data: pendingItems, error: fetchError } = await supabase
      .from("recurring_offer_queue")
      .select("id, booking_id, customer_id, organization_id, defer_count, deferred_until")
      .eq("sent", false)
      .eq("cancelled", false)
      .lte("send_at", now)
      .limit(20);

    if (fetchError) {
      console.error("[process-recurring-offers] Fetch error:", fetchError);
      throw fetchError;
    }

    // Filter out deferred items not yet ready
    const readyItems = (pendingItems || []).filter(item => {
      if (item.deferred_until && new Date(item.deferred_until) > new Date()) return false;
      return true;
    });

    if (readyItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0 }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`[process-recurring-offers] Processing ${readyItems.length} items`);
    let sentCount = 0;

    for (const item of readyItems) {
      try {
        // 1. Re-check if customer now has active recurring service
        const { data: activeRecurring } = await supabase
          .from("recurring_bookings")
          .select("id")
          .eq("customer_id", item.customer_id)
          .eq("is_active", true)
          .limit(1);

        if (activeRecurring && activeRecurring.length > 0) {
          await supabase.from("recurring_offer_queue")
            .update({ cancelled: true, cancelled_reason: "Recurring service already active" })
            .eq("id", item.id);
          console.log(`[process-recurring-offers] Cancelled for customer ${item.customer_id}: recurring already active`);
          continue;
        }

        // 2. Check review rating
        const { data: review } = await supabase
          .from("review_requests")
          .select("rating")
          .eq("booking_id", item.booking_id)
          .not("rating", "is", null)
          .maybeSingle();

        const { data: portalFeedback } = await supabase
          .from("client_portal_feedback")
          .select("rating")
          .eq("booking_id", item.booking_id)
          .maybeSingle();

        const rating = review?.rating || portalFeedback?.rating || null;

        if (rating !== null) {
          if (rating <= 3) {
            await supabase.from("recurring_offer_queue")
              .update({ cancelled: true, cancelled_reason: `Low rating: ${rating} stars` })
              .eq("id", item.id);
            console.log(`[process-recurring-offers] Cancelled for customer ${item.customer_id}: rating ${rating} stars`);
            continue;
          }
          // 4-5 stars → proceed to send
        } else {
          // No review yet — defer up to 7 days
          if (item.defer_count === 0) {
            const deferUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            await supabase.from("recurring_offer_queue")
              .update({ deferred_until: deferUntil, defer_count: 1 })
              .eq("id", item.id);
            console.log(`[process-recurring-offers] Deferred customer ${item.customer_id} by 7 days (no review yet)`);
            continue;
          }
          // After 7-day deferral with no review → send anyway per requirements
        }

        // 3. Get customer details
        const { data: customer } = await supabase
          .from("customers")
          .select("first_name, last_name, phone")
          .eq("id", item.customer_id)
          .single();

        if (!customer?.phone) {
          await supabase.from("recurring_offer_queue")
            .update({ sent: true, sent_at: now, error: "No customer phone" })
            .eq("id", item.id);
          continue;
        }

        // 4. Get SMS settings
        const { data: smsSettings } = await supabase
          .from("organization_sms_settings")
          .select("openphone_api_key, openphone_phone_number_id, sms_enabled")
          .eq("organization_id", item.organization_id)
          .maybeSingle();

        if (!smsSettings?.sms_enabled || !smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
          await supabase.from("recurring_offer_queue")
            .update({ sent: true, sent_at: now, error: "SMS not configured" })
            .eq("id", item.id);
          continue;
        }

        // 5. Build message
        const message = `Hi! This is Tidywise Cleaning. Most of our recurring clients never have to worry about cleaning again and also get priority scheduling and lower pricing than one-time bookings.\n\nWant us to lock in a regular cleaning every 2 or 4 weeks so your home stays taken care of automatically?`;

        // 6. Send via OpenPhone
        let phoneNumberId = smsSettings.openphone_phone_number_id;
        if (phoneNumberId.includes("/")) {
          const match = phoneNumberId.match(/(PN[A-Za-z0-9]+)/);
          if (match) phoneNumberId = match[1];
        }
        if (phoneNumberId.includes("openphone.com")) {
          const match = phoneNumberId.match(/phone-numbers\/([A-Za-z0-9]+)/);
          if (match) phoneNumberId = match[1];
        }

        const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, "");

        let formattedPhone = customer.phone.replace(/\D/g, "");
        if (formattedPhone.length === 10) formattedPhone = `+1${formattedPhone}`;
        else if (!formattedPhone.startsWith("+")) formattedPhone = `+${formattedPhone}`;

        const openPhoneResponse = await fetch("https://api.openphone.com/v1/messages", {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ content: message, from: phoneNumberId, to: [formattedPhone] }),
        });

        if (!openPhoneResponse.ok) {
          const errText = await openPhoneResponse.text();
          console.error(`[process-recurring-offers] OpenPhone error for customer ${item.customer_id}:`, errText);
          await supabase.from("recurring_offer_queue")
            .update({ sent: true, sent_at: now, error: `OpenPhone ${openPhoneResponse.status}: ${errText}` })
            .eq("id", item.id);
          continue;
        }

        const sendResult = await openPhoneResponse.json();

        // 7. Log in conversation history
        try {
          const customerName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Customer";

          let { data: conversation } = await supabase
            .from("sms_conversations")
            .select("id")
            .eq("organization_id", item.organization_id)
            .eq("customer_phone", formattedPhone)
            .maybeSingle();

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("sms_conversations")
              .insert({
                organization_id: item.organization_id,
                customer_phone: formattedPhone,
                customer_name: customerName,
                last_message_at: now,
                conversation_type: "automated",
              })
              .select("id")
              .single();
            conversation = newConv;
          } else {
            await supabase.from("sms_conversations")
              .update({ last_message_at: now })
              .eq("id", conversation.id);
          }

          if (conversation) {
            await supabase.from("sms_messages").insert({
              conversation_id: conversation.id,
              organization_id: item.organization_id,
              direction: "outgoing",
              content: message,
              status: "sent",
              openphone_message_id: sendResult.data?.id || null,
              sent_at: now,
            });
          }
        } catch (logError) {
          console.error("[process-recurring-offers] Conversation log error:", logError);
        }

        // 8. Mark as sent
        await supabase.from("recurring_offer_queue")
          .update({ sent: true, sent_at: now })
          .eq("id", item.id);

        sentCount++;
        console.log(`[process-recurring-offers] Sent recurring offer to customer ${item.customer_id} at ${formattedPhone}`);
      } catch (itemError: any) {
        console.error(`[process-recurring-offers] Error processing item ${item.id}:`, itemError);
        await supabase.from("recurring_offer_queue")
          .update({ sent: true, sent_at: now, error: itemError?.message || "Unknown error" })
          .eq("id", item.id);
      }
    }

    return new Response(JSON.stringify({ processed: readyItems.length, sent: sentCount }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[process-recurring-offers] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
