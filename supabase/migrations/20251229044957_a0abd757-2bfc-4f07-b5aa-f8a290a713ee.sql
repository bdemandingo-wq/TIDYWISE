
-- =====================================================
-- FINAL SECURITY FIX - staff_safe view RLS
-- =====================================================

-- The staff_safe view already has security_invoker = true
-- which means it inherits RLS from the underlying staff table.
-- However, we need to ensure it's properly configured.

-- Drop and recreate the view with proper security settings
DROP VIEW IF EXISTS public.staff_safe;

CREATE VIEW public.staff_safe
WITH (security_invoker = true)
AS
SELECT 
  s.id,
  s.name,
  s.email,
  s.phone,
  s.avatar_url,
  s.bio,
  s.is_active,
  s.organization_id,
  s.created_at,
  s.updated_at,
  s.user_id,
  -- Only show sensitive fields to admins or the staff member themselves
  CASE 
    WHEN public.is_org_admin(s.organization_id) OR s.user_id = auth.uid() 
    THEN s.ssn_last4 
    ELSE NULL 
  END as ssn_last4,
  CASE 
    WHEN public.is_org_admin(s.organization_id) OR s.user_id = auth.uid() 
    THEN s.ein 
    ELSE NULL 
  END as ein,
  CASE 
    WHEN public.is_org_admin(s.organization_id) OR s.user_id = auth.uid() 
    THEN s.tax_classification 
    ELSE NULL 
  END as tax_classification,
  CASE 
    WHEN public.is_org_admin(s.organization_id) OR s.user_id = auth.uid() 
    THEN s.tax_document_url 
    ELSE NULL 
  END as tax_document_url,
  CASE 
    WHEN public.is_org_admin(s.organization_id) OR s.user_id = auth.uid() 
    THEN s.base_wage 
    ELSE NULL 
  END as base_wage,
  CASE 
    WHEN public.is_org_admin(s.organization_id) OR s.user_id = auth.uid() 
    THEN s.hourly_rate 
    ELSE NULL 
  END as hourly_rate,
  CASE 
    WHEN public.is_org_admin(s.organization_id) OR s.user_id = auth.uid() 
    THEN s.percentage_rate 
    ELSE NULL 
  END as percentage_rate
FROM public.staff s;

-- Note: Views with security_invoker = true inherit RLS from the underlying table.
-- The staff table already has proper RLS policies.

-- Make services and service_categories intentionally public-accessible
-- These are required for the public booking page functionality.
-- The policies already exist and are correct for this use case.
