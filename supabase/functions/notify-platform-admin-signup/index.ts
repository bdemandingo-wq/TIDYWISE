// Platform admin notification on a new TidyWise signup.
//
// Previously sent SMS via OpenPhone to two platform admin phone numbers.
// SMS removed for cost control — now sends a single email to
// support@tidywisecleaning.com (the platform admin inbox) via Resend.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "support@tidywisecleaning.com";

interface NotifySignupRequest {
  email: string;
  fullName?: string;
  phone?: string;
  signupMethod?: string; // 'email' | 'google'
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&#039;",
  }[c] as string));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.warn("[notify-platform-admin-signup] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { email, fullName, phone, signupMethod } = (await req.json()) as NotifySignupRequest;
    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const safeName = escapeHtml(fullName || "Not provided");
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || "Not provided");
    const safeMethod = escapeHtml(signupMethod || "email");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a; margin: 0 0 12px;">🚀 New TidyWise signup</h2>
        <table style="border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #888;">Name:</td><td style="padding: 6px 12px;">${safeName}</td></tr>
          <tr><td style="padding: 6px 0; color: #888;">Email:</td><td style="padding: 6px 12px;"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
          <tr><td style="padding: 6px 0; color: #888;">Phone:</td><td style="padding: 6px 12px;">${safePhone}</td></tr>
          <tr><td style="padding: 6px 0; color: #888;">Method:</td><td style="padding: 6px 12px;">${safeMethod}</td></tr>
          <tr><td style="padding: 6px 0; color: #888;">When:</td><td style="padding: 6px 12px;">${timestamp}</td></tr>
        </table>
        <p style="color: #555; line-height: 1.6; margin-top: 16px;">Reply directly to this email to reach ${safeName} at ${safeEmail}.</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TidyWise <noreply@tidywisecleaning.com>",
        to: [ADMIN_EMAIL],
        reply_to: email,
        subject: `🚀 New signup: ${fullName || email}`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[notify-platform-admin-signup] Resend error:", res.status, errText);
      return new Response(
        JSON.stringify({ success: false, error: "Email send failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[notify-platform-admin-signup] Admin email sent for", email);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[notify-platform-admin-signup] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
