import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  cleaningServices as defaultCleaningServices, 
  extras as defaultExtras,
  bedroomPricing as defaultBedroomPricing,
  petOptions as defaultPetOptions,
  homeConditionOptions as defaultHomeConditionOptions,
} from '@/data/pricingData';

export interface ServicePricingData {
  id?: string;
  service_id: string;
  sqft_prices: number[];
  bedroom_pricing: { bedrooms: string; bathrooms: string; basePrice: number }[];
  extras: { id: string; name: string; price: number; note: string; icon?: string }[];
  pet_options: { id: string; label: string; price: number }[];
  home_condition_options: { id: number; label: string; price: number }[];
  minimum_price: number;
}

export function useServicePricing() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: servicePricing = new Map<string, ServicePricingData>(), isLoading: loading } = useQuery({
    queryKey: ['service-pricing', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return new Map<string, ServicePricingData>();

      const { data, error } = await supabase
        .from('service_pricing')
        .select('*')
        .eq('organization_id', organization.id);

      if (error) throw error;

      const pricingMap = new Map<string, ServicePricingData>();
      
      (data || []).forEach((item: any) => {
        pricingMap.set(item.service_id, {
          id: item.id,
          service_id: item.service_id,
          sqft_prices: item.sqft_prices || [],
          bedroom_pricing: item.bedroom_pricing || [],
          extras: item.extras || [],
          pet_options: item.pet_options || [],
          home_condition_options: item.home_condition_options || [],
          minimum_price: Number(item.minimum_price) || 0,
        });
      });

      return pricingMap;
    },
    enabled: !!organization?.id,
    staleTime: 0, // Always check for updates
  });

  const getServicePricing = useCallback((serviceId: string): ServicePricingData => {
    const existing = servicePricing.get(serviceId);
    if (existing) return existing;

    // Return defaults based on service type from pricingData
    const defaultService = defaultCleaningServices.find(s => s.id === serviceId);
    
    return {
      service_id: serviceId,
      sqft_prices: defaultService?.prices || [],
      bedroom_pricing: defaultBedroomPricing,
      extras: defaultExtras,
      pet_options: defaultPetOptions,
      home_condition_options: defaultHomeConditionOptions,
      minimum_price: defaultService?.minimumPrice || 0,
    };
  }, [servicePricing]);

  const saveServicePricing = async (serviceId: string, pricing: Partial<ServicePricingData>) => {
    if (!organization?.id) return false;

    try {
      const existing = servicePricing.get(serviceId);
      
      const pricingData = {
        organization_id: organization.id,
        service_id: serviceId,
        sqft_prices: pricing.sqft_prices ?? existing?.sqft_prices ?? [],
        bedroom_pricing: pricing.bedroom_pricing ?? existing?.bedroom_pricing ?? [],
        extras: pricing.extras ?? existing?.extras ?? [],
        pet_options: pricing.pet_options ?? existing?.pet_options ?? [],
        home_condition_options: pricing.home_condition_options ?? existing?.home_condition_options ?? [],
        minimum_price: pricing.minimum_price ?? existing?.minimum_price ?? 0,
      };

      const { error } = await supabase
        .from('service_pricing')
        .upsert(pricingData, {
          onConflict: 'organization_id,service_id',
          ignoreDuplicates: false,
        });

      if (error) throw error;
      
      // Invalidate the cache so all components using this hook get fresh data
      await queryClient.invalidateQueries({ queryKey: ['service-pricing', organization.id] });
      return true;
    } catch (error) {
      console.error('Error saving service pricing:', error);
      return false;
    }
  };

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['service-pricing', organization?.id] });
  }, [queryClient, organization?.id]);

  return {
    servicePricing,
    loading,
    getServicePricing,
    saveServicePricing,
    refetch,
  };
}
