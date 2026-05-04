import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireCronSecret } from "../_shared/requireCronSecret.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getOrgEmailSettings, formatEmailFrom } from "../_shared/get-org-email-settings.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // Cron auth gate (allows manual invocation only with x-cron-secret)
  const cronGate = requireCronSecret(req);
  if (cronGate) return cronGate;


  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    // STRICT ISOLATION: Require platform-level Resend key
    if (!RESEND_API_KEY) {
      console.error("[weekly-business-report] Missing RESEND_API_KEY");
      throw new Error("Email service not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all organizations
    const { data: orgs } = await supabase.from('organizations').select('id, name, owner_id');

    const reports = [];

    for (const org of orgs || []) {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const previousWeekStart = new Date(weekStart);
      previousWeekStart.setDate(weekStart.getDate() - 7);

      // This week's data
      const { data: thisWeekBookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('organization_id', org.id)
        .gte('scheduled_at', weekStart.toISOString())
        .lte('scheduled_at', now.toISOString());

      // Previous week's data (for comparison)
      const { data: prevWeekBookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('organization_id', org.id)
        .gte('scheduled_at', previousWeekStart.toISOString())
        .lt('scheduled_at', weekStart.toISOString());

      // Calculate metrics
      const thisWeekRevenue = (thisWeekBookings || [])
        .filter(b => b.status === 'completed' && b.payment_status === 'paid')
        .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

      const prevWeekRevenue = (prevWeekBookings || [])
        .filter(b => b.status === 'completed' && b.payment_status === 'paid')
        .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

      const thisWeekCompleted = (thisWeekBookings || []).filter(b => b.status === 'completed').length;
      const prevWeekCompleted = (prevWeekBookings || []).filter(b => b.status === 'completed').length;

      const thisWeekNewBookings = (thisWeekBookings || []).length;
      const prevWeekNewBookings = (prevWeekBookings || []).length;

      const thisWeekCancelled = (thisWeekBookings || []).filter(b => b.status === 'cancelled').length;

      // Get new customers this week
      const { count: newCustomers } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .gte('created_at', weekStart.toISOString());

      // Get new leads this week
      const { count: newLeads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .gte('created_at', weekStart.toISOString());

      // Get reviews this week
      const { data: reviews } = await supabase
        .from('review_requests')
        .select('rating')
        .not('rating', 'is', null)
        .gte('responded_at', weekStart.toISOString());

      const avgRating = reviews && reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null;

      // Staff performance
      const { data: staffBookings } = await supabase
        .from('bookings')
        .select('staff_id, staff:staff(name)')
        .eq('organization_id', org.id)
        .eq('status', 'completed')
        .gte('scheduled_at', weekStart.toISOString());

      const staffPerformance: Record<string, { name: string; jobs: number }> = {};
      for (const b of staffBookings || []) {
        if (b.staff_id && b.staff) {
          const staffId = b.staff_id;
          const staffName = (b.staff as any).name || 'Unknown';
          if (!staffPerformance[staffId]) {
            staffPerformance[staffId] = { name: staffName, jobs: 0 };
          }
          staffPerformance[staffId].jobs += 1;
        }
      }

      const topPerformer = Object.values(staffPerformance).sort((a, b) => b.jobs - a.jobs)[0];

      // Calculate percentage changes
      const revenueChange = prevWeekRevenue > 0 
        ? ((thisWeekRevenue - prevWeekRevenue) / prevWeekRevenue * 100).toFixed(1)
        : 'N/A';
      const bookingsChange = prevWeekCompleted > 0
        ? ((thisWeekCompleted - prevWeekCompleted) / prevWeekCompleted * 100).toFixed(1)
        : 'N/A';

      // Get admin email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', org.owner_id)
        .single();

      const { data: settings } = await supabase
        .from('business_settings')
        .select('company_name, company_email')
        .eq('organization_id', org.id)
        .maybeSingle();

      const adminEmail = profile?.email || settings?.company_email;
      const companyName = settings?.company_name || org.name;

      if (!adminEmail) continue;

      // Generate AI insights if LOVABLE_API_KEY is available
      let aiInsights = '';
      if (LOVABLE_API_KEY) {
        try {
          const prompt = `You are a business analyst for a cleaning company. Based on this week's metrics, provide 2-3 brief, actionable insights (max 50 words each):

Revenue: $${thisWeekRevenue} (${revenueChange}% vs last week)
Jobs Completed: ${thisWeekCompleted} (${bookingsChange}% vs last week)
New Bookings: ${thisWeekNewBookings}
Cancellations: ${thisWeekCancelled}
New Customers: ${newCustomers || 0}
New Leads: ${newLeads || 0}
Average Rating: ${avgRating ? avgRating.toFixed(1) : 'No reviews'}
Top Performer: ${topPerformer ? `${topPerformer.name} (${topPerformer.jobs} jobs)` : 'N/A'}

Give practical advice for a cleaning business owner.`;

          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-3-flash-preview',
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            aiInsights = aiData.choices?.[0]?.message?.content || '';
          }
        } catch (aiError) {
          console.error('[weekly-business-report] AI error:', aiError);
        }
      }

      // Build email HTML
      const reportHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0;">📈 Weekly Business Report</h1>
            <p style="margin: 10px 0 0; opacity: 0.9;">${companyName}</p>
            <p style="margin: 5px 0 0; opacity: 0.7; font-size: 14px;">${weekStart.toLocaleDateString()} - ${now.toLocaleDateString()}</p>
          </div>
          
          <div style="background: white; padding: 25px; border-radius: 0 0 12px 12px;">
            <h2 style="color: #374151; margin-top: 0;">Key Metrics</h2>
            
            <table style="width: 100%; margin-bottom: 20px;">
              <tr>
                <td style="padding: 15px; background: #f0fdf4; border-radius: 8px; text-align: center; width: 50%;">
                  <div style="font-size: 28px; font-weight: bold; color: #10b981;">$${thisWeekRevenue.toFixed(2)}</div>
                  <div style="font-size: 12px; color: #6b7280;">Revenue ${revenueChange !== 'N/A' ? `(${Number(revenueChange) >= 0 ? '+' : ''}${revenueChange}%)` : ''}</div>
                </td>
                <td style="width: 10px;"></td>
                <td style="padding: 15px; background: #eff6ff; border-radius: 8px; text-align: center; width: 50%;">
                  <div style="font-size: 28px; font-weight: bold; color: #3b82f6;">${thisWeekCompleted}</div>
                  <div style="font-size: 12px; color: #6b7280;">Jobs Completed ${bookingsChange !== 'N/A' ? `(${Number(bookingsChange) >= 0 ? '+' : ''}${bookingsChange}%)` : ''}</div>
                </td>
              </tr>
            </table>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
              <div style="padding: 12px; background: #f9fafb; border-radius: 8px; text-align: center;">
                <div style="font-size: 20px; font-weight: bold;">${thisWeekNewBookings}</div>
                <div style="font-size: 11px; color: #6b7280;">New Bookings</div>
              </div>
              <div style="padding: 12px; background: #f9fafb; border-radius: 8px; text-align: center;">
                <div style="font-size: 20px; font-weight: bold;">${newCustomers || 0}</div>
                <div style="font-size: 11px; color: #6b7280;">New Customers</div>
              </div>
              <div style="padding: 12px; background: #f9fafb; border-radius: 8px; text-align: center;">
                <div style="font-size: 20px; font-weight: bold;">${newLeads || 0}</div>
                <div style="font-size: 11px; color: #6b7280;">New Leads</div>
              </div>
            </div>

            ${avgRating ? `
            <div style="padding: 15px; background: #fef3c7; border-radius: 8px; margin-bottom: 20px;">
              <div style="font-size: 14px; color: #92400e;">⭐ Average Rating: <strong>${avgRating.toFixed(1)}/5</strong> (${reviews?.length} reviews)</div>
            </div>
            ` : ''}

            ${topPerformer ? `
            <div style="padding: 15px; background: #dbeafe; border-radius: 8px; margin-bottom: 20px;">
              <div style="font-size: 14px; color: #1e40af;">🏆 Top Performer: <strong>${topPerformer.name}</strong> (${topPerformer.jobs} jobs completed)</div>
            </div>
            ` : ''}

            ${thisWeekCancelled > 0 ? `
            <div style="padding: 15px; background: #fee2e2; border-radius: 8px; margin-bottom: 20px;">
              <div style="font-size: 14px; color: #dc2626;">⚠️ ${thisWeekCancelled} cancellation(s) this week</div>
            </div>
            ` : ''}

            ${aiInsights ? `
            <h3 style="color: #374151; margin-top: 20px;">🤖 AI Insights</h3>
            <div style="padding: 15px; background: #f3e8ff; border-radius: 8px; color: #6b21a8; font-size: 14px; line-height: 1.6;">
              ${aiInsights.replace(/\n/g, '<br>')}
            </div>
            ` : ''}
          </div>
        </body>
        </html>
      `;

      // Send email using organization-specific settings
      const emailSettingsResult = await getOrgEmailSettings(org.id);
      
      if (emailSettingsResult.success && emailSettingsResult.settings && RESEND_API_KEY) {
        try {
          const resend = new Resend(RESEND_API_KEY);
          const senderFrom = formatEmailFrom(emailSettingsResult.settings);
          
          await resend.emails.send({
            from: senderFrom,
            to: [adminEmail],
            subject: `📈 Weekly Report: $${thisWeekRevenue.toFixed(0)} revenue, ${thisWeekCompleted} jobs`,
            html: reportHtml,
          });
          console.log(`[weekly-business-report] Email sent to ${adminEmail} for org: ${org.id}`);
        } catch (emailError) {
          console.error(`[weekly-business-report] Email error for org ${org.id}:`, emailError);
        }
      } else {
        console.log(`[weekly-business-report] Skipping email for org ${org.id} - email settings not configured`);
      }

      reports.push({
        organizationId: org.id,
        revenue: thisWeekRevenue,
        jobsCompleted: thisWeekCompleted,
        newCustomers: newCustomers || 0,
      });
    }

    return new Response(
      JSON.stringify({ success: true, reports }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[weekly-business-report] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
