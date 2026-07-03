// Public ingest endpoint for bookings coming from an external Lovable site.
// Auth: shared secret in `x-api-key` header must match EXTERNAL_BOOKING_INGEST_KEY.
// Target org: `organization_id` in body (or EXTERNAL_BOOKING_ORG_ID secret fallback).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Canonical service names the sender uses -> aliases we accept as equivalents
// (all comparisons are done lowercased + trimmed + punctuation-stripped).
const SERVICE_ALIASES: Record<string, string[]> = {
  "Standard Cleaning":     ["standard cleaning", "standard clean", "standard"],
  "Deep Cleaning":         ["deep cleaning", "deep clean", "first cleaning", "deep clean (first cleaning)"],
  "Move In/Out":           ["move in/out", "move in out", "move in/out clean", "move in/move out", "move in/move out clean", "movein moveout"],
  "Post-Construction":     ["post-construction", "post construction", "post construction clean", "post-construction clean", "construction clean up", "construction"],
  "Carpet Cleaning":       ["carpet cleaning", "carpet clean"],
  "Upholstery Cleaning":   ["upholstery cleaning", "upholstery clean", "upholstery"],
};

function normalizeServiceKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();
}

function findCanonicalName(input: string): string | null {
  const key = normalizeServiceKey(input);
  for (const [canonical, aliases] of Object.entries(SERVICE_ALIASES)) {
    if (aliases.some(a => normalizeServiceKey(a) === key)) return canonical;
    if (normalizeServiceKey(canonical) === key) return canonical;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedKey = Deno.env.get("EXTERNAL_BOOKING_INGEST_KEY");
  if (!expectedKey) return json({ error: "Ingest key not configured" }, 500);

  const provided = req.headers.get("x-api-key") || "";
  if (provided !== expectedKey) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Resolve target org — body wins so multiple sites can share the same key.
  const organization_id: string | undefined = body.organization_id || Deno.env.get("EXTERNAL_BOOKING_ORG_ID");
  if (!organization_id) return json({ error: "organization_id is required" }, 400);

  // Required fields
  const email: string | undefined = body.email?.toString().trim().toLowerCase();
  const scheduledAtRaw: string | undefined = body.scheduled_at;
  const nameRaw: string | undefined =
    body.name || [body.first_name, body.last_name].filter(Boolean).join(" ").trim() || undefined;

  if (!email) return json({ error: "email is required", field: "email" }, 400);
  if (!scheduledAtRaw) return json({ error: "scheduled_at is required (ISO datetime)", field: "scheduled_at" }, 400);
  if (!nameRaw) return json({ error: "name (or first_name/last_name) is required", field: "name" }, 400);

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    return json({ error: "scheduled_at is not a valid date", field: "scheduled_at" }, 400);
  }

  const first_name = (body.first_name || nameRaw.split(/\s+/)[0] || "Customer").toString();
  const last_name = (body.last_name || nameRaw.split(/\s+/).slice(1).join(" ") || "—").toString();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Log any incoming top-level fields we don't currently map so we can add support later.
  const KNOWN_FIELDS = new Set([
    "organization_id","name","first_name","last_name","email","phone","address","apt_suite",
    "city","state","zip_code","scheduled_at","service","service_id","total_amount","frequency",
    "bedrooms","bathrooms","square_footage","extras","notes","duration","has_pets",
  ]);
  const unknownFields = Object.keys(body).filter(k => !KNOWN_FIELDS.has(k));
  if (unknownFields.length > 0) {
    console.log("[ingest] unmapped incoming fields:", unknownFields, "payload keys:", Object.keys(body));
  }

  // 1. Find or create customer (scoped to org + email)
  let customerId: string | null = null;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("email", email)
    .maybeSingle();

  if (existingCustomer?.id) {
    customerId = existingCustomer.id;
    // Refresh contact + address fields if missing on the existing record.
    await supabase.from("customers").update({
      first_name,
      last_name,
      phone: body.phone ?? undefined,
      address: body.address ?? undefined,
      city: body.city ?? undefined,
      state: body.state ?? undefined,
      zip_code: body.zip_code ?? undefined,
    }).eq("id", customerId);
  } else {
    const { data: newCustomer, error: custErr } = await supabase
      .from("customers")
      .insert({
        organization_id,
        first_name,
        last_name,
        email,
        phone: body.phone ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip_code: body.zip_code ?? null,
      })
      .select("id")
      .single();
    if (custErr) return json({ error: "Failed to create customer", details: custErr.message }, 500);
    customerId = newCustomer.id;
  }

  // 2. Resolve service (case-insensitive + alias-aware, else create).
  let serviceId: string | null = body.service_id ?? null;
  let resolvedServiceName: string | null = null;

  if (!serviceId && body.service) {
    const incomingName = body.service.toString().trim();
    const canonical = findCanonicalName(incomingName) ?? incomingName;

    // Load all this org's services and match by normalized name / alias.
    const { data: orgServices } = await supabase
      .from("services")
      .select("id, name")
      .eq("organization_id", organization_id);

    const incomingKey = normalizeServiceKey(incomingName);
    const canonicalKey = normalizeServiceKey(canonical);

    const match = (orgServices ?? []).find(s => {
      const nk = normalizeServiceKey(s.name);
      if (nk === incomingKey || nk === canonicalKey) return true;
      // also try aliases: if this stored service maps to the same canonical
      const storedCanonical = findCanonicalName(s.name);
      return storedCanonical && storedCanonical === canonical;
    });

    if (match) {
      serviceId = match.id;
      resolvedServiceName = match.name;
    } else {
      // Auto-create with the canonical name so nothing is left blank.
      const { data: created, error: svcErr } = await supabase
        .from("services")
        .insert({
          organization_id,
          name: canonical,
          description: `Auto-created from external booking ingest (payload: "${incomingName}")`,
          duration: 120,
          price: Number.isFinite(+body.total_amount) ? +body.total_amount : 0,
          is_active: true,
        })
        .select("id, name")
        .single();
      if (svcErr) {
        console.log("[ingest] service auto-create failed:", svcErr.message);
      } else {
        serviceId = created.id;
        resolvedServiceName = created.name;
        console.log("[ingest] auto-created service:", canonical, "for org", organization_id);
      }
    }
  }

  // 3. Insert booking. square_footage column is text — store the numeric string.
  const sqftValue = body.square_footage != null ? String(body.square_footage) : null;
  const bathroomsValue = body.bathrooms != null ? String(body.bathrooms) : "1";
  const bedroomsValue = body.bedrooms != null ? String(body.bedrooms) : "1";

  const { data: booking, error: bookErr } = await supabase
    .from("bookings")
    .insert({
      organization_id,
      customer_id: customerId,
      service_id: serviceId,
      scheduled_at: scheduledAt.toISOString(),
      duration: Number.isFinite(+body.duration) ? +body.duration : 120,
      total_amount: Number.isFinite(+body.total_amount) ? +body.total_amount : 0,
      status: "confirmed",
      payment_status: "pending",
      notes: body.notes ?? `Imported from external site`,
      address: body.address ?? null,
      apt_suite: body.apt_suite ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip_code: body.zip_code ?? null,
      frequency: body.frequency ?? "one_time",
      bedrooms: bedroomsValue,
      bathrooms: bathroomsValue,
      square_footage: sqftValue,
      extras: Array.isArray(body.extras) ? body.extras : [],
      has_pets: typeof body.has_pets === "boolean" ? body.has_pets : null,
    })
    .select("id, booking_number, scheduled_at")
    .single();

  if (bookErr) return json({ error: "Failed to create booking", details: bookErr.message }, 500);

  // 4. Attach default checklist for this service + append `extras` as line items.
  try {
    if (serviceId) {
      const { data: template } = await supabase
        .from("checklist_templates")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("service_id", serviceId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (template?.id) {
        const { data: bcl, error: bclErr } = await supabase
          .from("booking_checklists")
          .insert({
            booking_id: booking.id,
            template_id: template.id,
            organization_id,
          })
          .select("id")
          .single();

        if (!bclErr && bcl?.id) {
          const { data: tplItems } = await supabase
            .from("checklist_items")
            .select("id, title")
            .eq("template_id", template.id)
            .order("sort_order", { ascending: true });

          const baseRows = (tplItems ?? []).map(item => ({
            booking_checklist_id: bcl.id,
            checklist_item_id: item.id,
            title: item.title,
            organization_id,
          }));

          const extraRows = Array.isArray(body.extras)
            ? body.extras.map((label: unknown) => ({
                booking_checklist_id: bcl.id,
                checklist_item_id: null,
                title: `Add-on: ${String(label)}`,
                organization_id,
              }))
            : [];

          const allRows = [...baseRows, ...extraRows];
          if (allRows.length > 0) {
            await supabase.from("booking_checklist_items").insert(allRows);
          }
        }
      } else if (Array.isArray(body.extras) && body.extras.length > 0) {
        // No template — still create a checklist so add-ons show up in the app.
        const { data: bcl } = await supabase
          .from("booking_checklists")
          .insert({ booking_id: booking.id, organization_id })
          .select("id")
          .single();
        if (bcl?.id) {
          await supabase.from("booking_checklist_items").insert(
            body.extras.map((label: unknown) => ({
              booking_checklist_id: bcl.id,
              checklist_item_id: null,
              title: `Add-on: ${String(label)}`,
              organization_id,
            }))
          );
        }
      }
    }
  } catch (e) {
    console.log("[ingest] checklist attach failed (non-fatal):", (e as Error).message);
  }

  return json({
    ok: true,
    booking_id: booking.id,
    booking_number: booking.booking_number,
    scheduled_at: booking.scheduled_at,
    customer_id: customerId,
    service_id: serviceId,
    service_name: resolvedServiceName,
    unmapped_fields: unknownFields,
  });
});
