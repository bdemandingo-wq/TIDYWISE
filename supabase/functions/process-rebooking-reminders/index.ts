import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Fetch pending items ready to send (not deferred or deferred_until has passed)
    const { data: pendingItems, error: fetchError } = await supabase
      .from("rebooking_reminder_queue")
      .select("id, booking_id, customer_id, organization_id, defer_count, deferred_until")
      .eq("sent", false)
      .eq("cancelled", false)
      .lte("send_at", now)
      .limit(20);

    if (fetchError) {
      console.error("[process-rebooking-reminders] Fetch error:", fetchError);
      throw fetchError;
    }

    // Filter out deferred items that aren't ready yet
    const readyItems = (pendingItems || []).filter(item => {
      if (item.deferred_until && new Date(item.deferred_until) > new Date()) return false;
      return true;
    });

    if (readyItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0 }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`[process-rebooking-reminders] Processing ${readyItems.length} items`);
    let sentCount = 0;

    for (const item of readyItems) {
      try {
        // 1. Check if customer already has a future booking
        const { data: futureBookings } = await supabase
          .from("bookings")
          .select("id")
          .eq("customer_id", item.customer_id)
          .eq("organization_id", item.organization_id)
          .in("status", ["pending", "confirmed"])
          .gt("scheduled_at", now)
          .limit(1);

        if (futureBookings && futureBookings.length > 0) {
          await supabase.from("rebooking_reminder_queue")
            .update({ cancelled: true, cancelled_reason: "Future booking exists" })
            .eq("id", item.id);
          console.log(`[process-rebooking-reminders] Cancelled for booking ${item.booking_id}: future booking exists`);
          continue;
        }

        // 2. Check review rating from review_requests table
        const { data: review } = await supabase
          .from("review_requests")
          .select("rating")
          .eq("booking_id", item.booking_id)
          .not("rating", "is", null)
          .maybeSingle();

        // Also check client_portal_feedback
        const { data: portalFeedback } = await supabase
          .from("client_portal_feedback")
          .select("rating")
          .eq("booking_id", item.booking_id)
          .maybeSingle();

        const rating = review?.rating || portalFeedback?.rating || null;

        if (rating !== null) {
          // Rating exists - check if 4 or 5 stars
          if (rating <= 3) {
            await supabase.from("rebooking_reminder_queue")
              .update({ cancelled: true, cancelled_reason: `Low rating: ${rating} stars` })
              .eq("id", item.id);
            console.log(`[process-rebooking-reminders] Cancelled for booking ${item.booking_id}: rating ${rating} stars`);
            continue;
          }
          // Rating is 4 or 5 - proceed to send
        } else {
          // No review yet - defer 7 days (only once)
          if (item.defer_count === 0) {
            const deferUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            await supabase.from("rebooking_reminder_queue")
              .update({ deferred_until: deferUntil, defer_count: 1 })
              .eq("id", item.id);
            console.log(`[process-rebooking-reminders] Deferred booking ${item.booking_id} by 7 days (no review yet)`);
            continue;
          }
          // Already deferred once - send anyway (no review after 35 days total)
          // Actually per requirements: "If no review exists yet, wait 7 additional days and check again before sending"
          // After the 7-day deferral, check again. If still no review, skip (don't send).
          // Re-reading: "check again before sending" - if still no review, we should cancel
          await supabase.from("rebooking_reminder_queue")
            .update({ cancelled: true, cancelled_reason: "No review after deferral" })
            .eq("id", item.id);
          console.log(`[process-rebooking-reminders] Cancelled for booking ${item.booking_id}: no review after deferral`);
          continue;
        }

        // 3. Get customer details
        const { data: customer } = await supabase
          .from("customers")
          .select("first_name, last_name, phone")
          .eq("id", item.customer_id)
          .single();

        if (!customer?.phone) {
          await supabase.from("rebooking_reminder_queue")
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
          await supabase.from("rebooking_reminder_queue")
            .update({ sent: true, sent_at: now, error: "SMS not configured" })
            .eq("id", item.id);
          continue;
        }

        // 5. Get business settings for company name and booking link
        const { data: businessSettings } = await supabase
          .from("business_settings")
          .select("company_name, app_url")
          .eq("organization_id", item.organization_id)
          .maybeSingle();

        const { data: org } = await supabase
          .from("organizations")
          .select("slug")
          .eq("id", item.organization_id)
          .single();

        const companyName = businessSettings?.company_name || "Your cleaning service";
        const projectUrl = (businessSettings?.app_url || Deno.env.get("PROJECT_URL") || "https://jointidywise.lovable.app").replace(/\/+$/, '');
        const bookingLink = `${projectUrl}/book/${org?.slug || ""}`.replace(/^https?:\/\//, '');

        const customerName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "there";

        // 6. Build Hormozi-style million dollar offer message
        const message = `Hi ${customerName}! 🏠 ${companyName} here. We loved making your home sparkle! Here's our EXCLUSIVE returning client offer: Book your next cleaning in the next 48 hours and get priority scheduling + our premium deep-clean checklist at NO extra charge. Your home deserves the best — and so do you! Book now: ${bookingLink}`;

        // 7. Send via OpenPhone
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
          console.error(`[process-rebooking-reminders] OpenPhone error for ${item.booking_id}:`, errText);
          await supabase.from("rebooking_reminder_queue")
            .update({ sent: true, sent_at: now, error: `OpenPhone ${openPhoneResponse.status}: ${errText}` })
            .eq("id", item.id);
          continue;
        }

        const sendResult = await openPhoneResponse.json();

        // 8. Log in conversation history
        try {
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
          console.error("[process-rebooking-reminders] Conversation log error:", logError);
        }

        // 9. Mark as sent
        await supabase.from("rebooking_reminder_queue")
          .update({ sent: true, sent_at: now })
          .eq("id", item.id);

        sentCount++;
        console.log(`[process-rebooking-reminders] Sent rebooking reminder for booking ${item.booking_id} to ${formattedPhone}`);
      } catch (itemError: any) {
        console.error(`[process-rebooking-reminders] Error processing item ${item.id}:`, itemError);
        await supabase.from("rebooking_reminder_queue")
          .update({ sent: true, sent_at: now, error: itemError?.message || "Unknown error" })
          .eq("id", item.id);
      }
    }

    return new Response(JSON.stringify({ processed: readyItems.length, sent: sentCount }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[process-rebooking-reminders] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
