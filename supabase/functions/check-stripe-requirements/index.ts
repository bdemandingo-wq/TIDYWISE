import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Human-readable mapping of Stripe requirement codes
const REQUIREMENT_LABELS: Record<string, string> = {
  "individual.verification.document": "a photo of your government-issued ID",
  "individual.verification.additional_document": "an additional identity document",
  "individual.dob.day": "your date of birth",
  "individual.dob.month": "your date of birth",
  "individual.dob.year": "your date of birth",
  "individual.first_name": "your first name",
  "individual.last_name": "your last name",
  "individual.ssn_last_4": "the last 4 digits of your SSN",
  "individual.id_number": "your SSN or government ID number",
  "individual.address.line1": "your street address",
  "individual.address.city": "your city",
  "individual.address.state": "your state",
  "individual.address.postal_code": "your ZIP code",
  "individual.email": "your email address",
  "individual.phone": "your phone number",
  "external_account": "a bank account for receiving payouts",
  "tos_acceptance.date": "acceptance of the Terms of Service",
  "tos_acceptance.ip": "acceptance of the Terms of Service",
  "business_profile.url": "a business website or profile URL",
  "business_profile.mcc": "your business category",
};

function translateRequirements(codes: string[]): string[] {
  const seen = new Set<string>();
  return codes
    .map((code) => REQUIREMENT_LABELS[code] || code.replace(/[_.]/g, " "))
    .filter((label) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function buildEmailHtml(
  firstName: string,
  requirementType: string,
  requirements: string[],
  onboardingUrl: string,
): string {
  const translated = translateRequirements(requirements);

  if (requirementType === "pending_verification") {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#1a1a2e;">Hi ${firstName},</h2>
        <p style="color:#333;font-size:15px;line-height:1.6;">
          Your bank is currently verifying your account information. This typically takes 2-3 business days — <strong>no action is needed from you</strong>.
        </p>
        <p style="color:#333;font-size:15px;line-height:1.6;">
          Items being verified:
        </p>
        <ul style="color:#555;font-size:14px;line-height:1.8;">
          ${translated.map((r) => `<li>${r}</li>`).join("")}
        </ul>
        <p style="color:#333;font-size:15px;line-height:1.6;">
          We'll notify you once verification is complete and your payouts are active. TidyWise operates on net 30 terms.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#888;font-size:13px;">
          Need help? Contact us at <a href="mailto:support@tidywisecleaning.com" style="color:#4f46e5;">support@tidywisecleaning.com</a> or call <a href="tel:+15615718725" style="color:#4f46e5;">(561) 571-8725</a>.
        </p>
        <p style="color:#888;font-size:13px;">— The TidyWise Team</p>
      </div>
    `;
  }

  const urgencyNote =
    requirementType === "past_due"
      ? `<p style="color:#dc2626;font-size:15px;font-weight:bold;">⚠️ Your payout setup has items that are past due. Payouts are currently held until these are completed.</p>`
      : `<p style="color:#333;font-size:15px;line-height:1.6;">Your payout setup is almost complete, but we still need a few things from you. Payouts are held until setup is finished.</p>`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#1a1a2e;">Hi ${firstName},</h2>
      ${urgencyNote}
      <p style="color:#333;font-size:15px;line-height:1.6;">
        Here's what's still needed:
      </p>
      <ul style="color:#555;font-size:14px;line-height:1.8;">
        ${translated.map((r) => `<li>${r}</li>`).join("")}
      </ul>
      <div style="text-align:center;margin:28px 0;">
        <a href="${onboardingUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:16px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;">
          Complete Your Payout Setup
        </a>
      </div>
      <p style="color:#333;font-size:15px;line-height:1.6;">
        TidyWise operates on net 30 terms. Once your setup is complete, your earnings will be processed automatically.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#888;font-size:13px;">
        Need help? Contact us at <a href="mailto:support@tidywisecleaning.com" style="color:#4f46e5;">support@tidywisecleaning.com</a> or call <a href="tel:+15615718725" style="color:#4f46e5;">(561) 571-8725</a>.
      </p>
      <p style="color:#888;font-size:13px;">— The TidyWise Team</p>
    </div>
  `;
}

function buildResolvedEmailHtml(firstName: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#1a1a2e;">Hi ${firstName},</h2>
      <p style="color:#333;font-size:15px;line-height:1.6;">
        Great news — your payout setup is now complete! 🎉
      </p>
      <p style="color:#333;font-size:15px;line-height:1.6;">
        Payouts are now active on your TidyWise account. Your earnings will be processed automatically on our net 30 schedule.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#888;font-size:13px;">
        Need help? Contact us at <a href="mailto:support@tidywisecleaning.com" style="color:#4f46e5;">support@tidywisecleaning.com</a> or call <a href="tel:+15615718725" style="color:#4f46e5;">(561) 571-8725</a>.
      </p>
      <p style="color:#888;font-size:13px;">— The TidyWise Team</p>
    </div>
  `;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const platformStripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const globalResendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !platformStripeKey) {
      console.error("[check-stripe-requirements] Missing env vars");
      return new Response(JSON.stringify({ error: "Server config error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const stripe = new Stripe(platformStripeKey, { apiVersion: "2025-08-27.basil" });

    // Optional: filter to specific org if called manually
    let filterOrgId: string | null = null;
    try {
      const body = await req.json();
      filterOrgId = body?.organizationId || null;
    } catch {
      // cron call with no body
    }

    // Fetch all payout accounts with payouts_enabled = false that have a stripe_account_id
    let query = supabase
      .from("staff_payout_accounts")
      .select("id, staff_id, organization_id, stripe_account_id")
      .eq("payouts_enabled", false)
      .not("stripe_account_id", "is", null);

    if (filterOrgId) {
      query = query.eq("organization_id", filterOrgId);
    }

    const { data: accounts, error: accountsError } = await query;

    if (accountsError) {
      console.error("[check-stripe-requirements] Error fetching accounts:", accountsError);
      throw new Error("Failed to fetch payout accounts");
    }

    if (!accounts || accounts.length === 0) {
      console.log("[check-stripe-requirements] No accounts need checking");
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[check-stripe-requirements] Checking ${accounts.length} accounts`);

    let emailsSent = 0;
    let skipped = 0;
    let errors = 0;

    for (const account of accounts) {
      try {
        // Retrieve latest from Stripe
        const stripeAccount = await stripe.accounts.retrieve(account.stripe_account_id);

        const currentlyDue = stripeAccount.requirements?.currently_due || [];
        const pastDue = stripeAccount.requirements?.past_due || [];
        const pendingVerification = stripeAccount.requirements?.pending_verification || [];
        const disabledReason = stripeAccount.requirements?.disabled_reason || null;

        // Update local record
        const newStatus = stripeAccount.details_submitted
          ? (stripeAccount.payouts_enabled ? "active" : "pending_verification")
          : "onboarding";

        await supabase
          .from("staff_payout_accounts")
          .update({
            account_status: newStatus,
            payouts_enabled: stripeAccount.payouts_enabled || false,
            charges_enabled: stripeAccount.charges_enabled || false,
            details_submitted: stripeAccount.details_submitted || false,
            requirements_currently_due: currentlyDue,
            requirements_pending_verification: pendingVerification,
            disabled_reason: disabledReason,
            stripe_requirements_errors: stripeAccount.requirements?.errors || [],
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        // If payouts just became enabled, skip
        if (stripeAccount.payouts_enabled) {
          console.log(`[check-stripe-requirements] Account ${account.stripe_account_id} is now active, skipping`);
          continue;
        }

        // Determine requirement type and codes
        let requirementType: string;
        let requirementCodes: string[];

        if (pastDue.length > 0) {
          requirementType = "past_due";
          requirementCodes = pastDue;
        } else if (currentlyDue.length > 0) {
          requirementType = "currently_due";
          requirementCodes = currentlyDue;
        } else if (pendingVerification.length > 0) {
          requirementType = "pending_verification";
          requirementCodes = pendingVerification;
        } else if (disabledReason) {
          requirementType = "currently_due";
          requirementCodes = [disabledReason];
        } else {
          continue; // nothing to flag
        }

        // Check existing notification for dedupe
        const { data: existingNotif } = await supabase
          .from("stripe_requirement_notifications")
          .select("id, email_sent_count, last_emailed_at, needs_manual_followup")
          .eq("staff_id", account.staff_id)
          .eq("requirement_type", requirementType)
          .is("resolved_at", null)
          .maybeSingle();

        // If already flagged for manual follow-up (3+ emails), skip
        if (existingNotif?.needs_manual_followup) {
          console.log(`[check-stripe-requirements] Staff ${account.staff_id} needs manual followup, skipping`);
          skipped++;
          continue;
        }

        // Dedupe: don't email same cleaner for same requirement within 48 hours
        if (existingNotif?.last_emailed_at) {
          const hoursSinceLastEmail = (Date.now() - new Date(existingNotif.last_emailed_at).getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastEmail < 48) {
            console.log(`[check-stripe-requirements] Staff ${account.staff_id} emailed ${hoursSinceLastEmail.toFixed(1)}h ago, skipping`);
            skipped++;
            continue;
          }
        }

        // Get staff info for email
        const { data: staff } = await supabase
          .from("staff")
          .select("name, email")
          .eq("id", account.staff_id)
          .maybeSingle();

        if (!staff?.email) {
          console.log(`[check-stripe-requirements] No email for staff ${account.staff_id}, skipping`);
          skipped++;
          continue;
        }

        const firstName = staff.name?.split(" ")[0] || "there";

        // Generate fresh onboarding link (only for action-required types)
        let onboardingUrl = "";
        let linkExpiresAt: string | null = null;

        if (requirementType !== "pending_verification") {
          try {
            const accountLink = await stripe.accountLinks.create({
              account: account.stripe_account_id,
              refresh_url: "https://jointidywise.lovable.app/cleaner-portal",
              return_url: "https://jointidywise.lovable.app/cleaner-portal",
              type: "account_onboarding",
            });
            onboardingUrl = accountLink.url;
            linkExpiresAt = new Date(accountLink.expires_at * 1000).toISOString();
          } catch (linkErr: any) {
            console.error(`[check-stripe-requirements] Failed to create account link for ${account.stripe_account_id}:`, linkErr.message);
            errors++;
            continue;
          }
        }

        // Get org email settings for sender info
        const { data: orgEmailSettings } = await supabase
          .from("organization_email_settings")
          .select("from_name, from_email, resend_api_key")
          .eq("organization_id", account.organization_id)
          .maybeSingle();

        const resendApiKey = orgEmailSettings?.resend_api_key || globalResendApiKey;
        if (!resendApiKey) {
          console.error(`[check-stripe-requirements] No Resend API key for org ${account.organization_id}`);
          errors++;
          continue;
        }

        const fromName = orgEmailSettings?.from_name || "TidyWise";
        const fromEmail = orgEmailSettings?.from_email || "noreply@tidywisecleaning.com";

        // Build subject
        let subject: string;
        if (requirementType === "past_due") {
          subject = "Action Required: Complete your TidyWise payout setup to get paid";
        } else if (requirementType === "currently_due") {
          subject = "Finish your TidyWise payout setup to receive your earnings";
        } else {
          subject = "Your bank is verifying your account — no action needed";
        }

        // Build email
        const html = buildEmailHtml(firstName, requirementType, requirementCodes, onboardingUrl);

        // Send via Resend
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: [staff.email],
            subject,
            html,
          }),
        });

        const resendData = await resendRes.json();
        const emailStatus = resendRes.ok ? "sent" : "failed";

        if (!resendRes.ok) {
          console.error(`[check-stripe-requirements] Resend error for ${staff.email}:`, resendData);
          errors++;
        } else {
          emailsSent++;
          console.log(`[check-stripe-requirements] Email sent to ${staff.email} (${requirementType})`);
        }

        // Track notification
        const newCount = (existingNotif?.email_sent_count || 0) + 1;
        const needsManualFollowup = newCount >= 3;

        if (existingNotif) {
          await supabase
            .from("stripe_requirement_notifications")
            .update({
              email_sent_count: newCount,
              last_emailed_at: new Date().toISOString(),
              account_link_url: onboardingUrl || null,
              link_expires_at: linkExpiresAt,
              email_status: emailStatus,
              needs_manual_followup: needsManualFollowup,
              stripe_requirement_codes: requirementCodes,
            })
            .eq("id", existingNotif.id);
        } else {
          await supabase
            .from("stripe_requirement_notifications")
            .insert({
              staff_id: account.staff_id,
              organization_id: account.organization_id,
              requirement_type: requirementType,
              stripe_requirement_codes: requirementCodes,
              email_sent_count: 1,
              last_emailed_at: new Date().toISOString(),
              account_link_url: onboardingUrl || null,
              link_expires_at: linkExpiresAt,
              email_status: emailStatus,
              needs_manual_followup: needsManualFollowup,
            });
        }
      } catch (err: any) {
        console.error(`[check-stripe-requirements] Error processing account ${account.stripe_account_id}:`, err.message);
        errors++;
      }
    }

    console.log(`[check-stripe-requirements] Done: ${emailsSent} sent, ${skipped} skipped, ${errors} errors`);

    return new Response(
      JSON.stringify({ processed: accounts.length, emailsSent, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[check-stripe-requirements] Unhandled error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
