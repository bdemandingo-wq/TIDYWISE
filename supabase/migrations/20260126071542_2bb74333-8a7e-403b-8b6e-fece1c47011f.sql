-- =============================================
-- AI PREDICTIVE CUSTOMER INTELLIGENCE SYSTEM
-- =============================================

-- 1. Lead Scoring & Intelligence Table
CREATE TABLE IF NOT EXISTS public.lead_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- AI Scoring (1-100)
  conversion_score INTEGER DEFAULT 0 CHECK (conversion_score >= 0 AND conversion_score <= 100),
  urgency_score INTEGER DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 100),
  engagement_score INTEGER DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
  
  -- Prediction Flags
  is_hot_lead BOOLEAN DEFAULT false,
  predicted_conversion_rate NUMERIC(5,2) DEFAULT 0,
  recommended_followup_time TIMESTAMPTZ,
  preferred_contact_method TEXT DEFAULT 'any',
  
  -- Insights (AI-generated)
  ai_insights JSONB DEFAULT '{}',
  behavior_patterns JSONB DEFAULT '{}',
  
  -- Timestamps
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(lead_id)
);

-- 2. Customer Intelligence & Churn Detection
CREATE TABLE IF NOT EXISTS public.customer_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  
  -- CLV Predictions
  predicted_lifetime_value NUMERIC(10,2) DEFAULT 0,
  next_booking_probability NUMERIC(5,2) DEFAULT 0,
  predicted_next_booking_date DATE,
  
  -- Churn Risk (0-100)
  churn_risk_score INTEGER DEFAULT 0 CHECK (churn_risk_score >= 0 AND churn_risk_score <= 100),
  churn_risk_level TEXT DEFAULT 'low' CHECK (churn_risk_level IN ('low', 'medium', 'high', 'critical')),
  days_since_last_contact INTEGER DEFAULT 0,
  
  -- Sentiment & Satisfaction
  sentiment_score INTEGER DEFAULT 50 CHECK (sentiment_score >= 0 AND sentiment_score <= 100),
  sentiment_trend TEXT DEFAULT 'stable' CHECK (sentiment_trend IN ('improving', 'stable', 'declining')),
  predicted_review_score NUMERIC(2,1),
  
  -- Upsell Opportunities
  upsell_potential_score INTEGER DEFAULT 0,
  recommended_services JSONB DEFAULT '[]',
  
  -- VIP Status
  is_vip BOOLEAN DEFAULT false,
  vip_reason TEXT,
  
  -- Insights
  ai_insights JSONB DEFAULT '{}',
  behavior_patterns JSONB DEFAULT '{}',
  
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(customer_id)
);

-- 3. Business Intelligence Insights (Org-level)
CREATE TABLE IF NOT EXISTS public.business_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Revenue Predictions
  predicted_monthly_revenue NUMERIC(10,2) DEFAULT 0,
  revenue_goal_probability NUMERIC(5,2) DEFAULT 0,
  bookings_needed_for_goal INTEGER DEFAULT 0,
  
  -- Conversion Analytics
  avg_lead_conversion_rate NUMERIC(5,2) DEFAULT 0,
  best_converting_source TEXT,
  best_converting_day TEXT,
  best_converting_time TEXT,
  optimal_response_window_minutes INTEGER DEFAULT 60,
  
  -- Pricing Intelligence
  optimal_price_range_low NUMERIC(10,2),
  optimal_price_range_high NUMERIC(10,2),
  price_win_rate NUMERIC(5,2),
  
  -- Performance Insights
  top_insights JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  
  -- Seasonal Trends
  seasonal_factors JSONB DEFAULT '{}',
  peak_demand_periods JSONB DEFAULT '[]',
  
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_id)
);

-- 4. Message Sentiment Log (for analyzing customer communications)
CREATE TABLE IF NOT EXISTS public.message_sentiment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  
  message_source TEXT NOT NULL, -- 'sms', 'email', 'chat', 'note'
  message_direction TEXT NOT NULL, -- 'inbound', 'outbound'
  message_preview TEXT, -- First 200 chars
  
  sentiment_score INTEGER CHECK (sentiment_score >= 0 AND sentiment_score <= 100),
  sentiment_label TEXT CHECK (sentiment_label IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')),
  urgency_detected BOOLEAN DEFAULT false,
  key_topics JSONB DEFAULT '[]',
  
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. AI Calculation Jobs Log
CREATE TABLE IF NOT EXISTS public.ai_calculation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  calculation_type TEXT NOT NULL, -- 'lead_scoring', 'churn_detection', 'revenue_forecast', 'sentiment_analysis'
  status TEXT DEFAULT 'pending',
  records_processed INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_intelligence_org ON public.lead_intelligence(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_intelligence_score ON public.lead_intelligence(conversion_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_intelligence_hot ON public.lead_intelligence(is_hot_lead) WHERE is_hot_lead = true;

CREATE INDEX IF NOT EXISTS idx_customer_intelligence_org ON public.customer_intelligence(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_intelligence_churn ON public.customer_intelligence(churn_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_customer_intelligence_vip ON public.customer_intelligence(is_vip) WHERE is_vip = true;

CREATE INDEX IF NOT EXISTS idx_business_intelligence_org ON public.business_intelligence(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_sentiment_org ON public.message_sentiment_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_sentiment_customer ON public.message_sentiment_log(customer_id);

-- Enable RLS
ALTER TABLE public.lead_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_sentiment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_calculation_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org lead intelligence" ON public.lead_intelligence
  FOR SELECT TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "Users can manage their org lead intelligence" ON public.lead_intelligence
  FOR ALL TO authenticated USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Users can view their org customer intelligence" ON public.customer_intelligence
  FOR SELECT TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "Users can manage their org customer intelligence" ON public.customer_intelligence
  FOR ALL TO authenticated USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Users can view their org business intelligence" ON public.business_intelligence
  FOR SELECT TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "Users can manage their org business intelligence" ON public.business_intelligence
  FOR ALL TO authenticated USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Users can view their org message sentiment" ON public.message_sentiment_log
  FOR SELECT TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "Users can manage their org message sentiment" ON public.message_sentiment_log
  FOR ALL TO authenticated USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Users can view their org AI logs" ON public.ai_calculation_log
  FOR SELECT TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "Users can manage their org AI logs" ON public.ai_calculation_log
  FOR ALL TO authenticated USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

-- Add updated_at triggers
CREATE TRIGGER update_lead_intelligence_updated_at
  BEFORE UPDATE ON public.lead_intelligence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_intelligence_updated_at
  BEFORE UPDATE ON public.customer_intelligence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_intelligence_updated_at
  BEFORE UPDATE ON public.business_intelligence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();