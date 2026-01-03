import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReviewRequestSmsPayload {
  bookingId: string;
  customerId: string;
  customerPhone: string;
  customerName: string;
  serviceName: string;
  organizationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: ReviewRequestSmsPayload = await req.json();
    const { bookingId, customerId, customerPhone, customerName, serviceName, organizationId } = payload;

    console.log("Processing review request SMS:", { bookingId, customerName, organizationId });

    if (!customerPhone || !bookingId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!organizationId) {
      console.error("Missing organizationId - cannot send review request without organization context");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Fetch SMS settings for the organization
    const { data: smsSettings, error: smsError } = await supabase
      .from('organization_sms_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (smsError) {
      console.error("Error fetching SMS settings:", smsError);
      throw new Error("Failed to fetch SMS settings");
    }

    if (!smsSettings || !smsSettings.sms_enabled) {
      console.log("SMS is not enabled for this organization");
      return new Response(JSON.stringify({ 
        error: "SMS notifications are not enabled. Please configure SMS settings first." 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      console.log("OpenPhone credentials not configured");
      return new Response(JSON.stringify({ 
        error: "OpenPhone credentials are not configured. Please add your API key and phone number ID." 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    // Get business settings for company name and review template
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('company_name, google_review_url, review_sms_template')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const companyName = businessSettings?.company_name || 'Our Company';
    const googleReviewUrl = businessSettings?.google_review_url || '';
    
    // Generate unique token for this review request
    const token = crypto.randomUUID();
    
    // Get the review page URL - use environment variable or fallback
    const projectUrl = Deno.env.get("PROJECT_URL") || "https://slwfkaqczvwvvvavkgpr.lovable.app";
    const reviewPageUrl = `${projectUrl}/review/${token}`;

    // Get staff_id and staff name from booking to associate review with cleaner
    const { data: bookingData } = await supabase
      .from("bookings")
      .select("staff_id, staff:staff_id(name)")
      .eq("id", bookingId)
      .single();

    const cleanerName = (bookingData?.staff as any)?.name || 'your cleaner';

    // Create review request record
    const { error: insertError } = await supabase
      .from("review_requests")
      .insert({
        booking_id: bookingId,
        customer_id: customerId,
        staff_id: bookingData?.staff_id || null,
        status: "sent",
        sent_at: new Date().toISOString(),
        review_link_token: token,
        google_review_url: googleReviewUrl,
      });

    if (insertError) {
      console.error("Failed to create review request:", insertError);
      throw new Error("Failed to create review request record");
    }

    // Build the SMS message from template or use default
    const defaultTemplate = `Hi {customer_name}, thank you for choosing {company_name}! We'd love to hear about your experience. Please take a moment to leave us a review: {review_link}`;
    const template = businessSettings?.review_sms_template || defaultTemplate;
    
    const message = template
      .replace(/{customer_name}/g, customerName)
      .replace(/{company_name}/g, companyName)
      .replace(/{cleaner_name}/g, cleanerName)
      .replace(/{service_name}/g, serviceName)
      .replace(/{review_link}/g, reviewPageUrl);

    // Format phone number
    let formattedPhone = customerPhone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = `+1${formattedPhone}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    // Extract phone number ID from full URL if provided
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    if (phoneNumberId.includes('/')) {
      const parts = phoneNumberId.split('/');
      phoneNumberId = parts[parts.length - 1];
    }

    console.log("Sending review request SMS to:", formattedPhone);

    // OpenPhone expects the raw API key in the Authorization header
    const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');

    // Send SMS via OpenPhone API
    const openPhoneResponse = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message,
        from: phoneNumberId,
        to: [formattedPhone],
      }),
    });

    if (!openPhoneResponse.ok) {
      const errorText = await openPhoneResponse.text();
      console.error('OpenPhone API error:', openPhoneResponse.status, errorText);
      
      // Handle billing/payment issues gracefully
      if (openPhoneResponse.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'SMS service requires payment. Please check your OpenPhone account billing.', 
            errorCode: 'BILLING_REQUIRED' 
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      // Handle auth issues
      if (openPhoneResponse.status === 401) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid OpenPhone API key. Please update your SMS settings.', 
            errorCode: 'AUTH_FAILED' 
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'SMS delivery failed. Please try again later.' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const responseData = await openPhoneResponse.json();
    console.log("Review request SMS sent successfully:", responseData);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-review-request-sms function:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
