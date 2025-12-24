-- Create referrals table for tracking customer referrals
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  referred_email TEXT NOT NULL,
  referred_name TEXT,
  referred_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'completed', 'expired')),
  credit_amount NUMERIC NOT NULL DEFAULT 25,
  credit_awarded BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create checklist_templates table
CREATE TABLE public.checklist_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create checklist_items table
CREATE TABLE public.checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  requires_photo BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create booking_checklists for completed checklists per booking
CREATE TABLE public.booking_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create booking_checklist_items for individual item completion
CREATE TABLE public.booking_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_checklist_id UUID NOT NULL REFERENCES public.booking_checklists(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES public.checklist_items(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  photo_url TEXT,
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create automated_campaigns table for follow-up emails
CREATE TABLE public.automated_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('inactive_customer', 'post_service', 'birthday', 'custom')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  days_inactive INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create campaign_emails table to track sent emails
CREATE TABLE public.campaign_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.automated_campaigns(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'clicked', 'bounced')),
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE
);

-- Add customer_credits column to customers for referral credits
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credits NUMERIC DEFAULT 0;

-- Enable RLS on all new tables
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automated_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_emails ENABLE ROW LEVEL SECURITY;

-- RLS policies for referrals
CREATE POLICY "Admins can manage referrals" ON public.referrals FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Customers can view own referrals" ON public.referrals FOR SELECT USING (referrer_customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- RLS policies for checklist_templates
CREATE POLICY "Admins can manage checklist templates" ON public.checklist_templates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can view active templates" ON public.checklist_templates FOR SELECT USING (is_active = true AND has_role(auth.uid(), 'staff'::app_role));

-- RLS policies for checklist_items
CREATE POLICY "Admins can manage checklist items" ON public.checklist_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can view checklist items" ON public.checklist_items FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role));

-- RLS policies for booking_checklists
CREATE POLICY "Admins can manage booking checklists" ON public.booking_checklists FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can manage own booking checklists" ON public.booking_checklists FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- RLS policies for booking_checklist_items
CREATE POLICY "Admins can manage booking checklist items" ON public.booking_checklist_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff can manage booking checklist items" ON public.booking_checklist_items FOR ALL USING (
  booking_checklist_id IN (
    SELECT bc.id FROM booking_checklists bc 
    JOIN staff s ON bc.staff_id = s.id 
    WHERE s.user_id = auth.uid()
  )
);

-- RLS policies for automated_campaigns
CREATE POLICY "Admins can manage campaigns" ON public.automated_campaigns FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for campaign_emails
CREATE POLICY "Admins can manage campaign emails" ON public.campaign_emails FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_referrals_updated_at BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checklist_templates_updated_at BEFORE UPDATE ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_automated_campaigns_updated_at BEFORE UPDATE ON public.automated_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default "We Miss You" campaign
INSERT INTO public.automated_campaigns (name, type, subject, body, days_inactive, is_active)
VALUES (
  'We Miss You',
  'inactive_customer',
  'We miss you, {{customer_name}}! Here''s $10 off your next cleaning',
  'Hi {{customer_name}},

It''s been a while since your last cleaning with us, and we wanted to check in!

We value you as a customer and would love to help keep your home sparkling clean. As a thank you for being part of our family, here''s a special offer:

**$10 OFF your next booking!**

Use code: WELCOMEBACK

We hope to see you again soon!

Best regards,
{{company_name}}',
  30,
  true
);