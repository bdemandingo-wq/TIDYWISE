import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddressComponents {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (components: AddressComponents) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  showMapLink?: boolean;
  fullAddress?: string; // Combined address for map link
}

// Load Google Places script
function loadGooglePlacesScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve();
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.warn('Google Places API key not configured');
      reject(new Error('API key not configured'));
      return;
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Places'));
    document.head.appendChild(script);
  });
}

// Parse place result to extract address components
function parseAddressComponents(place: google.maps.places.PlaceResult): AddressComponents {
  const components: AddressComponents = {
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
  };

  if (!place.address_components) return components;

  let streetNumber = '';
  let route = '';

  for (const component of place.address_components) {
    const types = component.types;
    
    if (types.includes('street_number')) {
      streetNumber = component.long_name;
    } else if (types.includes('route')) {
      route = component.long_name;
    } else if (types.includes('locality') || types.includes('sublocality')) {
      components.city = component.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      components.state = component.short_name;
    } else if (types.includes('postal_code')) {
      components.zipCode = component.long_name;
    } else if (types.includes('country')) {
      components.country = component.long_name;
    }
  }

  components.address = [streetNumber, route].filter(Boolean).join(' ');
  
  return components;
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Start typing an address...',
  className,
  id,
  disabled,
  showMapLink = false,
  fullAddress,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasSelected, setHasSelected] = useState(!!value);

  useEffect(() => {
    loadGooglePlacesScript()
      .then(() => setIsLoaded(true))
      .catch(() => setIsLoaded(false));
  }, []);

  const initAutocomplete = useCallback(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      
      if (place.address_components) {
        const components = parseAddressComponents(place);
        onChange(components.address);
        setHasSelected(true);
        onAddressSelect?.(components);
      }
    });

    autocompleteRef.current = autocomplete;
  }, [isLoaded, onChange, onAddressSelect]);

  useEffect(() => {
    initAutocomplete();
    
    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [initAutocomplete]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setHasSelected(false);
  };

  const openInMaps = () => {
    const addressToOpen = fullAddress || value;
    if (!addressToOpen) return;
    
    const encodedAddress = encodeURIComponent(addressToOpen);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={cn('pr-10', className)}
          disabled={disabled}
          autoComplete="off"
        />
        {showMapLink && hasSelected && value ? (
          <button
            type="button"
            onClick={openInMaps}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
            title="Open in Google Maps"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        ) : (
          <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
      </div>
    </div>
  );
}

// Clickable address link component
interface ClickableAddressProps {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  className?: string;
}

export function ClickableAddress({ address, city, state, zipCode, className }: ClickableAddressProps) {
  const parts = [address, city, state, zipCode].filter(Boolean);
  if (parts.length === 0) return <span className="text-muted-foreground">No address</span>;
  
  const fullAddress = parts.join(', ');
  const encodedAddress = encodeURIComponent(fullAddress);
  
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 text-primary hover:underline cursor-pointer',
        className
      )}
      title="Open in Google Maps"
    >
      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">{fullAddress}</span>
      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
    </a>
  );
}
