import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeadData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  source: string;
  status: string;
  created_at: string;
  service_interest: string | null;
  message: string | null;
  notes: string | null;
}

interface CustomerData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
}

interface BookingData {
  id: string;
  customer_id: string;
  scheduled_at: string;
  total_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { organization_id, calculation_type = 'all' } = await req.json();

    if (!organization_id) {
      throw new Error("organization_id is required");
    }

    console.log(`[calculate-ai-intelligence] Starting ${calculation_type} calculation for org: ${organization_id}`);

    // Log the calculation job
    const { data: logEntry } = await supabase
      .from('ai_calculation_log')
      .insert({
        organization_id,
        calculation_type,
        status: 'processing',
      })
      .select()
      .single();

    let recordsProcessed = 0;

    // 1. LEAD SCORING
    if (calculation_type === 'all' || calculation_type === 'lead_scoring') {
      const { data: leads } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organization_id)
        .neq('status', 'converted')
        .neq('status', 'lost');

      const { data: historicalLeads } = await supabase
        .from('leads')
        .select('source, status, created_at')
        .eq('organization_id', organization_id);

      // Calculate source conversion rates
      const sourceStats: Record<string, { total: number; converted: number }> = {};
      historicalLeads?.forEach(lead => {
        if (!sourceStats[lead.source]) {
          sourceStats[lead.source] = { total: 0, converted: 0 };
        }
        sourceStats[lead.source].total++;
        if (lead.status === 'converted') {
          sourceStats[lead.source].converted++;
        }
      });

