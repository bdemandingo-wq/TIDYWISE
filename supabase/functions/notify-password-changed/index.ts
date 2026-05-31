// Sends a "your password was changed" confirmation email after a successful
// password reset. This is a security notification (like Apple/Google do) so
// the account holder knows if someone else changed their password.
//
// Platform-level send via RESEND_API_KEY — works for any user regardless
// of which (or whether any) organization they belong to.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { tidywiseEmailFooterHtml } from "../_shared/email-footer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Body {
  email: string;
  name?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email, name } = (await req.json().catch(() => ({}))) as Body;
    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.warn("[notify-password-changed] RESEND_API_KEY not set — skipping");
      return new Response(JSON.stringify({ success: false, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstName = (name?.split(" ")[0] || "there").trim();
    const when = new Date().toLocaleString("en-US", {
      dateStyle: "long", timeStyle: "short",
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a; margin: 0 0 12px;">Your TidyWise password was changed</h2>
        <p style="color: #333; line-height: 1.6;">
          Hi ${escapeHtml(firstName)}, this is a confirmation that the password
          for your TidyWise account was successfully changed on
          <strong>${escapeHtml(when)}</strong>.
        </p>
        <p style="color: #333; line-height: 1.6;">
          If you made this change, no further action is needed.
        </p>
        <div style="background: #fff7ed; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0;">
          <p style="color: #92400e; margin: 0; line-height: 1.5;">
            <strong>Didn't change your password?</strong> Reset it immediately at
            <a href="https://www.jointidywise.com/forgot-password" style="color: #92400e;">jointidywise.com/forgot-password</a>
            and contact <a href="mailto:support@tidywisecleaning.com" style="color: #92400e;">support@tidywisecleaning.com</a>.
          </p>
        </div>
        <p style="color: #555; margin-top: 24px;">— The TidyWise team</p>
        ${tidywiseEmailFooterHtml()}
      </div>`;

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "TidyWise <noreply@tidywisecleaning.com>",
          to: [email],
          reply_to: "support@tidywisecleaning.com",
          subject: "Your TidyWise password was changed",
          html,
        }),
      });
    } catch (err) {
      console.error("[notify-password-changed] send failed:", err);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-password-changed] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
