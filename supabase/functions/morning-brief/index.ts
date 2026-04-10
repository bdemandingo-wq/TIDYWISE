import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Parse optional org_id from body, default to first org
  let orgId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      orgId = body.org_id || null;
    }
  } catch { /* ignore */ }

  if (!orgId) {
    // Fallback: get the first organization
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .single();
    orgId = orgs?.id || null;
  }

  if (!orgId) {
    return new Response(JSON.stringify({ error: "No organization found" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Calculate today boundaries in America/New_York
  const now = new Date();
  const nyFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = nyFormatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;

  // Build start/end of today in NY timezone as ISO strings
  const todayStartNY = new Date(`${y}-${m}-${d}T00:00:00-04:00`).toISOString();
  const tomorrowStartNY = new Date(
    new Date(`${y}-${m}-${d}T00:00:00-04:00`).getTime() + 86400000
  ).toISOString();

  const errors: string[] = [];

  // 1. Today's bookings
  let todayBookings: any[] = [];
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, scheduled_at, status, payment_status, customers(first_name, last_name, phone)"
      )
      .eq("organization_id", orgId)
      .gte("scheduled_at", todayStartNY)
      .lt("scheduled_at", tomorrowStartNY)
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    todayBookings = data || [];
  } catch (e: any) {
    errors.push(`Bookings query error: ${e.message}`);
  }

  // 2. Open estimates
  let openEstimates: any[] = [];
  try {
    const { data, error } = await supabase
      .from("estimates")
      .select(
        "id, client_name, estimated_total, quote_sent_at, status"
      )
      .eq("organization_id", orgId)
      .not("quote_sent_at", "is", null)
      .is("quote_approved_at", null)
      .is("quote_declined_at", null)
      .is("converted_booking_id", null)
      .order("quote_sent_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    openEstimates = data || [];
  } catch (e: any) {
    errors.push(`Estimates query error: ${e.message}`);
  }

  // 3. New booking requests (last 24h)
  let newRequests: any[] = [];
  try {
    const twentyFourAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
    const { data, error } = await supabase
      .from("client_booking_requests")
      .select("id, created_at, status, notes, customers(first_name, last_name)")
      .eq("organization_id", orgId)
      .gte("created_at", twentyFourAgo)
      .order("created_at", { ascending: false });
    if (error) throw error;
    newRequests = data || [];
  } catch (e: any) {
    errors.push(`Requests query error: ${e.message}`);
  }

  // Format date for subject
  const subjectDate = now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Build HTML
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    });

  const formatShortDate = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  let jobsHtml = "";
  if (todayBookings.length === 0) {
    jobsHtml = `<p style="color:#888;">All clear — nothing here today.</p>`;
  } else {
    jobsHtml = todayBookings
      .map((b) => {
        const c = b.customers;
        const name = c
          ? `${c.first_name || ""} ${c.last_name || ""}`.trim()
          : "Unknown";
        const phone = c?.phone || "";
        return `<div style="padding:6px 0;border-bottom:1px solid #eee;">
          <strong>${name}</strong>${phone ? ` · ${phone}` : ""} — ${formatTime(b.scheduled_at)} · 
          <span style="color:${b.status === "completed" ? "#16a34a" : b.status === "cancelled" ? "#dc2626" : "#2563eb"}">${b.status}</span> · 
          Payment: ${b.payment_status}
        </div>`;
      })
      .join("");
  }

  let estimatesHtml = "";
  if (openEstimates.length === 0) {
    estimatesHtml = `<p style="color:#888;">All clear — nothing here today.</p>`;
  } else {
    estimatesHtml = openEstimates
      .map((e) => {
        const amount = e.estimated_total
          ? `$${Number(e.estimated_total).toFixed(2)}`
          : "N/A";
        return `<div style="padding:6px 0;border-bottom:1px solid #eee;">
          <strong>${e.client_name || "Unknown"}</strong> — ${amount} · Sent ${formatShortDate(e.quote_sent_at)}
        </div>`;
      })
      .join("");
  }

  let requestsHtml = "";
  if (newRequests.length === 0) {
    requestsHtml = `<p style="color:#888;">All clear — nothing here today.</p>`;
  } else {
    requestsHtml = newRequests
      .map((r) => {
        const c = r.customers;
        const name = c
          ? `${c.first_name || ""} ${c.last_name || ""}`.trim()
          : "Unknown";
        return `<div style="padding:6px 0;border-bottom:1px solid #eee;">
          <strong>${name}</strong> — ${formatShortDate(r.created_at)} · Status: ${r.status}
        </div>`;
      })
      .join("");
  }

  let errorsHtml = "";
  if (errors.length > 0) {
    errorsHtml = `<div style="background:#fef2f2;border:1px solid #fca5a5;padding:12px;border-radius:8px;margin-top:20px;">
      <h3 style="color:#dc2626;margin:0 0 8px;">⚠️ Errors</h3>
      ${errors.map((e) => `<p style="margin:4px 0;color:#991b1b;">${e}</p>`).join("")}
    </div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb;">
  <div style="background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
    <h1 style="font-size:22px;margin:0 0 4px;">☀️ Tidywise Morning Brief</h1>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px;">${subjectDate}</p>

    <h2 style="font-size:16px;color:#dc2626;margin:0 0 12px;">🔴 Today's Jobs (${todayBookings.length})</h2>
    ${jobsHtml}

    <h2 style="font-size:16px;color:#ca8a04;margin:24px 0 12px;">🟡 Open Estimates (${openEstimates.length})</h2>
    ${estimatesHtml}

    <h2 style="font-size:16px;color:#16a34a;margin:24px 0 12px;">🟢 New Requests (${newRequests.length})</h2>
    ${requestsHtml}

    ${errorsHtml}

    <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;text-align:center;">
      Sent by Tidywise · <a href="https://jointidywise.lovable.app" style="color:#6b7280;">Dashboard</a>
    </p>
  </div>
</body>
</html>`;

  // Send via Resend
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Tidywise <support@tidywisecleaning.com>",
        to: ["support@tidywisecleaning.com"],
        subject: `Tidywise Morning Brief — ${subjectDate}`,
        html,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("Resend error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: result }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Morning brief sent successfully:", result);
    return new Response(
      JSON.stringify({ success: true, emailId: result.id, sections: {
        jobs: todayBookings.length,
        estimates: openEstimates.length,
        requests: newRequests.length,
      }}),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    console.error("Send error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
