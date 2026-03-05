import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getOrgEmailSettings, formatEmailFrom } from "../_shared/get-org-email-settings.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StaffEntry { name: string; hours: number; pay: number; jobs: number; }

function calcBookingPay(booking: any, staff: any): number {
  if (booking.cleaner_pay_expected != null) return Number(booking.cleaner_pay_expected);
  if (booking.cleaner_actual_payment != null) return Number(booking.cleaner_actual_payment);

  const hoursWorked = booking.cleaner_override_hours || (booking.duration / 60);
  const wageType = booking.cleaner_wage_type || 'hourly';
  const wageRate = booking.cleaner_wage || staff?.base_wage || staff?.hourly_rate || 0;

  if (wageType === 'flat') return Number(wageRate);
  if (wageType === 'percentage') return (Number(booking.total_amount) * Number(wageRate)) / 100;
  return Number(wageRate) * hoursWorked;
}

function buildEmailHtml(
  companyName: string,
  weekStart: Date,
  weekEnd: Date,
  staffPayroll: Record<string, StaffEntry>,
  totalPayroll: number,
  totalJobs: number,
  totalHours: number,
  totalRevenue: number,
  totalProfit: number,
  profitMarginPct: number,
  laborCostPct: number,
): string {
  const isLowMargin = profitMarginPct < 30 && totalRevenue > 0;

  const staffRows = Object.values(staffPayroll)
    .sort((a, b) => b.pay - a.pay)
    .map(s => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${s.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${s.jobs}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${s.hours.toFixed(1)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">$${s.pay.toFixed(2)}</td>
      </tr>
    `).join('');

  const marginColor = isLowMargin ? '#ef4444' : '#10b981';
  const marginWarning = isLowMargin
    ? `<div style="margin-top: 16px; padding: 15px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
        <p style="margin: 0; color: #991b1b; font-size: 14px;">
          ⚠️ <strong>Low Margin Alert:</strong> Your profit margin is ${profitMarginPct.toFixed(1)}% — below the recommended 30%. Consider reviewing labor costs or adjusting pricing.
        </p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0;">📊 Weekly Payroll Summary</h1>
    <p style="margin: 10px 0 0; opacity: 0.9;">${companyName}</p>
    <p style="margin: 5px 0 0; opacity: 0.7; font-size: 14px;">${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}</p>
  </div>
  
  <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px;">
    <!-- Payroll Stats -->
    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 22px; font-weight: bold; color: #10b981;">$${totalPayroll.toFixed(2)}</div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Total Payroll</div>
      </div>
      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 22px; font-weight: bold; color: #3b82f6;">${totalJobs}</div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Jobs Completed</div>
      </div>
      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 22px; font-weight: bold; color: #8b5cf6;">${totalHours.toFixed(1)}</div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Total Hours</div>
      </div>
    </div>

    <!-- Financial Intelligence -->
    <h3 style="margin: 20px 0 10px; color: #374151;">💰 Financial Overview</h3>
    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: #3b82f6;">$${totalRevenue.toFixed(2)}</div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Revenue</div>
      </div>
      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: ${totalProfit >= 0 ? '#10b981' : '#ef4444'};">$${totalProfit.toFixed(2)}</div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Profit</div>
      </div>
      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: ${marginColor};">${profitMarginPct.toFixed(1)}%</div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Margin</div>
      </div>
      <div style="flex: 1; background: white; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: ${laborCostPct > 70 ? '#ef4444' : '#6366f1'};">${laborCostPct.toFixed(1)}%</div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Labor Cost</div>
      </div>
    </div>

    ${marginWarning}

    <h3 style="margin: 20px 0 10px; color: #374151;">👥 Staff Breakdown</h3>
    <table style="width: 100%; background: white; border-radius: 8px; border-collapse: collapse;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="padding: 12px; text-align: left; font-weight: 600;">Staff</th>
          <th style="padding: 12px; text-align: center; font-weight: 600;">Jobs</th>
          <th style="padding: 12px; text-align: center; font-weight: 600;">Hours</th>
          <th style="padding: 12px; text-align: right; font-weight: 600;">Pay</th>
        </tr>
      </thead>
      <tbody>
        ${staffRows}
      </tbody>
    </table>

    <div style="margin-top: 20px; padding: 15px; background: #dbeafe; border-radius: 8px;">
      <p style="margin: 0; color: #1e40af; font-size: 14px;">
        ✅ <strong>Ready for approval.</strong> Log in to your dashboard to review and process payments.
      </p>
    </div>
  </div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: orgs } = await supabase.from('organizations').select('id, name, owner_id');

    const summaries = [];

    for (const org of orgs || []) {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const weekEnd = now;

      // Get completed bookings for the week
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`*, staff:staff(id, name, base_wage, hourly_rate)`)
        .eq('organization_id', org.id)
        .eq('status', 'completed')
        .gte('scheduled_at', weekStart.toISOString())
        .lte('scheduled_at', weekEnd.toISOString());

      if (!bookings || bookings.length === 0) {
        console.log(`[weekly-payroll-summary] No bookings for org ${org.id}`);
        continue;
      }

      // Calculate payroll per staff + total revenue
      const staffPayroll: Record<string, StaffEntry> = {};
      let totalRevenue = 0;

      for (const booking of bookings) {
        totalRevenue += Number(booking.total_amount) || 0;

        if (!booking.staff_id || !booking.staff) continue;
        const staff = booking.staff as any;
        const staffId = staff.id;

        if (!staffPayroll[staffId]) {
          staffPayroll[staffId] = { name: staff.name, hours: 0, pay: 0, jobs: 0 };
        }

        const hoursWorked = booking.cleaner_override_hours || (booking.duration / 60);
        const pay = calcBookingPay(booking, staff);

        staffPayroll[staffId].hours += hoursWorked;
        staffPayroll[staffId].pay += pay;
        staffPayroll[staffId].jobs += 1;
      }

      const totalPayroll = Object.values(staffPayroll).reduce((sum, s) => sum + s.pay, 0);
      const totalHours = Object.values(staffPayroll).reduce((sum, s) => sum + s.hours, 0);
      const totalJobs = Object.values(staffPayroll).reduce((sum, s) => sum + s.jobs, 0);
      const totalProfit = totalRevenue - totalPayroll;
      const profitMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      const laborCostPct = totalRevenue > 0 ? (totalPayroll / totalRevenue) * 100 : 0;

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

      if (!adminEmail) {
        console.log(`[weekly-payroll-summary] No admin email for org ${org.id}`);
        continue;
      }

      const summaryHtml = buildEmailHtml(
        companyName, weekStart, weekEnd, staffPayroll,
        totalPayroll, totalJobs, totalHours,
        totalRevenue, totalProfit, profitMarginPct, laborCostPct,
      );

      // Send email using org email settings, falling back to global RESEND_API_KEY
      const orgEmail = await getOrgEmailSettings(org.id);
      const resendKey = orgEmail.settings?.resend_api_key || Deno.env.get("RESEND_API_KEY");
      const fromHeader = orgEmail.success
        ? formatEmailFrom(orgEmail.settings!)
        : `${companyName} <noreply@resend.dev>`;

      if (resendKey) {
        try {
          const resend = new Resend(resendKey);
          await resend.emails.send({
            from: fromHeader,
            to: [adminEmail],
            subject: `📊 Weekly Payroll - $${totalPayroll.toFixed(2)} | Profit $${totalProfit.toFixed(2)} (${profitMarginPct.toFixed(0)}% margin)`,
            html: summaryHtml,
          });
          console.log(`[weekly-payroll-summary] Email sent to ${adminEmail}`);
        } catch (emailError) {
          console.error(`[weekly-payroll-summary] Email error:`, emailError);
        }
      }

      summaries.push({
        organizationId: org.id,
        organizationName: companyName,
        totalPayroll, totalJobs, totalHours,
        totalRevenue, totalProfit, profitMarginPct, laborCostPct,
        staffCount: Object.keys(staffPayroll).length,
        adminEmail,
      });
    }

    return new Response(
      JSON.stringify({ success: true, summaries }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[weekly-payroll-summary] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
