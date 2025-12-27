import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const helpCenterEmailSchema = z.object({
  type: z.enum(["contact", "idea"]),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(1).max(2000),
  organization_id: z.string().uuid(),
});

type HelpCenterEmailRequest = z.infer<typeof helpCenterEmailSchema>;

type BusinessSettingsRow = {
  resend_api_key: string | null;
  company_email: string | null;
  company_name: string | null;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsed = helpCenterEmailSchema.safeParse(raw);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          issues: parsed.error.issues,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const { type, name, email, message, organization_id }: HelpCenterEmailRequest = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Backend configuration error");
    }

    // Use service role to read org settings (do not expose service key to client)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // IMPORTANT: do not use .single() / .maybeSingle() here; duplicates may exist.
    const { data: settingsRows, error: settingsError } = await supabase
      .from("business_settings")
      .select("resend_api_key, company_email, company_name")
      .eq("organization_id", organization_id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (settingsError) {
      console.error("Error fetching business settings:", settingsError);
      throw new Error("Could not fetch organization settings");
    }

    const settings = (settingsRows?.[0] ?? null) as BusinessSettingsRow | null;

    if (!settings) {
      throw new Error(
        "Organization settings not found. Please open Settings → Emails and save your email settings first."
      );
    }

    if (!settings.resend_api_key) {
      throw new Error(
        "Resend API key not configured. Please add your Resend API key in Settings → Emails."
      );
    }

    if (!settings.company_email) {
      throw new Error(
        "Company email not configured. Please set your sender email in Settings → Emails."
      );
    }

    const isIdea = type === "idea";
    const subject = isIdea
      ? `💡 New Feature Idea from ${name}`
      : `📬 Help Center Contact from ${name}`;

    const heading = isIdea
      ? "New Feature Idea Submission"
      : "New Support Request";

    const fromName = settings.company_name?.trim() || "Support";
    const primaryFrom = `${fromName} <${settings.company_email}>`;
    const fallbackFrom = `${fromName} <onboarding@resend.dev>`;

    const sendResendEmail = async (from: string, toEmail: string) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.resend_api_key}`,
        },
        body: JSON.stringify({
          from,
          to: [toEmail],
          reply_to: email,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">${heading}</h1>
              
              <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>From:</strong> ${name}</p>
                <p style="margin: 0 0 10px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                <p style="margin: 0;"><strong>Type:</strong> ${isIdea ? "Feature Idea" : "Support Request"}</p>
              </div>
              
              <h2 style="color: #333; margin-top: 30px;">Message:</h2>
              <div style="background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <p style="white-space: pre-wrap; margin: 0;">${message}</p>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
              <p style="color: #6b7280; font-size: 12px;">This email was sent from your Help Center.</p>
            </div>
          `,
        }),
      });

      const json = await res.json().catch(() => ({}));
      return { res, json };
    };

    const extractTestingRecipient = (text: string) => {
      const match = text.match(
        /\(([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\)/i
      );
      return match?.[1] ?? null;
    };

    let { res, json } = await sendResendEmail(primaryFrom, settings.company_email);

    // Helper to check error type
    const getErrorType = (message: string | undefined): "testing" | "domain" | "other" => {
      if (!message) return "other";
      const lower = message.toLowerCase();
      if (lower.includes("only send testing emails")) return "testing";
      if (lower.includes("domain is not verified")) return "domain";
      return "other";
    };

    // Handle Resend errors with appropriate fallbacks
    if (!res.ok) {
      const messageText = (json as any)?.message;
      const errorType = getErrorType(messageText);

      if (errorType === "testing") {
        // In testing mode, Resend only allows sending TO the account owner's email
        const allowedTo = extractTestingRecipient(messageText);

        if (allowedTo) {
          console.warn(
            "Resend testing restriction detected. Redirecting to:",
            allowedTo,
            "Original recipient was:",
            settings.company_email
          );

          // Use fallback sender AND the allowed recipient
          ({ res, json } = await sendResendEmail(fallbackFrom, allowedTo));

          if (res.ok) {
            return new Response(
              JSON.stringify({
                ...json,
                warning:
                  `Resend is in testing mode; the email was sent to ${allowedTo}. Verify your domain at resend.com/domains to send to ${settings.company_email}.`,
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders },
              }
            );
          }

          // If it still failed, log and throw
          console.error("Resend API error after testing fallback:", json);
          throw new Error(
            `Resend is in testing mode. Email was attempted to ${allowedTo} but failed. Please verify your domain at resend.com/domains.`
          );
        }
      } else if (errorType === "domain") {
        // Domain not verified - try with fallback sender
        console.warn(
          "Resend domain not verified for sender:",
          primaryFrom,
          "Retrying with fallback sender:",
          fallbackFrom
        );

        ({ res, json } = await sendResendEmail(fallbackFrom, settings.company_email));

        if (res.ok) {
          return new Response(
            JSON.stringify({
              ...json,
              warning:
                "Sender domain not verified in Resend. Email was sent using a fallback sender. Verify your domain to remove this warning.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        // If fallback also failed due to testing mode, handle that
        const fallbackMessage = (json as any)?.message;
        if (getErrorType(fallbackMessage) === "testing") {
          const allowedTo = extractTestingRecipient(fallbackMessage);
          if (allowedTo) {
            ({ res, json } = await sendResendEmail(fallbackFrom, allowedTo));
            if (res.ok) {
              return new Response(
                JSON.stringify({
                  ...json,
                  warning:
                    `Resend is in testing mode; the email was sent to ${allowedTo}. Verify your domain at resend.com/domains.`,
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                }
              );
            }
          }
        }
      }

      console.error("Resend API error:", json);
      throw new Error((json as any)?.message || "Failed to send email");
    }

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-help-center-email function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
