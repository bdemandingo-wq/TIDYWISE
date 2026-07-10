import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadOrgBrand,
  renderBrandedEmail,
  SAMPLE_BOOKING_DATA,
} from "../_shared/org-email-renderer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  organizationId: string;
  templateType: "confirmation" | "reminder";
  subject?: string;
  body?: string;
  sections?: unknown;
}

async function requireOrgAdmin(req: Request, organizationId: string): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return "Missing Authorization header";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return "Not authenticated";
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: membership } = await admin
    .from("org_memberships")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!membership) return "You are not a member of this organization";
  if (!["owner", "admin", "manager"].includes(membership.role)) {
    return "Insufficient permissions";
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body.organizationId || !body.templateType) {
      return json({ error: "Missing organizationId or templateType" }, 400);
    }
    const authErr = await requireOrgAdmin(req, body.organizationId);
    if (authErr) return json({ error: authErr }, 403);

    const brandResult = await loadOrgBrand(body.organizationId);
    if (!brandResult.success) return json({ error: brandResult.error }, 400);
    const brand = brandResult.brand;

    const sample = { ...SAMPLE_BOOKING_DATA, company_name: brand.companyName };
    const isReminder = body.templateType === "reminder";
    const { subject, html } = renderBrandedEmail({
      brand,
      subject: body.subject || (isReminder
        ? "Reminder: {{service_name}} on {{scheduled_date}}"
        : "Booking Confirmation - {{booking_number}}"),
      bodyText: body.body || "",
      sections: Array.isArray(body.sections) ? body.sections as any : undefined,
      data: sample,
      showAppointmentCard: true,
      bannerLabel: isReminder ? "Appointment Reminder" : "Booking Confirmed",
    });

    console.log("[preview-org-email] rendered", {
      organizationId: body.organizationId,
      templateType: body.templateType,
      fromEmail: brand.fromEmail,
    });

    return json({
      subject,
      html,
      from: `${brand.fromName} <${brand.fromEmail}>`,
      replyTo: brand.replyToEmail,
      companyName: brand.companyName,
    }, 200);
  } catch (e) {
    console.error("[preview-org-email] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
