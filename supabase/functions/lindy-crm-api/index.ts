import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LINDY_API_KEY = Deno.env.get("LINDY_API_KEY");
    if (!LINDY_API_KEY) {
      console.error("LINDY_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { api_key, action, organization_id, ...params } = body;

    if (!api_key || api_key !== LINDY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing required field: action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify organization exists
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organization_id)
      .single();

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: "Invalid organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: any;

    switch (action) {
      // ============ READ OPERATIONS ============

      case "get_customers": {
        const { limit = 50, offset = 0, search } = params;
        let query = supabase
          .from("customers")
          .select("id, first_name, last_name, email, phone, address, city, state, zip_code, is_recurring, customer_status, marketing_status, created_at, notes")
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) {
          query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        result = { customers: data, count: data?.length || 0 };
        break;
      }

      case "get_customer": {
        const { customer_id } = params;
        if (!customer_id) throw new Error("Missing customer_id");

        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("id", customer_id)
          .eq("organization_id", organization_id)
          .single();

        if (error) throw error;
        result = { customer: data };
        break;
      }

      case "get_bookings": {
        const { limit = 50, offset = 0, status, customer_id, from_date, to_date } = params;
        let query = supabase
          .from("bookings")
          .select(`
            id, booking_number, scheduled_at, status, payment_status, total_amount, 
            duration, address, city, state, notes, frequency,
            customer_id, staff_id, service_id,
            customers(first_name, last_name, email, phone),
            services(name),
            staff(name)
          `)
          .eq("organization_id", organization_id)
          .order("scheduled_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);
        if (customer_id) query = query.eq("customer_id", customer_id);
        if (from_date) query = query.gte("scheduled_at", from_date);
        if (to_date) query = query.lte("scheduled_at", to_date);

        const { data, error } = await query;
        if (error) throw error;
        result = { bookings: data, count: data?.length || 0 };
        break;
      }

      case "get_booking": {
        const { booking_id } = params;
        if (!booking_id) throw new Error("Missing booking_id");

        const { data, error } = await supabase
          .from("bookings")
          .select(`
            *,
            customers(first_name, last_name, email, phone),
            services(name, price, duration),
            staff(name, email, phone)
          `)
          .eq("id", booking_id)
          .eq("organization_id", organization_id)
          .single();

        if (error) throw error;
        result = { booking: data };
        break;
      }

      case "get_staff": {
        const { data, error } = await supabase
          .from("staff")
          .select("id, name, email, phone, is_active, hourly_rate, created_at")
          .eq("organization_id", organization_id)
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        result = { staff: data, count: data?.length || 0 };
        break;
      }

      case "get_services": {
        const { data, error } = await supabase
          .from("services")
          .select("id, name, description, price, duration, is_active, created_at")
          .eq("organization_id", organization_id)
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        result = { services: data, count: data?.length || 0 };
        break;
      }

      case "get_leads": {
        const { limit = 50, status } = params;
        let query = supabase
          .from("leads")
          .select("id, name, email, phone, source, status, notes, service_interest, estimated_value, created_at")
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (status) query = query.eq("status", status);

        const { data, error } = await query;
        if (error) throw error;
        result = { leads: data, count: data?.length || 0 };
        break;
      }

      case "get_settings": {
        const { data, error } = await supabase
          .from("business_settings")
          .select("company_name, company_email, company_phone, company_address, company_city, company_state, company_zip, timezone, currency")
          .eq("organization_id", organization_id)
          .single();

        if (error) throw error;
        result = { settings: data };
        break;
      }

      case "get_invoices": {
        const { limit = 50, status } = params;
        let query = supabase
          .from("invoices")
          .select("id, invoice_number, customer_id, total_amount, subtotal, tax_amount, status, due_date, created_at, customers(first_name, last_name, email)")
          .eq("organization_id", organization_id)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (status) query = query.eq("status", status);

        const { data, error } = await query;
        if (error) throw error;
        result = { invoices: data, count: data?.length || 0 };
        break;
      }

      // ============ WRITE OPERATIONS ============

      case "create_customer": {
        const { first_name, last_name, email, phone, address, city, state, zip_code, notes } = params;
        if (!first_name || !email) throw new Error("Missing first_name or email");

        const { data, error } = await supabase
          .from("customers")
          .insert({
            organization_id,
            first_name: String(first_name).slice(0, 100),
            last_name: last_name ? String(last_name).slice(0, 100) : "",
            email: String(email).slice(0, 255),
            phone: phone ? String(phone).slice(0, 20) : null,
            address: address ? String(address).slice(0, 255) : null,
            city: city ? String(city).slice(0, 100) : null,
            state: state ? String(state).slice(0, 50) : null,
            zip_code: zip_code ? String(zip_code).slice(0, 10) : null,
            notes: notes ? String(notes).slice(0, 2000) : null,
          })
          .select()
          .single();

        if (error) throw error;
        result = { customer: data, message: "Customer created successfully" };
        break;
      }

      case "update_customer": {
        const { customer_id, ...updates } = params;
        if (!customer_id) throw new Error("Missing customer_id");

        const allowedFields = ["first_name", "last_name", "email", "phone", "address", "city", "state", "zip_code", "notes", "customer_status", "marketing_status"];
        const sanitizedUpdates: Record<string, any> = {};
        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            sanitizedUpdates[key] = updates[key] ? String(updates[key]).slice(0, 255) : null;
          }
        }

        const { data, error } = await supabase
          .from("customers")
          .update(sanitizedUpdates)
          .eq("id", customer_id)
          .eq("organization_id", organization_id)
          .select()
          .single();

        if (error) throw error;
        result = { customer: data, message: "Customer updated successfully" };
        break;
      }

      case "create_booking": {
        const { customer_id, service_id, staff_id, scheduled_at, duration, address, notes, total_amount } = params;
        if (!customer_id || !scheduled_at) throw new Error("Missing customer_id or scheduled_at");

        const { data, error } = await supabase
          .from("bookings")
          .insert({
            organization_id,
            customer_id,
            service_id: service_id || null,
            staff_id: staff_id || null,
            scheduled_at,
            duration: duration || 120,
            address: address ? String(address).slice(0, 255) : null,
            notes: notes ? String(notes).slice(0, 2000) : null,
            total_amount: total_amount || 0,
            status: "confirmed",
            payment_status: "pending",
          })
          .select()
          .single();

        if (error) throw error;
        result = { booking: data, message: "Booking created successfully" };
        break;
      }

      case "update_booking": {
        const { booking_id, ...updates } = params;
        if (!booking_id) throw new Error("Missing booking_id");

        const allowedFields = ["scheduled_at", "status", "payment_status", "staff_id", "notes", "total_amount", "duration", "address"];
        const sanitizedUpdates: Record<string, any> = {};
        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            sanitizedUpdates[key] = updates[key];
          }
        }

        const { data, error } = await supabase
          .from("bookings")
          .update(sanitizedUpdates)
          .eq("id", booking_id)
          .eq("organization_id", organization_id)
          .select()
          .single();

        if (error) throw error;
        result = { booking: data, message: "Booking updated successfully" };
        break;
      }

      case "create_lead": {
        const { name, email, phone, source, notes, service_interest } = params;
        if (!name || !email) throw new Error("Missing name or email");

        const { data, error } = await supabase
          .from("leads")
          .insert({
            organization_id,
            name: String(name).slice(0, 200),
            email: String(email).slice(0, 255),
            phone: phone ? String(phone).slice(0, 20) : null,
            source: source ? String(source).slice(0, 50) : "lindy",
            notes: notes ? String(notes).slice(0, 2000) : null,
            service_interest: service_interest ? String(service_interest).slice(0, 100) : null,
            status: "new",
          })
          .select()
          .single();

        if (error) throw error;
        result = { lead: data, message: "Lead created successfully" };
        break;
      }

      case "update_lead": {
        const { lead_id, ...updates } = params;
        if (!lead_id) throw new Error("Missing lead_id");

        const allowedFields = ["name", "email", "phone", "status", "notes", "source", "service_interest"];
        const sanitizedUpdates: Record<string, any> = {};
        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            sanitizedUpdates[key] = updates[key] ? String(updates[key]).slice(0, 255) : null;
          }
        }

        const { data, error } = await supabase
          .from("leads")
          .update(sanitizedUpdates)
          .eq("id", lead_id)
          .eq("organization_id", organization_id)
          .select()
          .single();

        if (error) throw error;
        result = { lead: data, message: "Lead updated successfully" };
        break;
      }

      // ============ SEARCH ============

      case "search": {
        const { query: searchQuery, limit = 20 } = params;
        if (!searchQuery) throw new Error("Missing query");

        const searchTerm = String(searchQuery).slice(0, 100);

        const { data: customers } = await supabase
          .from("customers")
          .select("id, first_name, last_name, email, phone")
          .eq("organization_id", organization_id)
          .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
          .limit(limit);

        const { data: leads } = await supabase
          .from("leads")
          .select("id, name, email, phone, status")
          .eq("organization_id", organization_id)
          .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
          .limit(limit);

        result = { customers: customers || [], leads: leads || [] };
        break;
      }

      // ============ AVAILABLE ACTIONS ============

      case "list_actions": {
        result = {
          read_actions: [
            "get_customers - List customers (params: limit, offset, search)",
            "get_customer - Get single customer (params: customer_id)",
            "get_bookings - List bookings (params: limit, offset, status, customer_id, from_date, to_date)",
            "get_booking - Get single booking (params: booking_id)",
            "get_staff - List active staff",
            "get_services - List active services",
            "get_leads - List leads (params: limit, status)",
            "get_settings - Get business settings",
            "get_invoices - List invoices (params: limit, status)",
            "search - Search customers & leads (params: query, limit)",
          ],
          write_actions: [
            "create_customer - Create customer (params: first_name, last_name, email, phone, address, city, state, zip_code, notes)",
            "update_customer - Update customer (params: customer_id, + fields to update)",
            "create_booking - Create booking (params: customer_id, scheduled_at, service_id, staff_id, duration, address, notes, total_amount)",
            "update_booking - Update booking (params: booking_id, + fields to update)",
            "create_lead - Create lead (params: name, email, phone, source, notes, service_interest)",
            "update_lead - Update lead (params: lead_id, + fields to update)",
          ],
          note: "All requests require api_key and organization_id in the body.",
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Use action 'list_actions' to see available operations.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log(`[lindy-crm-api] Action: ${action}, Org: ${organization_id}`);

    return new Response(
      JSON.stringify({ success: true, action, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[lindy-crm-api] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
