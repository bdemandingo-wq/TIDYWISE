import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface InvoiceBranding {
  id?: string;
  organization_id: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  font_style: 'modern' | 'classic' | 'minimal';
  header_layout: 'left' | 'center' | 'right';
  footer_message: string;
}

const DEFAULT_BRANDING: Omit<InvoiceBranding, 'organization_id'> = {
  logo_url: null,
  primary_color: '#3b82f6',
  accent_color: '#e5e7eb',
  font_style: 'modern',
  header_layout: 'left',
  footer_message: 'Thank you for your business!',
};

export function useInvoiceBranding() {
  const { organization } = useOrganization();

  const query = useQuery({
    queryKey: ['invoice-branding', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await (supabase as any)
        .from('invoice_branding')
        .select('*')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error) {
        console.error('Failed to fetch invoice branding:', error);
        throw error;
      }
      return (data || null) as InvoiceBranding | null;
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 10,
  });

  const branding: InvoiceBranding = {
    ...DEFAULT_BRANDING,
    organization_id: organization?.id || '',
    ...query.data,
  };

  return { branding, isLoading: query.isLoading, refetch: query.refetch };
}

export function getFontFamily(style: string): string {
  switch (style) {
    case 'classic': return "'Georgia', 'Times New Roman', serif";
    case 'minimal': return "'Courier New', 'Menlo', monospace";
    default: return "'Inter', system-ui, -apple-system, sans-serif";
  }
}
