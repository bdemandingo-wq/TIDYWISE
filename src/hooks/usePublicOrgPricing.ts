import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  cleaningServices as defaultCleaningServices, 
  extras as defaultExtras,
  squareFootageRanges,
} from '@/data/pricingData';

export interface PublicService {
  id: string;
  name: string;
  description: string;
  color: string;
  minimumPrice: number;
  prices: number[];
  duration: number;
}

export interface PublicExtra {
  id: string;
  name: string;
  price: number;
  note?: string;
}

export interface PublicOrgData {
  organizationId: string | null;
  organizationName: string;
  logoUrl: string | null;
  services: PublicService[];
  extras: PublicExtra[];
  loading: boolean;
  error: string | null;
}

export function usePublicOrgPricing(orgSlug: string | undefined): PublicOrgData {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [extras, setExtras] = useState<PublicExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgSlug) {
      // No slug, use defaults
      const defaultServices = defaultCleaningServices.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        color: s.color,
        minimumPrice: s.minimumPrice,
        prices: s.prices,
        duration: 60,
      }));
      setServices(defaultServices);
      setExtras(defaultExtras);
      setLoading(false);
      return;
    }

    fetchOrgData();
  }, [orgSlug]);

  const fetchOrgData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Lookup organization by slug
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, logo_url')
        .eq('slug', orgSlug)
        .maybeSingle();

      if (orgError) throw orgError;

      if (!org) {
        setError('Organization not found');
        setLoading(false);
        return;
      }

      setOrganizationId(org.id);
      setOrganizationName(org.name);
      setLogoUrl(org.logo_url);

      // 2. Fetch org's services
      const { data: orgServices, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .order('name');

      if (servicesError) throw servicesError;

      // 3. Fetch service_pricing for this org
      const { data: pricingData, error: pricingError } = await supabase
        .from('service_pricing')
        .select('*')
        .eq('organization_id', org.id);

      if (pricingError) throw pricingError;

      // Build pricing map
      const pricingMap = new Map<string, any>();
      (pricingData || []).forEach((p: any) => {
        pricingMap.set(p.service_id, p);
      });

      // 4. Map services with their pricing
      if (orgServices && orgServices.length > 0) {
        const mappedServices: PublicService[] = orgServices.map((svc: any) => {
          const pricing = pricingMap.get(svc.id);
          const defaultSvc = defaultCleaningServices.find(d => d.id === svc.id || d.name.toLowerCase() === svc.name?.toLowerCase());
          
          return {
            id: svc.id,
            name: svc.name,
            description: svc.description || defaultSvc?.description || '',
            color: svc.color || defaultSvc?.color || '#3b82f6',
            minimumPrice: pricing?.minimum_price || svc.price || defaultSvc?.minimumPrice || 0,
            prices: pricing?.sqft_prices || defaultSvc?.prices || [],
            duration: svc.duration || 60,
          };
        });
        setServices(mappedServices);

        // Get extras from first service's pricing, or use defaults
        const firstPricing = pricingData?.[0];
        if (firstPricing?.extras && Array.isArray(firstPricing.extras) && firstPricing.extras.length > 0) {
          setExtras(firstPricing.extras as unknown as PublicExtra[]);
        } else {
          setExtras(defaultExtras);
        }
      } else {
        // No custom services, use defaults
        const defaultServices = defaultCleaningServices.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          color: s.color,
          minimumPrice: s.minimumPrice,
          prices: s.prices,
          duration: 60,
        }));
        setServices(defaultServices);
        setExtras(defaultExtras);
      }
    } catch (err: any) {
      console.error('Error fetching org pricing:', err);
      setError(err.message || 'Failed to load organization data');
      
      // Fallback to defaults
      const defaultServices = defaultCleaningServices.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        color: s.color,
        minimumPrice: s.minimumPrice,
        prices: s.prices,
        duration: 60,
      }));
      setServices(defaultServices);
      setExtras(defaultExtras);
    } finally {
      setLoading(false);
    }
  };

  return {
    organizationId,
    organizationName,
    logoUrl,
    services,
    extras,
    loading,
    error,
  };
}
