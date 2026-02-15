import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  cleaningServices as defaultCleaningServices,
  extras as defaultExtras,
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
  primaryColor: string | null;
  accentColor: string | null;
  bookingFormTheme: 'light' | 'dark';
  services: PublicService[];
  extras: PublicExtra[];
  loading: boolean;
  error: string | null;
}

type PublicBookingDataResponse = {
  success: boolean;
  error?: string;
  organization?: { id: string; name: string; logo_url: string | null };
  services?: any[];
  servicePricing?: any[];
  branding?: { primary_color: string; accent_color: string } | null;
  bookingFormTheme?: string;
};

function getDefaultPayload() {
  const services: PublicService[] = defaultCleaningServices.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    color: s.color,
    minimumPrice: s.minimumPrice,
    prices: s.prices,
    duration: 60,
  }));

  return { services, extras: defaultExtras };
}

export function usePublicOrgPricing(orgSlug: string | undefined): PublicOrgData {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [bookingFormTheme, setBookingFormTheme] = useState<'light' | 'dark'>('dark');
  const [services, setServices] = useState<PublicService[]>([]);
  const [extras, setExtras] = useState<PublicExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const applyDefaults = () => {
      const defaults = getDefaultPayload();
      setServices(defaults.services);
      setExtras(defaults.extras);
    };

    const run = async () => {
      setLoading(true);
      setError(null);

      // No slug: just show defaults
      if (!orgSlug) {
        applyDefaults();
        setLoading(false);
        return;
      }

      try {
        const { data, error: invokeError } = await supabase.functions.invoke<PublicBookingDataResponse>(
          'public-booking-data',
          { body: { orgSlug } },
        );

        if (invokeError) throw invokeError;
        if (!data?.success) throw new Error(data?.error || 'Failed to load booking data');
        if (!data.organization) throw new Error('Organization not found');

        if (cancelled) return;

        setOrganizationId(data.organization.id);
        setOrganizationName(data.organization.name);
        setLogoUrl(data.organization.logo_url);
        if (data.branding) {
          setPrimaryColor(data.branding.primary_color);
          setAccentColor(data.branding.accent_color);
        }
        setBookingFormTheme((data.bookingFormTheme === 'light' ? 'light' : 'dark'));

        const pricingMap = new Map<string, any>();
        (data.servicePricing || []).forEach((p: any) => pricingMap.set(p.service_id, p));

        const rawServices = data.services || [];

        if (rawServices.length > 0) {
          const mappedServices: PublicService[] = rawServices.map((svc: any) => {
            const pricing = pricingMap.get(svc.id);
            const defaultSvc = defaultCleaningServices.find(
              (d) => d.id === svc.id || d.name.toLowerCase() === svc.name?.toLowerCase(),
            );

            // Prefer org-specific service pricing if present; otherwise prefer the service's base price.
            // Fallback to default template pricing only if the service doesn't have a base price.
            const servicePrice = Number(svc.price ?? 0);
            const fallbackTemplatePrices = defaultSvc?.prices || [];

            let pricesArray: number[] = [];

            if (Array.isArray(pricing?.sqft_prices) && pricing.sqft_prices.length > 0) {
              pricesArray = pricing.sqft_prices;
            } else if (servicePrice > 0) {
              // No pricing sheet yet: use base price for all sqft ranges so changes to service price are reflected.
              pricesArray = Array(13).fill(servicePrice);
            } else if (Array.isArray(fallbackTemplatePrices) && fallbackTemplatePrices.length > 0) {
              pricesArray = fallbackTemplatePrices;
            } else {
              pricesArray = Array(13).fill(0);
            }

            return {
              id: svc.id,
              name: svc.name,
              description: svc.description || defaultSvc?.description || '',
              color: defaultSvc?.color || '#3b82f6',
              minimumPrice: Number(pricing?.minimum_price ?? (servicePrice > 0 ? servicePrice : defaultSvc?.minimumPrice ?? 0)),
              prices: pricesArray,
              duration: svc.duration || 60,
            };
          });

          setServices(mappedServices);

          const firstPricing = (data.servicePricing || [])[0];
          const pricingExtras = firstPricing?.extras;

          if (Array.isArray(pricingExtras) && pricingExtras.length > 0) {
            setExtras(pricingExtras as unknown as PublicExtra[]);
          } else {
            setExtras(defaultExtras);
          }
        } else {
          applyDefaults();
        }
      } catch (err: any) {
        console.error('Error fetching public booking data:', err);
        if (!cancelled) {
          setError(err?.message || 'Failed to load booking form');
          applyDefaults();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  return {
    organizationId,
    organizationName,
    logoUrl,
    primaryColor,
    accentColor,
    bookingFormTheme,
    services,
    extras,
    loading,
    error,
  };
}

