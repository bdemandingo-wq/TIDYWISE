import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBZ1sgCA0K7A9tNOR3w-VIkWRHcg1gZUaE';

interface AddressComponents {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect: (components: AddressComponents) => void;
  placeholder?: string;
  className?: string;
}

declare global {
  interface Window {
    google: any;
    initGoogleMapsCallback?: () => void;
  }
}

let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadCallbacks: (() => void)[] = [];

const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve) => {
    if (googleMapsLoaded) {
      resolve();
      return;
    }

    if (googleMapsLoading) {
      loadCallbacks.push(resolve);
      return;
    }

    googleMapsLoading = true;
    
    window.initGoogleMapsCallback = () => {
      googleMapsLoaded = true;
      googleMapsLoading = false;
      resolve();
      loadCallbacks.forEach(cb => cb());
      loadCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=initGoogleMapsCallback`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
};

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Start typing an address...',
  className,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isLoaded, setIsLoaded] = useState(googleMapsLoaded);

  const parseAddressComponents = useCallback((place: any): AddressComponents => {
    const components: AddressComponents = {
      address: '',
      city: '',
      state: '',
      zipCode: '',
    };

    let streetNumber = '';
    let route = '';

    place.address_components?.forEach((component: any) => {
      const types = component.types;
      
      if (types.includes('street_number')) {
        streetNumber = component.long_name;
      }
      if (types.includes('route')) {
        route = component.long_name;
      }
      // Check multiple types for city - Google may return different types
      if (types.includes('locality')) {
        components.city = component.long_name;
      } else if (types.includes('sublocality_level_1') && !components.city) {
        components.city = component.long_name;
      } else if (types.includes('administrative_area_level_3') && !components.city) {
        components.city = component.long_name;
      } else if (types.includes('neighborhood') && !components.city) {
        components.city = component.long_name;
      }
      if (types.includes('administrative_area_level_1')) {
        components.state = component.short_name;
      }
      if (types.includes('postal_code')) {
        components.zipCode = component.long_name;
      }
    });

    components.address = [streetNumber, route].filter(Boolean).join(' ');
    
    return components;
  }, []);

  useEffect(() => {
    loadGoogleMapsScript().then(() => {
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
      types: ['address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      
      if (place.formatted_address) {
        onChange(place.formatted_address);
      }
      
      if (place.address_components) {
        const parsed = parseAddressComponents(place);
        onAddressSelect(parsed);
      }
    });

    autocompleteRef.current = autocomplete;

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [isLoaded, onChange, onAddressSelect, parseAddressComponents]);

  return (
    <Input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(className)}
      autoComplete="off"
    />
  );
}
