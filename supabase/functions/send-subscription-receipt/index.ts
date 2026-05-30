import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = Deno.env.get("APP_URL") || "https://jointidywise.com";
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "support@jointidywise.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReceiptReq {
  email: string;
  amount_cents: number;
  currency: string;
  invoice_id: string;
  hosted_invoice_url?: string | null;
  period_end?: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { email, amount_cents, currency, invoice_id, hosted_invoice_url, period_end } =
      (await req.json()) as ReceiptReq;
    if (!email) throw new Error("email required");

    const amount = (amount_cents / 100).toLocaleString("en-US", {
      style: "currency", currency: (currency || "USD").toUpperCase(),
    });
    const nextDate = period_end
      ? new Date(period_end * 1000).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric",
        })
      : null;

    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:22px;margin:0 0 12px">TidyWise receipt</h1>
  <p style="color:#475569;margin:0 0 24px">Thanks — your TidyWise subscription payment was successful.</p>
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Amount paid</span><strong>${amount}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Invoice</span><span>${invoice_id}</span></div>
    ${nextDate ? `<div style="display:flex;justify-content:space-between"><span>Next billing date</span><span>${nextDate}</span></div>` : ""}
  </div>
  ${hosted_invoice_url ? `<p><a href="${hosted_invoice_url}" style="color:#0ea5e9">View full invoice</a></p>` : ""}
  <p style="color:#475569;font-size:13px;margin-top:24px">
    Manage your subscription anytime at
    <a href="${APP_URL}/dashboard/subscription">${APP_URL}/dashboard/subscription</a>.
  </p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px">
    Questions? Reply to this email or write to ${SUPPORT_EMAIL}. Charges appear as "TIDYWISE" on your statement.
  </p>
</div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TidyWise <billing@jointidywise.com>",
        to: [email],
        subject: `TidyWise receipt — ${amount} paid`,
        html,
      }),
    });
    const body = await res.text();
    if (!res.ok) console.error("[send-subscription-receipt] Resend error", res.status, body);

    return new Response(JSON.stringify({ ok: res.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
