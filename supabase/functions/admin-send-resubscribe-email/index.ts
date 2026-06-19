// Platform-admin-only: generates a Stripe payment link for the TidyWise Pro
// $50/mo plan and emails it to the given customer so they can re-subscribe
// themselves (preserves consent / avoids chargebacks vs. force-charging a
// stored card).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRO_MONTHLY_PRICE_ID = "price_1SihrVJv857o86noT8NIIfrq";

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ADMIN-SEND-RESUB] ${step}${d}`);
};

function buildEmailHtml(checkoutUrl: string) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;border-radius:12px;margin-top:32px;">
    <h1 style="font-size:22px;margin:0 0 16px;">Reactivate your TidyWise subscription</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 14px;">Hi there,</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 14px;">
      Your TidyWise Pro subscription was canceled, so your account access has ended.
      Whenever you're ready to come back, you can restart your <strong>$50/month Pro plan</strong> in one click:
    </p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${checkoutUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
        Resubscribe to TidyWise Pro
      </a>
    </p>
    <p style="font-size:14px;line-height:1.55;color:#475569;margin:0 0 12px;">
      Once payment goes through, your account will reactivate automatically the next time you log in &mdash; all your data is still there.
    </p>
    <p style="font-size:13px;line-height:1.5;color:#64748b;margin:24px 0 0;word-break:break-all;">
      If the button doesn't work, copy and paste this link into your browser:<br/>
      <a href="${checkoutUrl}" style="color:#0f172a;">${checkoutUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;"/>
    <p style="font-size:12px;color:#94a3b8;margin:0;">Sent by the TidyWise team. Reply to this email if you have any questions.</p>
  </div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!resendKey) throw new Error("RESEND_API_KEY is not set");

    // --- Auth: platform admin only ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: udata } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!udata?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_platform_admin");
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Platform admin access only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const customerEmail = (body?.customerEmail ?? "").toString().trim().toLowerCase();
    if (!customerEmail || !customerEmail.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid customerEmail required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Request", { by: udata.user.email, customerEmail });

    // --- Create Stripe payment link ---
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: PRO_MONTHLY_PRICE_ID, quantity: 1 }],
      metadata: {
        purpose: "admin_resubscribe",
        target_email: customerEmail,
        sent_by_admin: udata.user.email ?? "",
      },
    });
    const url = paymentLink.url;
    log("Payment link created", { id: paymentLink.id, url });

    // --- Send email via Resend (platform-level, not org-scoped) ---
    const html = buildEmailHtml(url);
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TidyWise <support@tidywisecleaning.com>",
        to: [customerEmail],
        reply_to: "support@tidywisecleaning.com",
        subject: "Reactivate your TidyWise subscription",
        html,
      }),
    });
    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      log("Resend error", resendData);
      return new Response(
        JSON.stringify({
          error: resendData?.message || "Failed to send email",
          paymentLinkUrl: url,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log("Email sent", { to: customerEmail, resendId: resendData?.id });

    return new Response(
      JSON.stringify({
        success: true,
        url,
        emailId: resendData?.id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
