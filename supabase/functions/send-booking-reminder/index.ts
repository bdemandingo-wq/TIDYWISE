import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let payload: any = null;
    try {
      const text = await req.text();
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    const isManualSend = !!payload?.customerPhone;
    const organizationId = payload?.organizationId;

    // If no organizationId and not manual, iterate all orgs (cron mode)
    if (!organizationId && !isManualSend) {
      console.log("[send-booking-reminder] Cron mode: fetching all organizations");
      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("id");

      if (orgsError || !orgs?.length) {
        console.error("[send-booking-reminder] Failed to fetch orgs:", orgsError);
        return new Response(JSON.stringify({ success: false, error: "No organizations found" }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const allResults: string[] = [];
      for (const org of orgs) {
        try {
          const orgUrl = `${supabaseUrl}/functions/v1/send-booking-reminder`;
          const resp = await fetch(orgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
            body: JSON.stringify({ organizationId: org.id }),
          });
          const result = await resp.json();
          if (result.reminders?.length) {
            allResults.push(...result.reminders);
          }
        } catch (e) {
          console.error(`[send-booking-reminder] Error for org ${org.id}:`, e);
        }
      }

      return new Response(JSON.stringify({ success: true, message: `Cron complete: ${allResults.length} reminders`, reminders: allResults }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Missing organizationId" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch SMS settings
    const { data: smsSettings, error: settingsError } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id, sms_enabled, sms_appointment_reminder")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (settingsError) {
      console.error("[send-booking-reminder] SMS settings error:", settingsError);
      return new Response(JSON.stringify({ error: "Failed to fetch SMS settings" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!smsSettings?.sms_enabled || !smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      console.log("[send-booking-reminder] SMS disabled or not configured for org:", organizationId);
      return new Response(JSON.stringify({ success: false, error: "SMS not configured or disabled" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check if appointment_reminder automation is enabled for this org
    const { data: automationSetting } = await supabase
      .from("organization_automations")
      .select("is_enabled")
      .eq("organization_id", organizationId)
      .eq("automation_type", "appointment_reminder")
      .maybeSingle();

    if (automationSetting && !automationSetting.is_enabled) {
      console.log("[send-booking-reminder] Automation disabled for org:", organizationId);
      return new Response(JSON.stringify({ success: false, error: "Appointment reminder automation disabled" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get business settings
    const { data: businessSettings } = await supabase
      .from("business_settings")
      .select("company_name, notify_reminders")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (businessSettings?.notify_reminders === false) {
      return new Response(JSON.stringify({ success: false, error: "Reminders disabled" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const companyName = businessSettings?.company_name || "Your cleaning service";

    // Fetch timezone for this org (stored in business_settings)
    const { data: tzSettings } = await supabase
      .from("business_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const orgTimezone = tzSettings?.timezone || "America/New_York";

    // Helper: format a UTC date string in the org's local timezone
    const formatLocalDate = (utcDate: Date): string => {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: orgTimezone,
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(utcDate);
    };

    const formatLocalTime = (utcDate: Date): string => {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: orgTimezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(utcDate);
    };

    // Extract phone number ID
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    if (phoneNumberId.includes("openphone.com")) {
      const match = phoneNumberId.match(/phone-numbers\/([A-Za-z0-9]+)/);
      if (match) phoneNumberId = match[1];
    }

    const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, "");

    // --- Helper: format phone ---
    const formatPhone = (phone: string): string => {
      let p = phone.replace(/\D/g, "");
      if (p.length === 10) return `+1${p}`;
      if (!p.startsWith("+")) return `+${p}`;
      return p;
    };

    // --- Helper: send SMS and log to conversation history ---
    const sendAndLog = async (
      to: string,
      message: string,
      recipientName: string,
      bookingId: string,
      reminderType: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const formattedPhone = formatPhone(to);

      // Check if already sent (dedup)
      const { data: existing } = await supabase
        .from("booking_reminder_log")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("reminder_type", reminderType)
        .maybeSingle();

      if (existing) {
        console.log(`[send-booking-reminder] Already sent ${reminderType} for booking ${bookingId}`);
        return { success: true }; // Already sent, skip
      }

      // Send via OpenPhone
      const response = await fetch("https://api.openphone.com/v1/messages", {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ from: phoneNumberId, to: [formattedPhone], content: message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[send-booking-reminder] OpenPhone error ${response.status}: ${errorText}`);
        if (response.status === 402) return { success: false, error: "SMS billing issue" };
        if (response.status === 401) return { success: false, error: "Invalid API key" };
        return { success: false, error: "SMS delivery failed" };
      }

      const result = await response.json();

      // Log to booking_reminder_log (dedup)
      await supabase.from("booking_reminder_log").insert({
        booking_id: bookingId,
        organization_id: organizationId,
        reminder_type: reminderType,
        recipient_phone: formattedPhone,
      });

      // Log to conversation history
      try {
        // Find or create conversation
        let { data: conversation } = await supabase
          .from("sms_conversations")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("customer_phone", formattedPhone)
          .maybeSingle();

        if (!conversation) {
          const { data: newConv } = await supabase
            .from("sms_conversations")
            .insert({
              organization_id: organizationId,
              customer_phone: formattedPhone,
              customer_name: recipientName,
              last_message_at: new Date().toISOString(),
              conversation_type: "automated",
            })
            .select("id")
            .single();
          conversation = newConv;
        } else {
          await supabase
            .from("sms_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversation.id);
        }

        if (conversation) {
          await supabase.from("sms_messages").insert({
            conversation_id: conversation.id,
            organization_id: organizationId,
            direction: "outgoing",
            content: message,
            status: "sent",
            openphone_message_id: result.data?.id || null,
            sent_at: new Date().toISOString(),
          });
        }
      } catch (logError) {
        console.error("[send-booking-reminder] Conversation log error:", logError);
      }

      return { success: true };
    };

    // ============ MANUAL SEND ============
    if (isManualSend) {
      // Prefer pre-formatted values from the caller (already in local time)
      // Fall back to formatting using the org timezone
      const formattedDate = payload?.formattedDate || (payload?.scheduledAt
        ? formatLocalDate(new Date(payload.scheduledAt))
        : "your scheduled date");
      const formattedTime = payload?.formattedTime || (payload?.scheduledAt
        ? formatLocalTime(new Date(payload.scheduledAt))
        : "your scheduled time");

      const customerName = payload?.customerName || "there";
      const serviceName = payload?.serviceName || "cleaning";
      const address = payload?.address || "";

      const message = `Hi ${customerName}! This is a reminder about your ${serviceName} appointment with ${companyName} on ${formattedDate} at ${formattedTime}.${address ? ` Address: ${address}` : ""} Reply with any questions!`;

      const result = await sendAndLog(
        payload.customerPhone,
        message,
        customerName,
        payload.bookingId || "manual",
        "client_manual",
      );

      return new Response(JSON.stringify(result), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ============ AUTOMATED MULTI-INTERVAL REMINDERS ============
    if (!smsSettings.sms_appointment_reminder) {
      return new Response(JSON.stringify({ success: true, message: "Reminders disabled", reminders: [] }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch active reminder intervals for this org
    const { data: intervals, error: intervalsError } = await supabase
      .from("appointment_reminder_intervals")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("hours_before", { ascending: false });

    if (intervalsError) {
      console.error("[send-booking-reminder] Intervals error:", intervalsError);
      return new Response(JSON.stringify({ error: "Failed to fetch reminder intervals" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fall back to legacy 24h if no intervals configured
    const activeIntervals = intervals?.length
      ? intervals.map((i: any) => ({
          hours_before: Number(i.hours_before),
          label: i.label,
          send_to_client: i.send_to_client,
          send_to_cleaner: i.send_to_cleaner,
        }))
      : [{ hours_before: 24, label: "24 Hours Before", send_to_client: true, send_to_cleaner: true }];

    const now = new Date();
    const sentReminders: string[] = [];

    for (const interval of activeIntervals) {
      const hoursMs = interval.hours_before * 60 * 60 * 1000;
      // Window: 15 minutes around the target time
      const windowStart = new Date(now.getTime() + hoursMs - 15 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + hoursMs + 15 * 60 * 1000);

      const reminderTypeClient = `client_${interval.hours_before}h`;
      const reminderTypeCleaner = `cleaner_${interval.hours_before}h`;

      const { data: bookings, error } = await supabase
        .from("bookings")
        .select(`
          *,
          customer:customers(*),
          service:services(*),
          staff:staff(*)
        `)
        .eq("organization_id", organizationId)
        .gte("scheduled_at", windowStart.toISOString())
        .lte("scheduled_at", windowEnd.toISOString())
        .in("status", ["pending", "confirmed"])
        .not("customer_id", "is", null);

      if (error) {
        console.error(`[send-booking-reminder] Fetch bookings error for ${interval.label}:`, error);
        continue;
      }

      console.log(`[send-booking-reminder] Found ${bookings?.length || 0} bookings for ${interval.label} window`);

      for (const booking of bookings || []) {
        const scheduledDate = new Date(booking.scheduled_at);
        const formattedDate = formatLocalDate(scheduledDate);
        const formattedTime = formatLocalTime(scheduledDate);
        const address = [booking.address, booking.city].filter(Boolean).join(", ");
        const serviceName = booking.service?.name || "cleaning";

        // --- CLIENT REMINDER ---
        if (interval.send_to_client && booking.customer?.phone) {
          const customerName = `${booking.customer.first_name || ""} ${booking.customer.last_name || ""}`.trim() || "there";

          let clientMsg: string;
          if (interval.hours_before >= 48) {
            clientMsg =
              `Hi ${customerName}! Friendly reminder — your ${serviceName} appointment with ${companyName} is coming up on ${formattedDate} at ${formattedTime}.` +
              `${address ? ` Address: ${address}.` : ""}` +
              ` Reply with any questions!`;
          } else if (interval.hours_before <= 2) {
            clientMsg =
              `Hi ${customerName}! Your ${serviceName} with ${companyName} is starting soon — today at ${formattedTime}.` +
              `${address ? ` Address: ${address}.` : ""}` +
              ` See you shortly!`;
          } else {
            clientMsg =
              `Hi ${customerName}! Your ${serviceName} appointment is confirmed for ${formattedDate} at ${formattedTime}.` +
              `${address ? ` Address: ${address}.` : ""}` +
              ` Reply to this message with any questions!`;
          }

          const clientResult = await sendAndLog(
            booking.customer.phone,
            clientMsg,
            `${booking.customer.first_name || ""} ${booking.customer.last_name || ""}`.trim(),
            booking.id,
            reminderTypeClient,
          );

          if (clientResult.success) {
            sentReminders.push(`#${booking.booking_number} client ${interval.label}`);
          } else {
            console.error(`[send-booking-reminder] Client SMS failed for #${booking.booking_number} (${interval.label}): ${clientResult.error}`);
          }
        }

        // --- CLEANER REMINDER ---
        if (interval.send_to_cleaner && booking.staff?.phone) {
          const cleanerName = booking.staff.name || "there";
          const customerName = `${booking.customer?.first_name || ""} ${booking.customer?.last_name || ""}`.trim() || "Customer";

          const timeLabel = interval.hours_before >= 24 ? "upcoming" : "today";
          const cleanerMsg =
            `📋 REMINDER: You have a${interval.hours_before <= 2 ? " job starting soon" : ` ${timeLabel} job`}!\n\n` +
            `Hi ${cleanerName},\n\n` +
            `Booking #${booking.booking_number}\n` +
            `Service: ${serviceName}\n` +
            `📅 ${formattedDate} at ${formattedTime}\n` +
            `${address ? `📍 ${address}\n` : ""}` +
            `Customer: ${customerName}\n` +
            `\n- ${companyName}`;

          const cleanerResult = await sendAndLog(
            booking.staff.phone,
            cleanerMsg,
            cleanerName,
            booking.id,
            reminderTypeCleaner,
          );

          if (cleanerResult.success) {
            sentReminders.push(`#${booking.booking_number} cleaner ${interval.label}`);
          } else {
            console.error(`[send-booking-reminder] Cleaner SMS failed for #${booking.booking_number} (${interval.label}): ${cleanerResult.error}`);
          }
        }

        // Also check team assignments for additional cleaners
        if (interval.send_to_cleaner) {
          try {
            const { data: teamAssignments } = await supabase
              .from("booking_team_assignments")
              .select("staff_id, staff:staff(*)")
              .eq("booking_id", booking.id)
              .neq("staff_id", booking.staff_id || "");

            for (const assignment of teamAssignments || []) {
              const teamStaff = (assignment as any).staff;
              if (!teamStaff?.phone) continue;

              const teamCleanerMsg =
                `📋 REMINDER: You have a job ${interval.hours_before <= 2 ? "starting soon" : interval.hours_before >= 24 ? "tomorrow" : "today"}!\n\n` +
                `Hi ${teamStaff.name || "there"},\n\n` +
                `Booking #${booking.booking_number}\n` +
                `Service: ${serviceName}\n` +
                `📅 ${formattedDate} at ${formattedTime}\n` +
                `${address ? `📍 ${address}\n` : ""}` +
                `Customer: ${booking.customer?.first_name || "Customer"}\n` +
                `\n- ${companyName}`;

              const teamResult = await sendAndLog(
                teamStaff.phone,
                teamCleanerMsg,
                teamStaff.name || "Team member",
                booking.id,
                `${reminderTypeCleaner}_${teamStaff.id}`,
              );

              if (teamResult.success) {
                sentReminders.push(`#${booking.booking_number} team:${teamStaff.name} ${interval.label}`);
              }
            }
          } catch (teamError) {
            console.error(`[send-booking-reminder] Team assignment error for #${booking.booking_number}:`, teamError);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Sent ${sentReminders.length} reminders`, reminders: sentReminders }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("[send-booking-reminder] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