      for (const lead of leads || []) {
        const score = calculateLeadScore(lead, sourceStats);
        
        await supabase
          .from('lead_intelligence')
          .upsert({
            organization_id,
            lead_id: lead.id,
            conversion_score: score.conversionScore,
            urgency_score: score.urgencyScore,
            engagement_score: score.engagementScore,
            is_hot_lead: score.conversionScore >= 70,
            predicted_conversion_rate: score.predictedRate,
            recommended_followup_time: score.recommendedFollowup,
            preferred_contact_method: score.preferredMethod,
            ai_insights: score.insights,
            last_calculated_at: new Date().toISOString(),
          }, {
            onConflict: 'lead_id',
          });
        
        recordsProcessed++;
      }
    }

    // 2. CUSTOMER INTELLIGENCE & CHURN DETECTION
    if (calculation_type === 'all' || calculation_type === 'churn_detection') {
      const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', organization_id);

      const { data: bookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('organization_id', organization_id)
        .order('scheduled_at', { ascending: false });

      const { data: services } = await supabase
        .from('services')
        .select('id, name, base_price')
        .eq('organization_id', organization_id)
        .eq('is_active', true);

      for (const customer of customers || []) {
        const customerBookings = bookings?.filter(b => b.customer_id === customer.id) || [];
        const intelligence = calculateCustomerIntelligence(customer, customerBookings, services || []);
        
        await supabase
          .from('customer_intelligence')
          .upsert({
            organization_id,
            customer_id: customer.id,
            predicted_lifetime_value: intelligence.predictedLTV,
            next_booking_probability: intelligence.nextBookingProb,
            predicted_next_booking_date: intelligence.predictedNextDate,
            churn_risk_score: intelligence.churnScore,
            churn_risk_level: intelligence.churnLevel,
            days_since_last_contact: intelligence.daysSinceContact,
            sentiment_score: intelligence.sentimentScore,
            sentiment_trend: intelligence.sentimentTrend,
            upsell_potential_score: intelligence.upsellScore,
            recommended_services: intelligence.recommendedServices,
            is_vip: intelligence.isVip,
            vip_reason: intelligence.vipReason,
            ai_insights: intelligence.insights,
            last_calculated_at: new Date().toISOString(),
          }, {
            onConflict: 'customer_id',
          });
        
        recordsProcessed++;
      }
    }

    // 3. BUSINESS INTELLIGENCE
    if (calculation_type === 'all' || calculation_type === 'business_intelligence') {
      const { data: leads } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organization_id);

      const { data: bookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('organization_id', organization_id);

      const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', organization_id);

      const businessInsights = calculateBusinessIntelligence(leads || [], bookings || [], customers || []);

      // Generate AI insights if available
      let aiGeneratedInsights: string[] = [];
      if (LOVABLE_API_KEY) {
        try {
          aiGeneratedInsights = await generateAIInsights(LOVABLE_API_KEY, businessInsights);
        } catch (e) {
          console.error('[calculate-ai-intelligence] AI insights error:', e);
        }
      }

      await supabase
        .from('business_intelligence')
        .upsert({
          organization_id,
          predicted_monthly_revenue: businessInsights.predictedRevenue,
          revenue_goal_probability: businessInsights.goalProbability,
          bookings_needed_for_goal: businessInsights.bookingsNeeded,
          avg_lead_conversion_rate: businessInsights.conversionRate,
          best_converting_source: businessInsights.bestSource,
          best_converting_day: businessInsights.bestDay,
          best_converting_time: businessInsights.bestTime,
          optimal_response_window_minutes: businessInsights.optimalWindow,
          optimal_price_range_low: businessInsights.priceRangeLow,
          optimal_price_range_high: businessInsights.priceRangeHigh,
          price_win_rate: businessInsights.priceWinRate,
          top_insights: aiGeneratedInsights.length > 0 ? aiGeneratedInsights : businessInsights.topInsights,
          recommendations: businessInsights.recommendations,
          seasonal_factors: businessInsights.seasonalFactors,
          peak_demand_periods: businessInsights.peakPeriods,
          last_calculated_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id',
        });
      
      recordsProcessed++;
    }

    // Update log entry
    if (logEntry) {
      await supabase
        .from('ai_calculation_log')
        .update({
          status: 'completed',
          records_processed: recordsProcessed,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);
    }

    console.log(`[calculate-ai-intelligence] Completed. Processed ${recordsProcessed} records`);

    return new Response(
      JSON.stringify({ success: true, records_processed: recordsProcessed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[calculate-ai-intelligence] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

function calculateLeadScore(
  lead: LeadData,
  sourceStats: Record<string, { total: number; converted: number }>
) {
  const now = new Date();
  const createdAt = new Date(lead.created_at);
  const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  const daysSinceCreated = hoursSinceCreated / 24;

  // Base conversion score
  let conversionScore = 50;

  // Source-based adjustment
  const sourceConversionRate = sourceStats[lead.source]?.total > 0
    ? (sourceStats[lead.source].converted / sourceStats[lead.source].total) * 100
    : 30;
  conversionScore += (sourceConversionRate - 30) * 0.5;

  // Recency bonus (newer leads = higher score)
  if (hoursSinceCreated < 24) conversionScore += 20;
  else if (hoursSinceCreated < 48) conversionScore += 15;
  else if (hoursSinceCreated < 72) conversionScore += 10;
  else if (daysSinceCreated > 14) conversionScore -= 15;

  // Status-based adjustment
  if (lead.status === 'quoted') conversionScore += 15;
  if (lead.status === 'follow_up') conversionScore += 10;
  if (lead.status === 'commercial') conversionScore += 20;

  // Has phone = more engaged
  if (lead.phone) conversionScore += 5;

  // Has detailed message = more serious
  if (lead.message && lead.message.length > 50) conversionScore += 10;
  if (lead.service_interest) conversionScore += 5;

  // Urgency score based on message content
  let urgencyScore = 30;
  const messageText = `${lead.message || ''} ${lead.notes || ''}`.toLowerCase();
  if (messageText.includes('asap') || messageText.includes('urgent') || messageText.includes('today')) {
    urgencyScore = 90;
  } else if (messageText.includes('soon') || messageText.includes('this week')) {
    urgencyScore = 70;
  } else if (messageText.includes('quote') || messageText.includes('price')) {
    urgencyScore = 60;
  }

  // Engagement score
  let engagementScore = 40;
  if (lead.phone && lead.message) engagementScore = 80;
  else if (lead.phone || lead.message) engagementScore = 60;
  if (lead.notes) engagementScore += 10;

  // Clamp scores
  conversionScore = Math.max(0, Math.min(100, Math.round(conversionScore)));
  urgencyScore = Math.max(0, Math.min(100, urgencyScore));
  engagementScore = Math.max(0, Math.min(100, engagementScore));

  // Predicted conversion rate
  const predictedRate = Math.round(conversionScore * 0.8);

  // Recommended follow-up time
  let recommendedFollowup = new Date();
  if (urgencyScore >= 70) {
    recommendedFollowup.setHours(recommendedFollowup.getHours() + 1);
  } else if (conversionScore >= 60) {
    recommendedFollowup.setHours(recommendedFollowup.getHours() + 4);
  } else {
    recommendedFollowup.setDate(recommendedFollowup.getDate() + 1);
  }

  // Preferred contact method
  let preferredMethod = 'email';
  if (lead.phone && urgencyScore >= 60) preferredMethod = 'call';
  else if (lead.phone) preferredMethod = 'sms';

  // Generate insights
  const insights: Record<string, unknown> = {
    score_breakdown: {
      source_impact: sourceConversionRate > 40 ? 'positive' : 'neutral',
      recency_impact: hoursSinceCreated < 48 ? 'positive' : hoursSinceCreated > 168 ? 'negative' : 'neutral',
      engagement_level: engagementScore >= 70 ? 'high' : engagementScore >= 40 ? 'medium' : 'low',
    },
    action_items: [],
  };

  if (conversionScore >= 70) {
    (insights.action_items as string[]).push('Hot lead - prioritize immediate contact');
  }
  if (urgencyScore >= 70) {
    (insights.action_items as string[]).push('Customer expressed urgency - respond ASAP');
  }
  if (daysSinceCreated > 7 && lead.status === 'new') {
    (insights.action_items as string[]).push('Lead going stale - follow up today');
  }

  return {
    conversionScore,
    urgencyScore,
    engagementScore,
    predictedRate,
    recommendedFollowup: recommendedFollowup.toISOString(),
    preferredMethod,
    insights,
  };
}

function calculateCustomerIntelligence(
  customer: CustomerData,
  bookings: BookingData[],
  services: { id: string; name: string; base_price: number | null }[]
) {
  const now = new Date();
  const completedBookings = bookings.filter(b => b.status === 'completed');
  const totalSpent = completedBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const bookingCount = completedBookings.length;

  // Days since last contact
  const lastBookingDate = completedBookings.length > 0 
    ? new Date(completedBookings[0].scheduled_at) 
    : new Date(customer.created_at);
  const daysSinceContact = Math.floor((now.getTime() - lastBookingDate.getTime()) / (1000 * 60 * 60 * 24));

  // Predicted LTV (based on avg booking value * predicted future bookings)
  const avgBookingValue = bookingCount > 0 ? totalSpent / bookingCount : 150;
  
  // Calculate booking frequency (bookings per month)
  const customerAgeDays = Math.max(30, (now.getTime() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const bookingsPerMonth = (bookingCount / customerAgeDays) * 30;
  
  // Predict 24 months of future bookings
  const predictedLTV = Math.round(totalSpent + (avgBookingValue * bookingsPerMonth * 24));

  // Next booking probability
  let nextBookingProb = 50;
  if (bookingsPerMonth >= 2) nextBookingProb = 90;
  else if (bookingsPerMonth >= 1) nextBookingProb = 75;
  else if (bookingsPerMonth >= 0.5) nextBookingProb = 60;
  else if (daysSinceContact > 90) nextBookingProb = 30;
  else if (daysSinceContact > 180) nextBookingProb = 15;

  // Predicted next booking date
  const avgDaysBetween = bookingCount > 1 
    ? customerAgeDays / bookingCount 
    : 45;
  const predictedNextDate = new Date(lastBookingDate);
  predictedNextDate.setDate(predictedNextDate.getDate() + Math.round(avgDaysBetween));

  // Churn risk
  let churnScore = 20;
  if (daysSinceContact > 180) churnScore = 90;
  else if (daysSinceContact > 120) churnScore = 70;
  else if (daysSinceContact > 90) churnScore = 50;
  else if (daysSinceContact > 60) churnScore = 35;

  // If they were regular and stopped, higher risk
  if (bookingsPerMonth >= 1 && daysSinceContact > 45) {
    churnScore += 20;
  }

  churnScore = Math.min(100, churnScore);

  const churnLevel = churnScore >= 70 ? 'critical' 
    : churnScore >= 50 ? 'high' 
    : churnScore >= 30 ? 'medium' 
    : 'low';

  // Sentiment (placeholder - would integrate with message analysis)
  const sentimentScore = 65;
  const sentimentTrend = 'stable';

  // Upsell potential
  let upsellScore = 30;
  if (bookingCount >= 3 && avgBookingValue < 200) upsellScore = 70;
  else if (bookingCount >= 2) upsellScore = 50;
  
  // Recommend services they haven't tried
  const bookedServiceIds = new Set(bookings.map(b => (b as any).service_id));
  const recommendedServices = services
    .filter(s => !bookedServiceIds.has(s.id))
    .slice(0, 3)
    .map(s => ({ id: s.id, name: s.name, price: s.base_price }));

  // VIP status
  const isVip = totalSpent >= 2000 || bookingCount >= 10 || predictedLTV >= 5000;
  const vipReason = isVip 
    ? totalSpent >= 2000 ? 'High spender' 
      : bookingCount >= 10 ? 'Loyal customer' 
      : 'High lifetime value potential'
    : null;

  const insights = {
    spending_pattern: avgBookingValue >= 200 ? 'premium' : avgBookingValue >= 100 ? 'standard' : 'budget',
    frequency_pattern: bookingsPerMonth >= 2 ? 'frequent' : bookingsPerMonth >= 0.5 ? 'regular' : 'occasional',
    retention_risk: churnLevel,
  };

  return {
    predictedLTV,
    nextBookingProb,
    predictedNextDate: predictedNextDate.toISOString().split('T')[0],
    churnScore,
    churnLevel,
    daysSinceContact,
    sentimentScore,
    sentimentTrend,
    upsellScore,
    recommendedServices,
    isVip,
    vipReason,
    insights,
  };
}

function calculateBusinessIntelligence(
  leads: LeadData[],
  bookings: BookingData[],
  customers: CustomerData[]
) {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // This month's bookings
  const thisMonthBookings = bookings.filter(b => {
    const d = new Date(b.scheduled_at);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const thisMonthRevenue = thisMonthBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

  // Last 3 months average
  const last3Months = bookings.filter(b => {
    const d = new Date(b.scheduled_at);
    const monthsDiff = (thisYear - d.getFullYear()) * 12 + (thisMonth - d.getMonth());
    return monthsDiff >= 1 && monthsDiff <= 3 && b.status === 'completed';
  });
  const avgMonthlyRevenue = last3Months.length > 0
    ? last3Months.reduce((sum, b) => sum + Number(b.total_amount || 0), 0) / 3
    : thisMonthRevenue;

  // Predicted monthly revenue
  const predictedRevenue = Math.round(avgMonthlyRevenue * 1.05); // 5% growth assumption

  // Conversion rate
  const convertedLeads = leads.filter(l => l.status === 'converted').length;
  const conversionRate = leads.length > 0 ? (convertedLeads / leads.length) * 100 : 0;

  // Best converting source
  const sourceStats: Record<string, { total: number; converted: number }> = {};
  leads.forEach(lead => {
    if (!sourceStats[lead.source]) {
      sourceStats[lead.source] = { total: 0, converted: 0 };
    }
    sourceStats[lead.source].total++;
    if (lead.status === 'converted') {
      sourceStats[lead.source].converted++;
    }
  });

  let bestSource = 'website';
  let bestSourceRate = 0;
  Object.entries(sourceStats).forEach(([source, stats]) => {
    const rate = stats.total >= 3 ? (stats.converted / stats.total) : 0;
    if (rate > bestSourceRate) {
      bestSourceRate = rate;
      bestSource = source;
    }
  });

  // Best converting day
  const dayStats: Record<number, { total: number; converted: number }> = {};
  leads.forEach(lead => {
    const day = new Date(lead.created_at).getDay();
    if (!dayStats[day]) dayStats[day] = { total: 0, converted: 0 };
    dayStats[day].total++;
    if (lead.status === 'converted') dayStats[day].converted++;
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let bestDay = 'Tuesday';
  let bestDayRate = 0;
  Object.entries(dayStats).forEach(([day, stats]) => {
    const rate = stats.total >= 3 ? (stats.converted / stats.total) : 0;
    if (rate > bestDayRate) {
      bestDayRate = rate;
      bestDay = dayNames[parseInt(day)];
    }
  });

  // Price analysis
  const completedBookings = bookings.filter(b => b.status === 'completed');
  const amounts = completedBookings.map(b => Number(b.total_amount || 0)).filter(a => a > 0);
  amounts.sort((a, b) => a - b);
  
  const priceRangeLow = amounts.length > 0 ? amounts[Math.floor(amounts.length * 0.25)] : 100;
  const priceRangeHigh = amounts.length > 0 ? amounts[Math.floor(amounts.length * 0.75)] : 300;
  const priceWinRate = completedBookings.length > 0 
    ? (completedBookings.length / Math.max(1, bookings.length)) * 100 
    : 0;

  // Goal calculations
  const monthlyGoal = avgMonthlyRevenue * 1.1; // 10% growth goal
  const goalProbability = Math.min(100, (thisMonthRevenue / monthlyGoal) * 100);
  const remainingForGoal = Math.max(0, monthlyGoal - thisMonthRevenue);
  const avgBookingValue = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 150;
  const bookingsNeeded = Math.ceil(remainingForGoal / avgBookingValue);

  // Seasonal factors (simple month-based)
  const monthlyRevenue: Record<number, number[]> = {};
  bookings.filter(b => b.status === 'completed').forEach(b => {
    const month = new Date(b.scheduled_at).getMonth();
    if (!monthlyRevenue[month]) monthlyRevenue[month] = [];
    monthlyRevenue[month].push(Number(b.total_amount || 0));
  });

  const seasonalFactors: Record<string, number> = {};
  const totalAvg = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 1;
  Object.entries(monthlyRevenue).forEach(([month, revenues]) => {
    const monthAvg = revenues.reduce((a, b) => a + b, 0) / revenues.length;
    seasonalFactors[dayNames[parseInt(month) % 7]] = totalAvg > 0 ? monthAvg / totalAvg : 1;
  });

  // Top insights
  const topInsights = [];
  if (conversionRate >= 30) {
    topInsights.push(`Your ${conversionRate.toFixed(0)}% conversion rate is excellent - leads from ${bestSource} convert best`);
  } else if (conversionRate < 20) {
    topInsights.push(`Focus on improving your ${conversionRate.toFixed(0)}% conversion rate - try faster follow-ups`);
  }

  if (goalProbability >= 80) {
    topInsights.push(`On track to hit ${goalProbability.toFixed(0)}% of your revenue goal this month`);
  } else {
    topInsights.push(`Need ${bookingsNeeded} more bookings to hit your monthly goal`);
  }

  topInsights.push(`${bestDay}s see highest conversion - schedule more follow-ups then`);

  // Recommendations
  const recommendations = [];
  if (conversionRate < 25) {
    recommendations.push({ priority: 'high', action: 'Respond to leads within 1 hour', impact: '+15% conversions' });
  }
  if (bookingsNeeded > 5) {
    recommendations.push({ priority: 'high', action: 'Run a promotional campaign', impact: `${bookingsNeeded} bookings needed` });
  }
  recommendations.push({ priority: 'medium', action: `Focus on ${bestSource} marketing`, impact: 'Best ROI channel' });

  return {
    predictedRevenue,
    goalProbability,
    bookingsNeeded,
    conversionRate,
    bestSource,
    bestDay,
    bestTime: '10am-2pm',
    optimalWindow: 60,
    priceRangeLow,
    priceRangeHigh,
    priceWinRate,
    topInsights,
    recommendations,
    seasonalFactors,
    peakPeriods: ['Spring', 'Fall'],
  };
}

async function generateAIInsights(apiKey: string, data: any): Promise<string[]> {
  const prompt = `You are a business intelligence analyst for a cleaning/service company. Based on this data, provide 3 specific, actionable insights (max 25 words each):

Revenue: $${data.predictedRevenue}/month predicted
Conversion Rate: ${data.conversionRate.toFixed(1)}%
Best Source: ${data.bestSource}
Best Day: ${data.bestDay}
Bookings Needed: ${data.bookingsNeeded} for goal
Win Rate: ${data.priceWinRate.toFixed(1)}%

Format: Return only 3 bullet points, no numbering.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error('AI request failed');
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || '';
  
  return content
    .split('\n')
    .filter((line: string) => line.trim().length > 0)
    .map((line: string) => line.replace(/^[-•*]\s*/, '').trim())
    .slice(0, 3);
}

serve(handler);
