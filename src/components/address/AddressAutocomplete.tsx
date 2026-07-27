/**
 * AddressAutocomplete – the one address input for the whole app.
 *
 * Wraps the address-autocomplete edge function (Google Places New v1).
 * Lifted verbatim out of the booking form's PropertyStep, which was the
 * only place in the product that had working autocomplete.
 *
 * onResolved fires when the user picks a suggestion and carries the full
 * structured result, including lat/lng. Those coordinates come straight
 * from Places and are already international — call sites that have
 * somewhere to store them should, because the alternative (the
 * geocode-address function) is hard-locked to the US.
 *
 * Not every call site can persist coordinates yet: customer_locations has
 * no lat/lng columns and PublicBookingPage submits through an edge
 * function. Those pass a no-op for the coordinate half of onResolved and
 * still get the autocomplete + structured city/state/zip fill.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface ResolvedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  /** ISO-3166-1 alpha-2. '' when Places doesn't return a country. */
  country: string;
  formattedAddress: string;
}

interface Suggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

export interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires only on suggestion pick, never on free typing. */
  onResolved: (resolved: ResolvedAddress) => void;
  id?: string;
  placeholder?: string;
  /** Applied to the positioning wrapper. */
  className?: string;
  /** Applied to the <Input> itself. */
  inputClassName?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
}

// Region filtering stays off until organizations.country_code is populated
// everywhere. Passing a wrong region silently hides valid addresses;
// passing none just widens the result set. See PropertyStep history.
const REGION_CODE: string | undefined = undefined;

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 220;

export function AddressAutocomplete({
  value,
  onChange,
  onResolved,
  id,
  placeholder = 'Start typing an address...',
  className,
  inputClassName,
  disabled,
  required,
  'aria-label': ariaLabel,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [skipNextFetch, setSkipNextFetch] = useState(false);
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const debounceRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNextFetch) {
      setSkipNextFetch(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoadingSuggest(true);
      try {
        const { data, error } = await supabase.functions.invoke('address-autocomplete', {
          body: {
            action: 'suggest',
            input: q,
            sessionToken: sessionTokenRef.current,
            regionCode: REGION_CODE,
          },
        });
        if (error) throw error;
        setSuggestions((data?.suggestions ?? []) as Suggestion[]);
        setShowSuggest(true);
      } catch (e) {
        console.error('address suggest failed', e);
        setSuggestions([]);
      } finally {
        setLoadingSuggest(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pickSuggestion = async (s: Suggestion) => {
    setShowSuggest(false);
    setSkipNextFetch(true);
    onChange(s.mainText || s.text);
    try {
      const { data, error } = await supabase.functions.invoke('address-autocomplete', {
        body: {
          action: 'details',
          placeId: s.placeId,
          sessionToken: sessionTokenRef.current,
        },
      });
      if (error) throw error;
      if (data?.street) {
        setSkipNextFetch(true);
        onChange(data.street);
      }
      onResolved({
        street: data?.street ?? '',
        city: data?.city ?? '',
        state: data?.state ?? '',
        zip: data?.zip ?? '',
        lat: typeof data?.lat === 'number' ? data.lat : null,
        lng: typeof data?.lng === 'number' ? data.lng : null,
        country: typeof data?.country === 'string' ? data.country.toUpperCase() : '',
        formattedAddress: data?.formattedAddress ?? '',
      });
    } catch (e) {
      console.error('address details failed', e);
    } finally {
      // Rotate after a completed selection (Google billing best practice).
      sessionTokenRef.current = crypto.randomUUID();
    }
  };

  return (
    <div className={cn('relative', className)} ref={wrapperRef}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          className={cn('pr-9', inputClassName)}
        />
        {loadingSuggest && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {showSuggest && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-72 overflow-auto">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickSuggestion(s)}
              className="w-full text-left px-3 py-2 hover:bg-accent/60 transition-colors flex flex-col"
            >
              <span className="text-sm font-medium">{s.mainText || s.text}</span>
              {s.secondaryText && (
                <span className="text-xs text-muted-foreground">{s.secondaryText}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
