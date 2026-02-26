import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resendFetch(apiKey: string, path: string, method: string, body?: unknown) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw ? { message: raw } : null;
  }

  return { status: res.status, data };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Backend configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Verify auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { action, organizationId, domain, resendDomainId } = await req.json();

    if (!organizationId) throw new Error("Missing organizationId");

    // Verify user is admin of this org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Only organization admins can manage email domains");
    }

    const { data: emailSettings, error: emailSettingsError } = await supabase
      .from("organization_email_settings")
      .select("resend_api_key")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (emailSettingsError) {
      console.error("[manage-resend-domain] Failed to load org email settings:", emailSettingsError);
      throw new Error("Failed to load organization email settings");
    }

    const resendApiKey = emailSettings?.resend_api_key?.trim();
    if (!resendApiKey) {
      throw new Error("No Resend API key configured for this organization. Add it in Settings → Emails.");
    }

    let result: unknown;

    switch (action) {
      case "add": {
        if (!domain) throw new Error("Missing domain name");

        // Validate domain format
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
        if (!domainRegex.test(domain)) throw new Error("Invalid domain format");

        console.log(`[manage-resend-domain] Adding domain: ${domain} for org: ${organizationId}`);

        // Create domain in Resend
        const { status, data } = await resendFetch(resendApiKey, "/domains", "POST", { name: domain });

        if (status === 403 && data?.message?.includes("registered already")) {
          // Domain already exists in Resend — look it up and sync locally
          console.log("[manage-resend-domain] Domain already registered in Resend, fetching existing...");
          const listRes = await resendFetch(resendApiKey, "/domains", "GET");
          console.log("[manage-resend-domain] List response:", JSON.stringify(listRes.data));
          
          // Resend returns { data: [...] } — handle both shapes
          const domainList = Array.isArray(listRes.data?.data) ? listRes.data.data 
                           : Array.isArray(listRes.data) ? listRes.data : [];
          const existing = domainList.find((d: { name: string }) => d.name === domain);
          
          if (!existing) {
            console.error("[manage-resend-domain] Domain not found in list. Available:", domainList.map((d: { name: string }) => d.name));
            throw new Error(`${domain} is registered under a different Resend account. Remove it there first, or use a domain already in your account (${domainList.map((d: { name: string }) => d.name).join(", ") || "none"}).`);
          }

          // Get full details
          const detailRes = await resendFetch(resendApiKey, `/domains/${existing.id}`, "GET");
          const detail = detailRes.status === 200 ? detailRes.data : existing;

          const { error: upsertError } = await supabase
            .from("organization_email_domains")
            .upsert({
              organization_id: organizationId,
              domain_name: domain,
              resend_domain_id: existing.id,
              status: detail.status || existing.status || "pending",
              dns_records: detail.records || null,
            }, { onConflict: "organization_id,domain_name" });

          if (upsertError) throw upsertError;

          result = {
            success: true,
            domainId: existing.id,
            status: detail.status || existing.status,
            records: detail.records || null,
          };
          break;
        }

        if (status !== 200 && status !== 201) {
          console.error("[manage-resend-domain] Resend error:", data);
          throw new Error(data?.message || "Failed to add domain to email service");
        }

        console.log("[manage-resend-domain] Resend domain created:", data);

        // Store in database
        const { error: insertError } = await supabase
          .from("organization_email_domains")
          .upsert({
            organization_id: organizationId,
            domain_name: domain,
            resend_domain_id: data.id,
            status: data.status || "pending",
            dns_records: data.records || null,
          }, { onConflict: "organization_id,domain_name" });

        if (insertError) throw insertError;

        result = { 
          success: true, 
          domainId: data.id, 
          status: data.status,
          records: data.records,
        };
        break;
      }

      case "verify": {
        if (!resendDomainId) throw new Error("Missing resendDomainId");

        console.log(`[manage-resend-domain] Verifying domain: ${resendDomainId}`);

        // Trigger verification in Resend
        const { status, data } = await resendFetch(resendApiKey, `/domains/${resendDomainId}/verify`, "POST");

        if (status !== 200) {
          console.error("[manage-resend-domain] Verify error:", data);
          throw new Error(data?.message || "Failed to verify domain");
        }

        result = { success: true, message: "Verification initiated" };
        break;
      }

      case "check": {
        if (!resendDomainId) throw new Error("Missing resendDomainId");

        console.log(`[manage-resend-domain] Checking domain status: ${resendDomainId}`);

        // Get domain status from Resend
        const { status, data } = await resendFetch(resendApiKey, `/domains/${resendDomainId}`, "GET");

        if (status !== 200) {
          console.error("[manage-resend-domain] Check error:", data);
          throw new Error(data?.message || "Failed to check domain status");
        }

        // Update local record
        await supabase
          .from("organization_email_domains")
          .update({
            status: data.status || "pending",
            dns_records: data.records || null,
          })
          .eq("resend_domain_id", resendDomainId)
          .eq("organization_id", organizationId);

        result = { 
          success: true, 
          status: data.status, 
          records: data.records,
        };
        break;
      }

      case "remove": {
        if (!resendDomainId) throw new Error("Missing resendDomainId");

        console.log(`[manage-resend-domain] Removing domain: ${resendDomainId}`);

        // Delete from Resend
        await resendFetch(resendApiKey, `/domains/${resendDomainId}`, "DELETE");

        // Delete from database
        await supabase
          .from("organization_email_domains")
          .delete()
          .eq("resend_domain_id", resendDomainId)
          .eq("organization_id", organizationId);

        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[manage-resend-domain] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
