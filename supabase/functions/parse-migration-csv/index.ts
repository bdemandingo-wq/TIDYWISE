import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Known field mappings for BookingKoala and Jobber CSV exports
const KNOWN_MAPPINGS: Record<string, Record<string, string>> = {
  customers: {
    // Names
    "client name": "full_name", "customer name": "full_name", "name": "full_name", "full name": "full_name",
    "first name": "first_name", "fname": "first_name", "given name": "first_name",
    "last name": "last_name", "lname": "last_name", "surname": "last_name", "family name": "last_name",
    // Contact
    "client email": "email", "customer email": "email", "email": "email", "email address": "email", "primary email": "email",
    "client phone": "phone", "customer phone": "phone", "phone": "phone", "phone number": "phone",
    "mobile": "phone", "mobile phone": "phone", "primary phone": "phone", "cell": "phone", "cell phone": "phone",
    // Address
    "client address": "address", "customer address": "address", "address": "address",
    "street": "address", "street address": "address", "address 1": "address", "address line 1": "address",
    "city": "city", "town": "city",
    "state": "state", "province": "state", "region": "state",
    "zip": "zip_code", "zip code": "zip_code", "zipcode": "zip_code", "postal code": "zip_code", "postcode": "zip_code",
    // Meta
    "notes": "notes", "client notes": "notes", "customer notes": "notes", "internal notes": "notes",
    "tags": "tags", "labels": "tags", "client tags": "tags",
    "company": "company_name", "company name": "company_name", "business name": "company_name",
    "status": "customer_status", "client status": "customer_status",
    "lifetime value": "lifetime_value", "total spent": "lifetime_value",
  },
  staff: {
    "name": "full_name", "full name": "full_name", "team member": "full_name", "employee name": "full_name",
    "first name": "first_name", "last name": "last_name",
    "email": "email", "email address": "email",
    "phone": "phone", "phone number": "phone", "mobile": "phone",
    "pay rate": "pay_rate", "hourly rate": "pay_rate", "rate": "pay_rate", "wage": "pay_rate",
    "role": "role", "title": "role", "position": "role",
    "active": "is_active", "status": "is_active",
  },
  bookings: {
    // Customer match keys
    "client": "customer_name", "client name": "customer_name", "customer": "customer_name", "customer name": "customer_name",
    "client email": "customer_email", "customer email": "customer_email", "email": "customer_email",
    "client phone": "customer_phone", "customer phone": "customer_phone", "phone": "customer_phone",
    // Service
    "service": "service_name", "service name": "service_name", "service type": "service_name", "job type": "service_name",
    // Schedule
    "date": "scheduled_date", "scheduled date": "scheduled_date", "appointment date": "scheduled_date",
    "booking date": "scheduled_date", "job date": "scheduled_date", "start date": "scheduled_date",
    "time": "scheduled_time", "scheduled time": "scheduled_time", "start time": "scheduled_time", "appointment time": "scheduled_time",
    "duration": "duration", "length": "duration", "duration (min)": "duration", "hours": "duration_hours",
    // Money
    "price": "total_amount", "total": "total_amount", "amount": "total_amount", "total amount": "total_amount",
    "subtotal": "subtotal", "tax": "tax_amount", "tip": "tip_amount", "discount": "discount_amount",
    "payment status": "payment_status", "paid": "payment_status",
    // Status / assignment
    "status": "status", "booking status": "status", "job status": "status",
    "address": "address", "service address": "address", "job address": "address",
    "city": "city", "state": "state", "zip": "zip_code", "zip code": "zip_code",
    "cleaner": "staff_name", "assigned to": "staff_name", "provider": "staff_name", "team member": "staff_name", "assigned": "staff_name",
    // Property details
    "bedrooms": "bedrooms", "beds": "bedrooms", "br": "bedrooms",
    "bathrooms": "bathrooms", "baths": "bathrooms", "ba": "bathrooms",
    "square footage": "square_footage", "sqft": "square_footage", "sq ft": "square_footage", "size": "square_footage",
    "extras": "extras", "add-ons": "extras", "addons": "extras",
    // Recurrence / notes
    "frequency": "frequency", "recurring": "frequency", "repeat": "frequency",
    "notes": "notes", "booking notes": "notes", "job notes": "notes", "internal notes": "notes",
  },
  services: {
    "name": "name", "service name": "name", "service": "name", "service type": "name",
    "description": "description", "details": "description",
    "price": "price", "rate": "price", "cost": "price", "base price": "price",
    "duration": "duration", "time": "duration", "length": "duration", "default duration": "duration",
    "category": "category", "type": "category",
    "active": "is_active",
  },
  recurring_plans: {
    "client": "customer_name", "client name": "customer_name", "customer": "customer_name", "customer name": "customer_name",
    "client email": "customer_email", "customer email": "customer_email", "email": "customer_email",
    "client phone": "customer_phone", "customer phone": "customer_phone", "phone": "customer_phone",
    "service": "service_name", "service name": "service_name",
    "frequency": "frequency", "recurring": "frequency", "repeat": "frequency", "schedule": "frequency",
    "preferred day": "preferred_day", "day": "preferred_day", "day of week": "preferred_day",
    "preferred time": "preferred_time", "time": "preferred_time", "start time": "preferred_time",
    "start date": "start_date", "next date": "start_date", "next scheduled": "start_date",
    "price": "total_amount", "total": "total_amount", "amount": "total_amount",
    "bedrooms": "bedrooms", "bathrooms": "bathrooms", "sqft": "square_footage", "square footage": "square_footage",
    "address": "address", "city": "city", "state": "state", "zip": "zip_code", "zip code": "zip_code",
    "cleaner": "staff_name", "assigned to": "staff_name",
    "notes": "notes",
  },
  property_notes: {
    "client": "customer_name", "client name": "customer_name", "customer": "customer_name", "customer name": "customer_name",
    "email": "customer_email", "client email": "customer_email", "customer email": "customer_email",
    "phone": "customer_phone", "client phone": "customer_phone", "customer phone": "customer_phone",
    "notes": "notes", "property notes": "notes", "home notes": "notes", "internal notes": "notes",
    "access": "access_instructions", "access instructions": "access_instructions", "entry": "access_instructions", "entry instructions": "access_instructions",
    "gate code": "gate_code", "gate": "gate_code",
    "alarm code": "alarm_code", "alarm": "alarm_code", "security code": "alarm_code",
    "pets": "has_pets", "has pets": "has_pets",
    "pet notes": "pet_notes", "pet info": "pet_notes", "pet": "pet_notes",
    "parking": "parking_notes", "parking notes": "parking_notes", "parking instructions": "parking_notes",
  },
};

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim()); current = "";
      } else { current += ch; }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });

  return { headers, rows };
}

