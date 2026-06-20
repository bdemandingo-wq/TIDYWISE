import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MapPin } from 'lucide-react';
import { useBookingForm } from '../BookingFormContext';
import { supabase } from '@/integrations/supabase/client';

interface Suggestion {

function detectRegionCode(): string | undefined {
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const loc of locales) {
    const region = loc?.split('-')[1];
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  }
  return undefined;
}

  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

export function PropertyStep() {
  const {
    address,
    setAddress,
    aptSuite,
    setAptSuite,
    city,
    setCity,
    state,
    setState,
    zipCode,
    setZipCode,
    customerLocations,
    customerTab,
    selectedCustomerId,
    setSelectedLocationId,
  } = useBookingForm();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [skipNextFetch, setSkipNextFetch] = useState(false);
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const debounceRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced fetch of suggestions when user types in address
  useEffect(() => {
    if (skipNextFetch) {
      setSkipNextFetch(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = address.trim();
    if (q.length < 3) {
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
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Close suggestions on outside click
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
    setAddress(s.mainText || s.text);
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
        setAddress(data.street);
      }
      if (data?.city) setCity(data.city);
      if (data?.state) setState(data.state);
      if (data?.zip) setZipCode(data.zip);
    } catch (e) {
      console.error('address details failed', e);
    } finally {
      // Rotate session token after a completed selection (Google billing best practice)
      sessionTokenRef.current = crypto.randomUUID();
    }
  };

  const handleLocationSelect = (locationId: string) => {
    if (locationId === 'manual') {
      setAddress('');
      setAptSuite('');
      setCity('');
      setState('');
      setZipCode('');
      setSelectedLocationId(null);
      return;
    }
    const loc = customerLocations.find(l => l.id === locationId);
    if (loc) {
      setSkipNextFetch(true);
      setAddress(loc.address || '');
      setAptSuite(loc.apt_suite || '');
      setCity(loc.city || '');
      setState(loc.state || '');
      setZipCode(loc.zip_code || '');
      setSelectedLocationId(loc.id);
    }
  };

  const showSavedAddresses = customerTab === 'existing' && selectedCustomerId && customerLocations.length > 0;

  const matchingLocationId = useMemo(() => (
    showSavedAddresses
      ? customerLocations.find(l => l.address === address && l.city === city && l.zip_code === zipCode)?.id || 'manual'
      : undefined
  ), [showSavedAddresses, customerLocations, address, city, zipCode]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10">
          <MapPin className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Property Details</h3>
          <p className="text-sm text-muted-foreground">Enter the service location address</p>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6 space-y-5">
          {showSavedAddresses && (
            <div>
              <Label className="text-sm font-medium">Saved Address</Label>
              <Select value={matchingLocationId} onValueChange={handleLocationSelect}>
                <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                  <SelectValue placeholder="Select a saved address" />
                </SelectTrigger>
                <SelectContent>
                  {customerLocations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>
                      <span className="font-medium">{loc.name}</span>
                      {loc.is_primary && <span className="text-xs text-muted-foreground ml-1">(Default)</span>}
                      {(loc as any).price_override != null && (loc as any).price_override > 0 && (
                        <span className="text-xs text-emerald-600 ml-1">(${(loc as any).price_override})</span>
                      )}
                      <span className="text-muted-foreground ml-2 text-xs">
                        {[loc.address, loc.city, loc.state].filter(Boolean).join(', ')}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="manual">Enter address manually</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="relative" ref={wrapperRef}>
            <Label htmlFor="address" className="text-sm font-medium">Street Address</Label>
            <div className="relative">
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggest(true)}
                placeholder="Start typing an address..."
                autoComplete="off"
                className="mt-2 h-11 bg-secondary/30 border-border/50 pr-9"
              />
              {loadingSuggest && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 mt-1 h-4 w-4 animate-spin text-muted-foreground" />
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

          <div>
            <Label htmlFor="aptSuite" className="text-sm font-medium">Apt / Suite / Unit</Label>
            <Input
              id="aptSuite"
              value={aptSuite}
              onChange={(e) => setAptSuite(e.target.value)}
              placeholder="Apt 4B, Suite 200, etc."
              className="mt-2 h-11 bg-secondary/30 border-border/50"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city" className="text-sm font-medium">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="mt-2 h-11 bg-secondary/30 border-border/50"
              />
            </div>
            <div>
              <Label htmlFor="state" className="text-sm font-medium">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                className="mt-2 h-11 bg-secondary/30 border-border/50"
              />
            </div>
            <div>
              <Label htmlFor="zipCode" className="text-sm font-medium">ZIP Code</Label>
              <Input
                id="zipCode"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="12345"
                className="mt-2 h-11 bg-secondary/30 border-border/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
