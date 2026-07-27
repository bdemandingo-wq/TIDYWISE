/**
 * useInvoiceBusinessInfo – the org's own branding for customer-facing
 * invoice surfaces.
 *
 * The name chain mirrors send-invoice/index.ts:221 exactly:
 *
 *   business_settings.company_name
 *     -> organization_email_settings.from_name
 *     -> organizations.name          (set at signup, so it always exists)
 *     -> 'Your Business'
 *
 * The point of that chain is that a customer-facing invoice must never show
 * the literal string "TidyWise" — that's the platform's brand, not the
 * operator's. The two preview surfaces each had their own weaker version of
 * this (one hardcoded the string outright), which is what this hook exists
 * to stop.
 *
 * Shares the ['business-settings', orgId] query key with the rest of the
 * app, so adopting it doesn't add a request.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface InvoiceBusinessInfo {
  businessName: string;
  businessEmail: string | null;
  businessPhone: string | null;
  businessAddressLines: string[];
  /**
   * Invoice branding, consolidated onto business_settings. It used to live in
   * a separate invoice_branding table that nothing read — an operator could
   * upload a logo there and it appeared on no invoice, while the logo they
   * set in Settings was the one emails actually used.
   */
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  headerLayout: 'left' | 'center' | 'right';
  footerMessage: string | null;
  isLoading: boolean;
}

export function useInvoiceBusinessInfo(): InvoiceBusinessInfo {
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const { data: businessSettings, isLoading } = useQuery({
    queryKey: ['business-settings', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // from_name is readable directly — only the Resend key is withheld from
  // the client (see PayrollPeriodSettings for the same read).
  const { data: fromName } = useQuery({
    queryKey: ['org-email-from-name', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('organization_email_settings')
        .select('from_name')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) return null;
      return (data as { from_name?: string | null } | null)?.from_name ?? null;
    },
    enabled: !!organizationId,
  });

  const settings = businessSettings as {
    company_name?: string | null;
    company_email?: string | null;
    company_phone?: string | null;
    company_address?: string | null;
    company_city?: string | null;
    company_state?: string | null;
    company_zip?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    accent_color?: string | null;
    invoice_header_layout?: string | null;
    invoice_footer_message?: string | null;
  } | null;

  const businessName =
    settings?.company_name?.trim() ||
    fromName?.trim() ||
    organization?.name?.trim() ||
    'Your Business';

  const businessAddressLines = [
    settings?.company_address,
    [settings?.company_city, settings?.company_state, settings?.company_zip]
      .filter(Boolean)
      .join(', '),
  ].filter(Boolean) as string[];

  const layout = settings?.invoice_header_layout;

  return {
    businessName,
    businessEmail: settings?.company_email ?? null,
    businessPhone: settings?.company_phone ?? null,
    businessAddressLines,
    logoUrl: settings?.logo_url ?? null,
    primaryColor: settings?.primary_color ?? null,
    accentColor: settings?.accent_color ?? null,
    headerLayout:
      layout === 'center' || layout === 'right' ? layout : 'left',
    footerMessage: settings?.invoice_footer_message ?? null,
    isLoading,
  };
}