function autoMapFields(headers: string[], dataType: string): Record<string, string> {
  const knownMap = KNOWN_MAPPINGS[dataType] || {};
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (knownMap[normalized]) mapping[header] = knownMap[normalized];
  }
  return mapping;
}

function detectDuplicates(rows: Record<string, string>[], mapping: Record<string, string>): Set<number> {
  const duplicateIndices = new Set<number>();
  const seen = new Map<string, number>();
  const emailKey = Object.entries(mapping).find(([_, v]) => v === "email" || v === "customer_email")?.[0];
  const phoneKey = Object.entries(mapping).find(([_, v]) => v === "phone" || v === "customer_phone")?.[0];

  rows.forEach((row, index) => {
    const keys: string[] = [];
    if (emailKey && row[emailKey]) keys.push(`email:${row[emailKey].toLowerCase().trim()}`);
    if (phoneKey && row[phoneKey]) keys.push(`phone:${row[phoneKey].replace(/\D/g, "")}`);
    for (const key of keys) {
      if (seen.has(key)) duplicateIndices.add(index);
      else seen.set(key, index);
    }
  });

  return duplicateIndices;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { csvContent, dataType, source, organizationId, filename } = await req.json();

    if (!csvContent || !dataType || !source || !organizationId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await supabaseClient
      .from("org_memberships").select("role")
      .eq("organization_id", organizationId).eq("user_id", user.id).maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Not authorized for this organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { headers, rows } = parseCSV(csvContent);
    if (headers.length === 0 || rows.length === 0) {
      return new Response(JSON.stringify({ error: "CSV file is empty or has no data rows" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fieldMapping = autoMapFields(headers, dataType);
    const duplicates = detectDuplicates(rows, fieldMapping);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: importRecord, error: importError } = await adminClient
      .from("migration_imports")
      .insert({
        organization_id: organizationId,
        source, data_type: dataType, status: "mapping",
        original_filename: filename || "unknown.csv",
        total_rows: rows.length,
        duplicate_rows: duplicates.size,
        field_mapping: fieldMapping,
      })
      .select().single();

    if (importError) throw importError;

    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map((row, batchIndex) => {
        const rowIndex = i + batchIndex;
        const mappedData: Record<string, string> = {};
        for (const [csvCol, targetField] of Object.entries(fieldMapping)) {
          if (row[csvCol]) mappedData[targetField] = row[csvCol];
        }
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
      headers, fieldMapping,
      preview: rows.slice(0, 5),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("parse-migration-csv error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
