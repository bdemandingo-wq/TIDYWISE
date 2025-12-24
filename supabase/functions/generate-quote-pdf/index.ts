import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { quoteId } = await req.json();

    // Get quote details with related data
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(`
        *,
        customer:customer_id (
          first_name,
          last_name,
          email,
          phone,
          address,
          city,
          state,
          zip_code
        ),
        lead:lead_id (
          name,
          email,
          phone,
          address,
          city,
          state,
          zip_code
        ),
        service:service_id (
          name,
          description,
          price,
          duration
        )
      `)
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      throw new Error("Quote not found");
    }

    // Get business settings
    const { data: settings } = await supabase
      .from("business_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const companyName = settings?.company_name || "TidyWise";
    const companyAddress = settings?.company_address || "";
    const companyCity = settings?.company_city || "";
    const companyState = settings?.company_state || "";
    const companyZip = settings?.company_zip || "";
    const companyPhone = settings?.company_phone || "";
    const companyEmail = settings?.company_email || "";

    // Determine customer info from quote, customer, or lead
    const customerInfo = quote.customer || quote.lead || {
      first_name: quote.lead?.name?.split(' ')[0] || 'Valued',
      last_name: quote.lead?.name?.split(' ').slice(1).join(' ') || 'Customer',
      email: '',
      phone: '',
      address: quote.address,
      city: quote.city,
      state: quote.state,
      zip_code: quote.zip_code
    };

    const customerName = quote.customer 
      ? `${quote.customer.first_name} ${quote.customer.last_name}`
      : quote.lead?.name || 'Valued Customer';

    // Parse extras
    let extras: any[] = [];
    try {
      extras = typeof quote.extras === 'string' ? JSON.parse(quote.extras) : (quote.extras || []);
    } catch (e) {
      extras = [];
    }

    // Format date
    const quoteDate = new Date(quote.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const validUntil = quote.valid_until 
      ? new Date(quote.valid_until).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

    // Generate HTML for PDF
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; line-height: 1.5; }
          .container { max-width: 800px; margin: 0 auto; padding: 40px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #3b82f6; padding-bottom: 20px; }
          .company-info h1 { color: #3b82f6; font-size: 28px; margin-bottom: 5px; }
          .company-info p { color: #6b7280; font-size: 12px; }
          .quote-info { text-align: right; }
          .quote-info h2 { font-size: 24px; color: #1f2937; }
          .quote-number { font-size: 14px; color: #6b7280; }
          .addresses { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .address-block { width: 45%; }
          .address-block h3 { font-size: 12px; text-transform: uppercase; color: #6b7280; margin-bottom: 10px; letter-spacing: 1px; }
          .address-block p { font-size: 14px; margin-bottom: 3px; }
          .details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .details-table th { background: #f3f4f6; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
          .details-table td { padding: 15px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
          .details-table .amount { text-align: right; }
          .totals { margin-left: auto; width: 300px; }
          .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
          .totals-row.total { border-top: 2px solid #1f2937; padding-top: 15px; margin-top: 10px; font-size: 18px; font-weight: bold; }
          .totals-row .label { color: #6b7280; }
          .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
          .footer h4 { font-size: 14px; margin-bottom: 10px; color: #1f2937; }
          .footer p { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
          .valid-until { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
          .valid-until p { font-size: 14px; color: #92400e; margin: 0; }
          .status-badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
          .status-draft { background: #e5e7eb; color: #4b5563; }
          .status-sent { background: #dbeafe; color: #1d4ed8; }
          .status-accepted { background: #d1fae5; color: #059669; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="company-info">
              <h1>${companyName}</h1>
              <p>${companyAddress}${companyCity ? `, ${companyCity}` : ''}${companyState ? `, ${companyState}` : ''} ${companyZip}</p>
              <p>${companyPhone} | ${companyEmail}</p>
            </div>
            <div class="quote-info">
              <h2>QUOTE</h2>
              <p class="quote-number">#${quote.quote_number}</p>
              <p style="margin-top: 10px; font-size: 14px;">Date: ${quoteDate}</p>
              <span class="status-badge status-${quote.status}">${quote.status}</span>
            </div>
          </div>

          <div class="valid-until">
            <p><strong>Valid Until:</strong> ${validUntil}</p>
          </div>

          <div class="addresses">
            <div class="address-block">
              <h3>Quote For</h3>
              <p><strong>${customerName}</strong></p>
              <p>${customerInfo.email || ''}</p>
              <p>${customerInfo.phone || ''}</p>
            </div>
            <div class="address-block">
              <h3>Service Address</h3>
              <p>${quote.address || customerInfo.address || ''}</p>
              <p>${quote.city || customerInfo.city || ''}${quote.state ? `, ${quote.state || customerInfo.state}` : ''} ${quote.zip_code || customerInfo.zip_code || ''}</p>
              ${quote.bedrooms ? `<p>Bedrooms: ${quote.bedrooms} | Bathrooms: ${quote.bathrooms || 'N/A'}</p>` : ''}
              ${quote.square_footage ? `<p>Square Footage: ${quote.square_footage}</p>` : ''}
            </div>
          </div>

          <table class="details-table">
            <thead>
              <tr>
                <th style="width: 50%;">Description</th>
                <th style="width: 25%;">Details</th>
                <th style="width: 25%;" class="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>${quote.service?.name || 'Cleaning Service'}</strong>
                  ${quote.service?.description ? `<br><span style="color: #6b7280; font-size: 12px;">${quote.service.description}</span>` : ''}
                </td>
                <td>${quote.service?.duration ? `${quote.service.duration} min` : '-'}</td>
                <td class="amount">$${Number(quote.service?.price || quote.subtotal || 0).toFixed(2)}</td>
              </tr>
              ${extras.map((extra: any) => `
                <tr>
                  <td>${extra.name || extra}</td>
                  <td>Add-on</td>
                  <td class="amount">$${Number(extra.price || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-row">
              <span class="label">Subtotal</span>
              <span>$${Number(quote.subtotal || 0).toFixed(2)}</span>
            </div>
            ${quote.discount_percent > 0 ? `
              <div class="totals-row">
                <span class="label">Discount (${quote.discount_percent}%)</span>
                <span>-$${Number(quote.discount_amount || 0).toFixed(2)}</span>
              </div>
            ` : ''}
            ${quote.discount_amount > 0 && !quote.discount_percent ? `
              <div class="totals-row">
                <span class="label">Discount</span>
                <span>-$${Number(quote.discount_amount).toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="totals-row total">
              <span>Total</span>
              <span>$${Number(quote.total_amount || 0).toFixed(2)}</span>
            </div>
          </div>

          ${quote.notes ? `
            <div class="footer">
              <h4>Notes</h4>
              <p>${quote.notes}</p>
            </div>
          ` : ''}

          <div class="footer">
            <h4>Terms & Conditions</h4>
            <p>• This quote is valid for 30 days from the date of issue.</p>
            <p>• Payment is due upon completion of service unless otherwise arranged.</p>
            <p>• Cancellations must be made at least 24 hours in advance.</p>
            <p>• Prices are subject to change based on actual property conditions.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Return HTML for now - can be converted to PDF using a service like html2pdf
    return new Response(html, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/html",
      },
    });
  } catch (error: unknown) {
    console.error("Error in generate-quote-pdf:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
