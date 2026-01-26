import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import { useBookingForm } from '../BookingFormContext';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';

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
  } = useBookingForm();

  const handleAddressSelect = (components: { address: string; city: string; state: string; zipCode: string }) => {
    setAddress(components.address);
    setCity(components.city);
    setState(components.state);
    setZipCode(components.zipCode);
  };

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
          <div>
            <Label htmlFor="address" className="text-sm font-medium">Street Address</Label>
            <AddressAutocomplete
              id="address"
              value={address}
              onChange={setAddress}
              onAddressSelect={handleAddressSelect}
              placeholder="Start typing an address..."
              className="mt-2 h-11 bg-secondary/30 border-border/50"
              showMapLink={true}
              fullAddress={[address, city, state, zipCode].filter(Boolean).join(', ')}
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
                className="mt-2 h-11 bg-secondary/30 border-border/50"
              />
            </div>
            <div>
              <Label htmlFor="state" className="text-sm font-medium">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-2 h-11 bg-secondary/30 border-border/50"
              />
            </div>
            <div>
              <Label htmlFor="zipCode" className="text-sm font-medium">ZIP Code</Label>
              <Input
                id="zipCode"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="mt-2 h-11 bg-secondary/30 border-border/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
