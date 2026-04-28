import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STEPS = [
  { step: 1, daysInactive: 30, offerPercent: 10, subject: "We miss you — here's 10% off your next clean" },
  { step: 2, daysInactive: 60, offerPercent: 15, subject: "Still thinking of you — 15% off inside" },
  { step: 3, daysInactive: 90, offerPercent: 20, subject: "Last chance — 20% off before we stop reaching out" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Cron auth gate
  const cronGate = requireCronSecret(req);
  if (cronGate) return cronGate;


  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const results: Record<string, number> = { step1: 0, step2: 0, step3: 0, skipped: 0 };

  try {
    // Get all organizations
    const { data: orgs } = await supabase.from("organizations").select("id").eq("is_active", true);
    if (!orgs?.length) return jsonOk({ results });

    for (const org of orgs) {
      // Get email settings for org
      const { data: emailSettings } = await supabase
        .from("organization_email_settings")
        .select("from_email, from_name, resend_api_key")
        .eq("organization_id", org.id)
        .maybeSingle();

      const { data: bizSettings } = await supabase
        .from("business_settings")
        .select("app_url")
        .eq("organization_id", org.id)
        .maybeSingle();

      const baseUrl = (bizSettings?.app_url || Deno.env.get("APP_URL") || "https://jointidywise.com").replace(/\/+$/, "");
      const companyName = emailSettings?.from_name || "Your Cleaning Company";
      const fromEmail = emailSettings?.from_email || "noreply@jointidywise.com";
      const apiKey = emailSettings?.resend_api_key || RESEND_API_KEY;
      if (!apiKey) continue;

      for (const { step, daysInactive, offerPercent, subject } of STEPS) {
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

        const nextCutoff = new Date(now);
        nextCutoff.setDate(nextCutoff.getDate() - (daysInactive - 1));

        // Find customers whose last booking was exactly in the daysInactive window
        // and haven't already received this step
        const { data: customers } = await supabase.rpc("get_winback_candidates" as any, {
          p_organization_id: org.id,
          p_days_inactive: daysInactive,
          p_window_days: 1,
        }).catch(() => ({ data: null }));

        // Fallback: direct query if RPC doesn't exist
        const candidateList = customers || await getWinbackCandidatesDirect(supabase, org.id, cutoffDate, nextCutoff);

        for (const customer of (candidateList || [])) {
          if (!customer.email) { results.skipped++; continue; }

          // Check if this step was already sent
          const { data: existing } = await supabase
            .from("winback_drip_log")
            .select("id")
            .eq("organization_id", org.id)
            .eq("customer_id", customer.id)
            .eq("step", step)
            .maybeSingle();

          if (existing) { results.skipped++; continue; }

          // Send the email
          const html = buildWinbackEmail({
            customerName: `${customer.first_name} ${customer.last_name}`,
            companyName,
            offerPercent,
            bookingUrl: `${baseUrl}/book`,
            step,
          });

          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ from: `${companyName} <${fromEmail}>`, to: [customer.email], subject, html }),
          });

          if (res.ok) {
            // Log so we don't resend
            await supabase.from("winback_drip_log").insert({
              organization_id: org.id,
              customer_id: customer.id,
              step,
            });
            results[`step${step}`]++;
          }
        }
      }
    }

    return jsonOk({ results });
  } catch (err: any) {
    console.error("[run-winback-drip] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getWinbackCandidatesDirect(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  cutoffFrom: Date,
  cutoffTo: Date,
) {
  const { data } = await supabase
    .from("customers")
    .select("id, first_name, last_name, email")
    .eq("organization_id", orgId)
    .not("email", "is", null);

  if (!data?.length) return [];

  const results = [];
  for (const customer of data) {
    const { data: lastBooking } = await supabase
      .from("bookings")
      .select("completed_at, scheduled_at")
      .eq("customer_id", customer.id)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastBooking) continue;
    const lastDate = new Date(lastBooking.completed_at || lastBooking.scheduled_at);
    if (lastDate >= cutoffFrom && lastDate < cutoffTo) {
      results.push(customer);
    }
  }
  return results;
}

function buildWinbackEmail({ customerName, companyName, offerPercent, bookingUrl, step }: {
  customerName: string; companyName: string; offerPercent: number; bookingUrl: string; step: number;
}) {
  const messages: Record<number, string> = {
    1: `It's been a month since we last cleaned your home, and we've been thinking about you! We'd love to welcome you back.`,
    2: `It's been two months and your home deserves the care it got before. We're still here and ready to help!`,
    3: `It's been three months since your last clean. This is our final check-in — we'd love one more chance to earn your business.`,
  };

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="padding:20px;">
<table cellpadding="0" cellspacing="0" width="600" style="margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1e5bb0;padding:30px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">${companyName}</h1>
  </td></tr>
  <tr><td style="padding:40px 30px;text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">🏠</div>
    <h2 style="color:#1e5bb0;margin:0 0 16px;">Hi ${customerName}!</h2>
    <p style="font-size:16px;color:#555;margin:0 0 24px;">${messages[step]}</p>
    <div style="background:#f0f7ff;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="font-size:14px;color:#777;margin:0 0 8px;">Special offer just for you</p>
      <p style="font-size:36px;font-weight:bold;color:#1e5bb0;margin:0;">${offerPercent}% OFF</p>
      <p style="font-size:13px;color:#999;margin:8px 0 0;">Your next cleaning service</p>
    </div>
    <a href="${bookingUrl}" style="display:inline-block;background:#1e5bb0;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;">Book Now — ${offerPercent}% Off</a>
    <p style="font-size:12px;color:#aaa;margin-top:20px;">Just reply to this email and mention this offer when booking.</p>
  </td></tr>
  <tr><td style="background:#333;padding:20px;text-align:center;">
    <p style="color:#fff;font-size:13px;margin:0;">${companyName} &copy; ${new Date().getFullYear()}</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
