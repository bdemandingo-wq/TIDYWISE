-- Create org_stripe_settings table for per-organization Stripe credentials
CREATE TABLE public.org_stripe_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    stripe_secret_key TEXT NOT NULL,
    stripe_publishable_key TEXT,
    stripe_account_id TEXT,
    is_connected BOOLEAN DEFAULT false,
    connected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.org_stripe_settings ENABLE ROW LEVEL SECURITY;

-- Only admins/owners of the organization can view their Stripe settings
CREATE POLICY "Admins can view their org Stripe settings"
ON public.org_stripe_settings
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.org_memberships om
        WHERE om.organization_id = org_stripe_settings.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
);

-- Only admins/owners can insert Stripe settings for their org
CREATE POLICY "Admins can insert their org Stripe settings"
ON public.org_stripe_settings
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.org_memberships om
        WHERE om.organization_id = org_stripe_settings.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
);

-- Only admins/owners can update their org Stripe settings
CREATE POLICY "Admins can update their org Stripe settings"
ON public.org_stripe_settings
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.org_memberships om
        WHERE om.organization_id = org_stripe_settings.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'owner')
    )
);

-- Create trigger for updated_at
CREATE TRIGGER update_org_stripe_settings_updated_at
BEFORE UPDATE ON public.org_stripe_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();