-- Create table for P&L Overview settings and manual inputs
CREATE TABLE public.pnl_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  
  -- Revenue Map Settings
  annual_revenue_goal NUMERIC DEFAULT 0,
  last_year_revenue NUMERIC DEFAULT 0,
  goal_repeat_revenue_percent NUMERIC DEFAULT 50,
  avg_job_size_goal NUMERIC DEFAULT 250,
  closing_rate_goal NUMERIC DEFAULT 50,
  first_time_to_recurring_goal NUMERIC DEFAULT 30,
  churn_rate_goal NUMERIC DEFAULT 3,
  
  -- Monthly Sales Goals (JSON array for 12 months)
  monthly_sales_goals JSONB DEFAULT '[]',
  monthly_inbound_leads_goals JSONB DEFAULT '[]',
  
  -- Marketing Budget Settings
  marketing_percent_of_revenue NUMERIC DEFAULT 15,
  
  -- Marketing Spend by Channel (JSON for flexibility)
  google_lsa_spend JSONB DEFAULT '[]',
  facebook_ads_spend JSONB DEFAULT '[]',
  other_online_spend JSONB DEFAULT '[]',
  local_marketing_spend JSONB DEFAULT '[]',
  direct_mail_spend JSONB DEFAULT '[]',
  
  -- P&L Settings
  contractor_percent NUMERIC DEFAULT 50,
  credit_card_percent NUMERIC DEFAULT 2.9,
  refunds_percent NUMERIC DEFAULT 2,
  
  -- Fixed Overhead (JSON for flexibility)
  fixed_overhead_items JSONB DEFAULT '[]',
  
  -- Variable Overhead (JSON for flexibility)  
  variable_overhead_items JSONB DEFAULT '[]',
  
  -- Recruiting costs
  recruiting_costs JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(organization_id, year)
);

-- Enable RLS
ALTER TABLE public.pnl_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their organization's P&L settings"
ON public.pnl_settings
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their organization's P&L settings"
ON public.pnl_settings
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their organization's P&L settings"
ON public.pnl_settings
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their organization's P&L settings"
ON public.pnl_settings
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_pnl_settings_updated_at
BEFORE UPDATE ON public.pnl_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();