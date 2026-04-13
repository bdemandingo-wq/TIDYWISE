import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin } from 'lucide-react';
import { useBookingForm } from '../BookingFormContext';

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
      setAddress(loc.address || '');
      setAptSuite(loc.apt_suite || '');
      setCity(loc.city || '');
      setState(loc.state || '');
      setZipCode(loc.zip_code || '');
      setSelectedLocationId(loc.id);
    }
  };

  const showSavedAddresses = customerTab === 'existing' && selectedCustomerId && customerLocations.length > 0;

  // Find which saved location matches the current address
  const matchingLocationId = showSavedAddresses
    ? customerLocations.find(l => l.address === address && l.city === city && l.zip_code === zipCode)?.id || 'manual'
    : undefined;

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
          {/* Saved address picker */}
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

          <div>
            <Label htmlFor="address" className="text-sm font-medium">Street Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
              className="mt-2 h-11 bg-secondary/30 border-border/50"
            />
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
