import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Known field mappings for BookingKoala and Jobber CSV exports
const KNOWN_MAPPINGS: Record<string, Record<string, string>> = {
  customers: {
    // BookingKoala
    "client name": "full_name",
    "client email": "email",
    "client phone": "phone",
    "client address": "address",
    "first name": "first_name",
    "last name": "last_name",
    "full name": "full_name",
    "name": "full_name",
    "email": "email",
    "email address": "email",
    "phone": "phone",
    "phone number": "phone",
    "mobile": "phone",
    "address": "address",
    "street": "address",
    "street address": "address",
    "city": "city",
    "state": "state",
    "province": "state",
    "zip": "zip_code",
    "zip code": "zip_code",
    "postal code": "zip_code",
    "zipcode": "zip_code",
    "notes": "notes",
    "client notes": "notes",
    "tags": "tags",
  },
  staff: {
    "name": "full_name",
    "full name": "full_name",
    "first name": "first_name",
    "last name": "last_name",
    "email": "email",
    "email address": "email",
    "phone": "phone",
    "phone number": "phone",
    "mobile": "phone",
    "pay rate": "pay_rate",
    "hourly rate": "pay_rate",
    "rate": "pay_rate",
    "role": "role",
    "title": "role",
    "availability": "availability",
  },
  bookings: {
    "client": "customer_name",
    "client name": "customer_name",
    "customer": "customer_name",
    "customer name": "customer_name",
    "service": "service_name",
    "service name": "service_name",
    "service type": "service_name",
    "date": "scheduled_date",
    "scheduled date": "scheduled_date",
    "appointment date": "scheduled_date",
    "booking date": "scheduled_date",
    "time": "scheduled_time",
    "scheduled time": "scheduled_time",
    "start time": "scheduled_time",
    "duration": "duration",
    "length": "duration",
    "price": "total_amount",
    "total": "total_amount",
    "amount": "total_amount",
    "total amount": "total_amount",
    "status": "status",
    "booking status": "status",
    "address": "address",
    "service address": "address",
    "cleaner": "staff_name",
    "assigned to": "staff_name",
    "provider": "staff_name",
    "team member": "staff_name",
    "frequency": "frequency",
    "recurring": "frequency",
    "notes": "notes",
    "booking notes": "notes",
  },
  services: {
    "name": "name",
    "service name": "name",
    "service": "name",
    "description": "description",
    "price": "price",
    "rate": "price",
    "cost": "price",
    "duration": "duration",
    "time": "duration",
    "length": "duration",
    "category": "category",
  },
};

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Simple CSV parser that handles quoted fields
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });

  return { headers, rows };
}

function autoMapFields(headers: string[], dataType: string): Record<string, string> {
  const knownMap = KNOWN_MAPPINGS[dataType] || {};
  const mapping: Record<string, string> = {};

  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (knownMap[normalized]) {
      mapping[header] = knownMap[normalized];
    }
  }

  return mapping;
}

function detectDuplicates(rows: Record<string, string>[], mapping: Record<string, string>, dataType: string): Set<number> {
  const duplicateIndices = new Set<number>();
  const seen = new Map<string, number>();

  // Find the email or phone key for dedup
  const emailKey = Object.entries(mapping).find(([_, v]) => v === "email")?.[0];
  const phoneKey = Object.entries(mapping).find(([_, v]) => v === "phone")?.[0];

  rows.forEach((row, index) => {
    const keys: string[] = [];
    if (emailKey && row[emailKey]) keys.push(`email:${row[emailKey].toLowerCase().trim()}`);
    if (phoneKey && row[phoneKey]) keys.push(`phone:${row[phoneKey].replace(/\D/g, "")}`);

    for (const key of keys) {
      if (seen.has(key)) {
        duplicateIndices.add(index);
      } else {
        seen.set(key, index);
      }
    }
  });

  return duplicateIndices;
}

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

    const { csvContent, dataType, source, organizationId, filename } = await req.json();

    if (!csvContent || !dataType || !source || !organizationId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
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
      return new Response(JSON.stringify({ error: "Not authorized for this organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse CSV
    const { headers, rows } = parseCSV(csvContent);

    if (headers.length === 0 || rows.length === 0) {
      return new Response(JSON.stringify({ error: "CSV file is empty or has no data rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-map fields
    const fieldMapping = autoMapFields(headers, dataType);

    // Detect duplicates within the CSV
    const duplicates = detectDuplicates(rows, fieldMapping, dataType);

    // Use service role for inserts
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Create import record
    const { data: importRecord, error: importError } = await adminClient
      .from("migration_imports")
      .insert({
        organization_id: organizationId,
        source,
        data_type: dataType,
        status: "mapping",
        original_filename: filename || "unknown.csv",
        total_rows: rows.length,
        duplicate_rows: duplicates.size,
        field_mapping: fieldMapping,
      })
      .select()
      .single();

    if (importError) throw importError;

    // Insert rows in batches
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map((row, batchIndex) => {
        const rowIndex = i + batchIndex;
        const mappedData: Record<string, string> = {};
        for (const [csvCol, targetField] of Object.entries(fieldMapping)) {
          if (row[csvCol]) {
            mappedData[targetField] = row[csvCol];
          }
        }

        // Handle full_name splitting
        if (mappedData.full_name && !mappedData.first_name) {
          const parts = mappedData.full_name.trim().split(/\s+/);
          mappedData.first_name = parts[0] || "";
          mappedData.last_name = parts.slice(1).join(" ") || "";
        }

        return {
          import_id: importRecord.id,
          organization_id: organizationId,
          row_number: rowIndex + 1,
          raw_data: row,
          mapped_data: mappedData,
          status: duplicates.has(rowIndex) ? "duplicate" : "valid",
        };
      });

      await adminClient.from("migration_import_rows").insert(batch);
    }

    return new Response(JSON.stringify({
      importId: importRecord.id,
      totalRows: rows.length,
      duplicateRows: duplicates.size,
      headers,
      fieldMapping,
      preview: rows.slice(0, 5),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-migration-csv error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
