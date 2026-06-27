// Diagnoses SMS/messaging health for the caller's organization.
// Validates only: API key works + phone number ID is valid against OpenPhone.
// No webhook registration checks (user manages inbound differently).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface HealthReport {
  organization_id: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  hours_since_inbound: number | null;
  sms_enabled: boolean;
  has_api_key: boolean;
  has_phone_number_id: boolean;
  api_key_valid: boolean;
  phone_number_id_valid: boolean;
  phone_number: string | null;
  issues: string[];
  recommendations: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestedOrgId: string | undefined = body?.organization_id;

    let orgIds: string[] = [];
    if (requestedOrgId) {
      const { data: membership } = await admin
        .from("org_memberships")
        .select("organization_id")
        .eq("organization_id", requestedOrgId)
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: role } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!membership && !role) {
        return new Response(
          JSON.stringify({ error: "Not authorized for that organization" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      orgIds = [requestedOrgId];
    } else {
      const { data: memberships } = await admin
        .from("org_memberships")
        .select("organization_id")
        .eq("user_id", user.id);
      orgIds = (memberships ?? []).map((m: any) => m.organization_id);
    }

    if (orgIds.length === 0) {
      return new Response(JSON.stringify({ reports: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reports: HealthReport[] = [];

    for (const orgId of orgIds) {
      const report: HealthReport = {
        organization_id: orgId,
        last_inbound_at: null,
        last_outbound_at: null,
        hours_since_inbound: null,
        sms_enabled: false,
        has_api_key: false,
        has_phone_number_id: false,
        api_key_valid: false,
        phone_number_id_valid: false,
        phone_number: null,
        issues: [],
        recommendations: [],
      };

      const { data: lastIn } = await admin
        .from("sms_messages")
        .select("sent_at")
        .eq("organization_id", orgId)
        .eq("direction", "inbound")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: lastOut } = await admin
        .from("sms_messages")
        .select("sent_at")
        .eq("organization_id", orgId)
        .eq("direction", "outbound")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      report.last_inbound_at = lastIn?.sent_at ?? null;
      report.last_outbound_at = lastOut?.sent_at ?? null;
      if (report.last_inbound_at) {
        report.hours_since_inbound = Math.round(
          (Date.now() - new Date(report.last_inbound_at).getTime()) / 3_600_000,
        );
      }

      const { data: settings } = await admin
        .from("organization_sms_settings")
        .select("openphone_api_key, openphone_phone_number_id, sms_enabled")
        .eq("organization_id", orgId)
        .maybeSingle();

      report.sms_enabled = !!settings?.sms_enabled;
      report.has_api_key = !!settings?.openphone_api_key;
      report.has_phone_number_id = !!settings?.openphone_phone_number_id;

      if (!report.has_api_key) {
        report.issues.push("OpenPhone API key is not configured.");
        report.recommendations.push(
          "Add your OpenPhone API key in Settings → SMS / OpenPhone.",
        );
      }
      if (!report.has_phone_number_id) {
        report.issues.push("OpenPhone phone number ID is not configured.");
        report.recommendations.push(
          "Add your OpenPhone phone number ID in Settings → SMS / OpenPhone.",
        );
      }
      if (!report.sms_enabled) {
        report.issues.push("SMS is disabled for this organization.");
        report.recommendations.push("Enable SMS in Settings → SMS / OpenPhone.");
      }

      // Validate API key + phone ID against OpenPhone
      if (report.has_api_key) {
        try {
          const resp = await fetch(
            "https://api.openphone.com/v1/phone-numbers",
            {
              headers: {
                Authorization: settings!.openphone_api_key as string,
                "Content-Type": "application/json",
              },
            },
          );
          if (resp.ok) {
            report.api_key_valid = true;
            const json = await resp.json();
            const numbers = (json?.data ?? []) as Array<any>;

            if (report.has_phone_number_id) {
              const match = numbers.find(
                (n: any) => n.id === settings!.openphone_phone_number_id,
              );
              if (match) {
                report.phone_number_id_valid = true;
                report.phone_number = match.number ?? match.phoneNumber ?? null;
              } else {
                report.issues.push(
                  "Phone number ID does not match any number on this OpenPhone account.",
                );
                report.recommendations.push(
                  `Available numbers: ${numbers
                    .map((n: any) => `${n.number ?? n.phoneNumber} (${n.id})`)
                    .join(", ") || "none"}`,
                );
              }
            }
          } else {
            const errText = await resp.text();
            report.issues.push(
              `OpenPhone API key is invalid (${resp.status}): ${errText.slice(0, 120)}`,
            );
            report.recommendations.push(
              "Generate a new API key in OpenPhone and update Settings → SMS.",
            );
          }
        } catch (err) {
          report.issues.push(
            `Could not reach OpenPhone API: ${(err as Error).message}`,
          );
        }
      }

      reports.push(report);
    }

    return new Response(JSON.stringify({ reports }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[messaging-health-check] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
