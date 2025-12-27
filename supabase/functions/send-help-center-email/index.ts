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
        "Company email not configured. Please set your business email in Settings → Emails to receive inquiries."
      );
    }

    const isIdea = type === "idea";
    const subject = isIdea
      ? `💡 New Feature Idea from ${name}`
      : `📬 Help Center Contact from ${name}`;

    const heading = isIdea
      ? "New Feature Idea Submission"
      : "New Support Request";

    const fromName = settings.company_name?.trim() || "Help Center";
    // Always use onboarding@resend.dev as sender (guaranteed to work)
    // Send TO company_email so the business receives inquiries at their email
    const senderFrom = `${fromName} <onboarding@resend.dev>`;
    const recipientTo = settings.company_email;

    const sendResendEmail = async (from: string, toEmail: string) => {
      let lastRes: Response | null = null;
      let lastJson: any = {};

      for (let attempt = 0; attempt < 3; attempt++) {
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
        lastRes = res;
        lastJson = json;

        // Resend rate limit (often 2 req/sec in testing/free)
        if (res.status === 429 && attempt < 2) {
          const retryAfter = res.headers.get("retry-after");
          const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
          const retryAfterMs = !Number.isNaN(retryAfterSeconds)
            ? Math.max(500, retryAfterSeconds * 1000)
            : 800 * (attempt + 1);

          console.warn(
            "Resend rate limited. Retrying in",
            retryAfterMs,
            "ms. Attempt",
            attempt + 1,
            "of 3"
          );
          await new Promise((r) => setTimeout(r, retryAfterMs));
          continue;
        }

        return { res, json };
      }

      return { res: lastRes!, json: lastJson };
    };

    // Send email to the company's business email
    console.log("Sending Help Center email to:", recipientTo, "from:", senderFrom);
    
    let { res, json } = await sendResendEmail(senderFrom, recipientTo);

    // Handle Resend testing mode restriction
    if (!res.ok) {
      const messageText = (json as any)?.message;
      const lower = messageText?.toLowerCase() || "";
      
      if (lower.includes("only send testing emails")) {
        // Extract allowed recipient from error message
        const match = messageText.match(/\(([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\)/i);
        const allowedTo = match?.[1];
        
        if (allowedTo) {
          console.warn("Resend testing mode. Redirecting to allowed recipient:", allowedTo);
          ({ res, json } = await sendResendEmail(senderFrom, allowedTo));
          
          if (res.ok) {
            return new Response(
              JSON.stringify({
                ...json,
                warning: `Resend is in testing mode. Email sent to ${allowedTo} instead of ${recipientTo}. Verify your domain at resend.com/domains to send to any address.`,
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders },
              }
            );
          }
        }
      }
      
      console.error("Resend API error:", json);
      throw new Error((json as any)?.message || "Failed to send email");
    }

    console.log("Email sent successfully to:", recipientTo);
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    const message = error?.message || "Failed to send email";
    const lower = String(message).toLowerCase();
    const status =
      lower.includes("too many requests") || lower.includes("rate limit") ? 429 : 500;

    console.error("Error in send-help-center-email function:", error);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
