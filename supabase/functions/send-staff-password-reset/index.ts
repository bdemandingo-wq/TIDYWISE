import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
  redirectUrl: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { email, redirectUrl }: PasswordResetRequest = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Processing password reset for:", email);

    const origin = req.headers.get("origin") ?? "";
    const safeRedirectUrl =
      redirectUrl && origin && redirectUrl.startsWith(origin)
        ? redirectUrl
        : origin
          ? `${origin}/staff/reset-password`
          : redirectUrl;

    // Find the auth user for this email and ensure they have staff/admin role.
    let staffName = "Team Member";
    let targetUserId: string | null = null;

    // Prefer staff table (lets us personalize + links staff to auth user)
    const { data: staffMember } = await supabaseAdmin
      .from("staff")
      .select("name, user_id")
      .eq("email", email)
      .maybeSingle();

    if (staffMember?.user_id) {
      targetUserId = staffMember.user_id;
      staffName = staffMember.name || staffName;
    } else {
      // Fallback: allow admins to reset too (they may not exist in the staff table)
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (usersError) {
        console.error("Error listing users:", usersError);
      } else {
        const match = usersData?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
        );
        if (match) {
          targetUserId = match.id;
          const metaName = (match.user_metadata as Record<string, unknown> | null)?.full_name;
          if (typeof metaName === "string" && metaName.trim()) staffName = metaName;
        }
      }
    }

    if (!targetUserId) {
      // Don't reveal if email exists or not for security
      console.log("No account found for email:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .in("role", ["staff", "admin"]);

    if (!roleData || roleData.length === 0) {
      console.log("User has no staff/admin role:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate password reset link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: safeRedirectUrl,
      },
    });

    if (linkError) {
      console.error("Error generating recovery link:", linkError);
      return new Response(JSON.stringify({ error: "Failed to generate reset link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resetLink = linkData.properties?.action_link;

    console.log("Generated reset link, sending email via Resend");

    // Send email via Resend
    // Match the sender domain used by your existing confirmation emails
    const primaryFrom = "TidyWise Cleaning <support@jointidywise.com>";
    const fallbackFrom = "TidyWise <onboarding@resend.dev>";

    const sendEmail = async (from: string) => {
      return await resend.emails.send({
        from,
        to: [email],
        subject: "Reset Your Staff Portal Password",
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #14b8a6 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Password Reset</h1>
            </div>
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${staffName},</p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                We received a request to reset your staff portal password. Click the button below to set a new password:
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #14b8a6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Reset Password
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                This link will expire after it's used. If you didn't request a password reset, you can safely ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
              <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetLink}" style="color: #3b82f6; word-break: break-all;">${resetLink}</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      });
    };

    const primaryResult = await sendEmail(primaryFrom);
    if (primaryResult?.error) {
      console.error("Primary sender failed, retrying with fallback sender:", primaryResult.error);
      const fallbackResult = await sendEmail(fallbackFrom);
      if (fallbackResult?.error) {
        console.error("Fallback sender also failed:", fallbackResult.error);
        return new Response(JSON.stringify({ error: "Failed to send reset email" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("Password reset email sent via fallback sender to:", email);
    } else {
      console.log("Password reset email sent via primary sender to:", email);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent successfully" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-staff-password-reset:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
