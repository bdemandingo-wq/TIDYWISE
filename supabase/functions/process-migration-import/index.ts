import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { importId, organizationId } = await req.json();

    if (!importId || !organizationId) {
      return new Response(JSON.stringify({ error: "Missing importId or organizationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify org membership
    const { data: membership } = await supabaseClient
      .from("org_memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get import record
    const { data: importRecord, error: importErr } = await adminClient
      .from("migration_imports")
      .select("*")
      .eq("id", importId)
      .eq("organization_id", organizationId)
      .single();

    if (importErr || !importRecord) {
      return new Response(JSON.stringify({ error: "Import not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to importing
    await adminClient
      .from("migration_imports")
      .update({ status: "importing", started_at: new Date().toISOString() })
      .eq("id", importId);

    // Get all valid rows (skip duplicates and errors)
    const { data: rows, error: rowsErr } = await adminClient
      .from("migration_import_rows")
      .select("*")
      .eq("import_id", importId)
      .in("status", ["valid"])
      .order("row_number");

    if (rowsErr) throw rowsErr;

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorLog: any[] = [];

    const dataType = importRecord.data_type;

    for (const row of rows || []) {
      try {
        const data = row.mapped_data as Record<string, any>;

        if (dataType === "customers") {
          // Check for existing customer by email
          if (data.email) {
            const { data: existing } = await adminClient
              .from("customers")
              .select("id")
              .eq("organization_id", organizationId)
              .ilike("email", data.email.trim())
              .maybeSingle();

            if (existing) {
              await adminClient
                .from("migration_import_rows")
                .update({ status: "duplicate", duplicate_of: existing.id })
                .eq("id", row.id);
              skipped++;
              continue;
            }
          }

          const { data: created, error: insertErr } = await adminClient
            .from("customers")
            .insert({
              organization_id: organizationId,
              first_name: (data.first_name || "Unknown").substring(0, 100),
              last_name: (data.last_name || "").substring(0, 100),
              email: (data.email || `import-${row.row_number}@placeholder.com`).substring(0, 255),
              phone: data.phone?.substring(0, 20) || null,
              address: data.address?.substring(0, 255) || null,
              city: data.city?.substring(0, 100) || null,
              state: data.state?.substring(0, 50) || null,
              zip_code: data.zip_code?.substring(0, 20) || null,
              notes: data.notes?.substring(0, 1000) || null,
            })
            .select("id")
            .single();

          if (insertErr) throw insertErr;

          await adminClient
            .from("migration_import_rows")
            .update({ status: "imported", created_record_id: created.id })
            .eq("id", row.id);
          imported++;

        } else if (dataType === "staff") {
          const { data: created, error: insertErr } = await adminClient
            .from("staff")
            .insert({
              organization_id: organizationId,
              name: `${data.first_name || ""} ${data.last_name || ""}`.trim() || data.full_name || "Imported Staff",
              email: data.email || null,
              phone: data.phone || null,
              hourly_rate: data.pay_rate ? parseFloat(data.pay_rate) : null,
              is_active: true,
            })
            .select("id")
            .single();

          if (insertErr) throw insertErr;

          await adminClient
            .from("migration_import_rows")
            .update({ status: "imported", created_record_id: created.id })
            .eq("id", row.id);
          imported++;

        } else if (dataType === "services") {
          const { data: created, error: insertErr } = await adminClient
            .from("services")
            .insert({
              organization_id: organizationId,
              name: (data.name || "Imported Service").substring(0, 100),
              description: data.description?.substring(0, 500) || "",
              price: data.price ? parseFloat(data.price.replace(/[^0-9.]/g, "")) : 0,
              duration: data.duration ? parseInt(data.duration) : 60,
              is_active: true,
            })
            .select("id")
            .single();

          if (insertErr) throw insertErr;

          await adminClient
            .from("migration_import_rows")
            .update({ status: "imported", created_record_id: created.id })
            .eq("id", row.id);
          imported++;

        } else if (dataType === "bookings") {
          // For bookings, we try to match customer by name/email
          let customerId: string | null = null;

          if (data.customer_name) {
            const nameParts = data.customer_name.trim().split(/\s+/);
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(" ");

            const { data: customer } = await adminClient
              .from("customers")
              .select("id")
              .eq("organization_id", organizationId)
              .ilike("first_name", firstName)
              .ilike("last_name", lastName || "%")
              .maybeSingle();

            customerId = customer?.id || null;
          }

          // Parse date
          let scheduledAt: string;
          try {
            const dateStr = data.scheduled_date || data.date || new Date().toISOString();
            const timeStr = data.scheduled_time || "09:00";
            const combined = dateStr.includes("T") ? dateStr : `${dateStr}T${timeStr}:00`;
            scheduledAt = new Date(combined).toISOString();
          } catch {
            scheduledAt = new Date().toISOString();
          }

          const { data: created, error: insertErr } = await adminClient
            .from("bookings")
            .insert({
              organization_id: organizationId,
              customer_id: customerId,
              scheduled_at: scheduledAt,
              duration: data.duration ? parseInt(data.duration) : 120,
              total_amount: data.total_amount ? parseFloat(data.total_amount.replace(/[^0-9.]/g, "")) : 0,
              status: "confirmed",
              payment_status: "pending",
              address: data.address || null,
              notes: data.notes ? `[Imported] ${data.notes}` : "[Imported from migration]",
              frequency: data.frequency || null,
            })
            .select("id")
            .single();

          if (insertErr) throw insertErr;

          await adminClient
            .from("migration_import_rows")
            .update({ status: "imported", created_record_id: created.id })
            .eq("id", row.id);
          imported++;
        }
      } catch (err: any) {
        errors++;
        errorLog.push({
          row_number: row.row_number,
          error: err.message || "Unknown error",
        });
        await adminClient
          .from("migration_import_rows")
          .update({ status: "error", validation_errors: [{ message: err.message }] })
          .eq("id", row.id);
      }
    }

    // Update import record
    await adminClient
      .from("migration_imports")
      .update({
        status: "completed",
        imported_rows: imported,
        skipped_rows: skipped,
        error_rows: errors,
        error_log: errorLog,
        completed_at: new Date().toISOString(),
        import_summary: {
          imported,
          skipped,
          errors,
          total: (rows || []).length,
        },
      })
      .eq("id", importId);

    return new Response(JSON.stringify({
      success: true,
      imported,
      skipped,
      errors,
      errorLog: errorLog.slice(0, 10),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-migration-import error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
