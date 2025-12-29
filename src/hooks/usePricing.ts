import { useState, useEffect, useCallback } from 'react';
import { 
  cleaningServices as defaultCleaningServices, 
  extras as defaultExtras,
  bedroomPricing as defaultBedroomPricing,
  petOptions as defaultPetOptions,
  homeConditionOptions as defaultHomeConditionOptions,
  squareFootageRanges,
  frequencyOptions,
  CleaningService
} from '@/data/pricingData';

export interface Extra {
  id: string;
  name: string;
  price: number;
  note: string;
  icon?: string;
}

export interface BedroomPricingItem {
  bedrooms: string;
  bathrooms: string;
  basePrice: number;
}

export interface PetOption {
  id: string;
  label: string;
  price: number;
}

export interface HomeConditionOption {
  id: number;
  label: string;
  price: number;
}

const STORAGE_KEYS = {
  services: 'tidywise_services',
  extras: 'tidywise_extras',
  bedroomPricing: 'tidywise_bedroom_pricing',
  petOptions: 'tidywise_pet_options',
  homeConditionOptions: 'tidywise_home_condition_options',
} as const;

export function usePricing() {
  const [services, setServices] = useState<CleaningService[]>(defaultCleaningServices);
  const [extras, setExtras] = useState<Extra[]>(defaultExtras);
  const [bedroomPricing, setBedroomPricing] = useState<BedroomPricingItem[]>(defaultBedroomPricing);
  const [petOptions, setPetOptions] = useState<PetOption[]>(defaultPetOptions);
  const [homeConditionOptions, setHomeConditionOptions] = useState<HomeConditionOption[]>(defaultHomeConditionOptions);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedServices = localStorage.getItem(STORAGE_KEYS.services);
    const savedExtras = localStorage.getItem(STORAGE_KEYS.extras);
    const savedBedroomPricing = localStorage.getItem(STORAGE_KEYS.bedroomPricing);
    const savedPetOptions = localStorage.getItem(STORAGE_KEYS.petOptions);
    const savedHomeConditionOptions = localStorage.getItem(STORAGE_KEYS.homeConditionOptions);
    
    if (savedServices) {
      try {
        setServices(JSON.parse(savedServices));
      } catch (e) {
        console.error('Error parsing services from localStorage:', e);
      }
    }

    if (savedExtras) {
      try {
        setExtras(JSON.parse(savedExtras));
      } catch (e) {
        console.error('Error parsing extras from localStorage:', e);
      }
    }

    if (savedBedroomPricing) {
      try {
        setBedroomPricing(JSON.parse(savedBedroomPricing));
      } catch (e) {
        console.error('Error parsing bedroom pricing from localStorage:', e);
      }
    }

    if (savedPetOptions) {
      try {
        setPetOptions(JSON.parse(savedPetOptions));
      } catch (e) {
        console.error('Error parsing pet options from localStorage:', e);
      }
    }

    if (savedHomeConditionOptions) {
      try {
        setHomeConditionOptions(JSON.parse(savedHomeConditionOptions));
      } catch (e) {
        console.error('Error parsing home condition options from localStorage:', e);
      }
    }

    setIsLoaded(true);
  }, []);

  // Listen for storage changes from other tabs/components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.services && e.newValue) {
        try {
          setServices(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Error parsing services from storage event:', err);
        }
      }
      if (e.key === STORAGE_KEYS.extras && e.newValue) {
        try {
          setExtras(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Error parsing extras from storage event:', err);
        }
      }
      if (e.key === STORAGE_KEYS.bedroomPricing && e.newValue) {
        try {
          setBedroomPricing(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Error parsing bedroom pricing from storage event:', err);
        }
      }
      if (e.key === STORAGE_KEYS.petOptions && e.newValue) {
        try {
          setPetOptions(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Error parsing pet options from storage event:', err);
        }
      }
      if (e.key === STORAGE_KEYS.homeConditionOptions && e.newValue) {
        try {
          setHomeConditionOptions(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Error parsing home condition options from storage event:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Refresh from localStorage (useful when pricing is updated in same tab)
  const refresh = useCallback(() => {
    const savedServices = localStorage.getItem(STORAGE_KEYS.services);
    const savedExtras = localStorage.getItem(STORAGE_KEYS.extras);
    const savedBedroomPricing = localStorage.getItem(STORAGE_KEYS.bedroomPricing);
    const savedPetOptions = localStorage.getItem(STORAGE_KEYS.petOptions);
    const savedHomeConditionOptions = localStorage.getItem(STORAGE_KEYS.homeConditionOptions);
    
    if (savedServices) setServices(JSON.parse(savedServices));
    if (savedExtras) setExtras(JSON.parse(savedExtras));
    if (savedBedroomPricing) setBedroomPricing(JSON.parse(savedBedroomPricing));
    if (savedPetOptions) setPetOptions(JSON.parse(savedPetOptions));
    if (savedHomeConditionOptions) setHomeConditionOptions(JSON.parse(savedHomeConditionOptions));
  }, []);

  // Utility functions
  const getBedroomBathroomPrice = useCallback((bedrooms: string, bathrooms: string): number => {
    const match = bedroomPricing.find(p => p.bedrooms === bedrooms && p.bathrooms === bathrooms);
    if (match) return match.basePrice;
    
    // Fallback: find closest match by bedrooms
    const bedroomMatches = bedroomPricing.filter(p => p.bedrooms === bedrooms);
    if (bedroomMatches.length > 0) {
      // Find closest bathroom match
      const targetBath = parseFloat(bathrooms);
      const closest = bedroomMatches.reduce((prev, curr) => {
        const prevDiff = Math.abs(parseFloat(prev.bathrooms) - targetBath);
        const currDiff = Math.abs(parseFloat(curr.bathrooms) - targetBath);
        return currDiff < prevDiff ? curr : prev;
      });
      return closest.basePrice;
    }
    
    return 150; // Default base price
  }, [bedroomPricing]);

  const getConditionPrice = useCallback((condition: number): number => {
    const option = homeConditionOptions.find(o => o.id === condition);
    return option?.price || 0;
  }, [homeConditionOptions]);

  const getPetPrice = useCallback((petOptionId: string): number => {
    const option = petOptions.find(o => o.id === petOptionId);
    return option?.price || 0;
  }, [petOptions]);

  const getExtraPrice = useCallback((extraId: string): number => {
    const extra = extras.find(e => e.id === extraId);
    return extra?.price || 0;
  }, [extras]);

  const getExtrasTotal = useCallback((selectedExtraIds: string[]): number => {
    return selectedExtraIds.reduce((sum, extraId) => sum + getExtraPrice(extraId), 0);
  }, [getExtraPrice]);

  const getServicePriceBySquareFootage = useCallback((serviceId: string, sqFtLabel: string): number => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return 0;
    
    const sqFtIndex = squareFootageRanges.findIndex(r => r.label === sqFtLabel);
    if (sqFtIndex === -1) return service.minimumPrice;
    
    return service.prices[sqFtIndex] || service.minimumPrice;
  }, [services]);

  return {
    // Data
    services,
    extras,
    bedroomPricing,
    petOptions,
    homeConditionOptions,
    squareFootageRanges,
    frequencyOptions,
    isLoaded,
    
    // Actions
    refresh,
    
    // Utility functions
    getBedroomBathroomPrice,
    getConditionPrice,
    getPetPrice,
    getExtraPrice,
    getExtrasTotal,
    getServicePriceBySquareFootage,
  };
}
