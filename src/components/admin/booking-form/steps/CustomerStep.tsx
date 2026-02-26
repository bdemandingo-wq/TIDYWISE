import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, RotateCcw, Loader2 } from 'lucide-react';
import { CustomerSearchInput } from '@/components/admin/CustomerSearchInput';
import { useBookingForm } from '../BookingFormContext';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { toast } from 'sonner';

interface LastBookingInfo {
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  square_footage: string | null;
  service_name: string | null;
  service_id: string | null;
  total_amount: number | null;
  scheduled_at: string | null;
}

export function CustomerStep() {
  const {
    customerTab,
    setCustomerTab,
    selectedCustomerId,
    setSelectedCustomerId,
    newCustomer,
    updateNewCustomer,
    customers,
    setAddress,
    setCity,
    setState,
    setZipCode,
    setBedrooms,
    setBathrooms,
    setSelectedServiceId,
    setTotalAmount,
    setSquareFootage,
  } = useBookingForm();

  const { organizationId } = useOrgId();
  const [lastBooking, setLastBooking] = useState<LastBookingInfo | null>(null);
  const [loadingLast, setLoadingLast] = useState(false);

  // Fetch last booking when customer changes
  useEffect(() => {
    if (!selectedCustomerId || !organizationId) {
      setLastBooking(null);
      return;
    }

    const fetchLast = async () => {
      setLoadingLast(true);
      const { data } = await supabase
        .from('bookings')
        .select('address, city, state, zip_code, bedrooms, bathrooms, square_footage, service_id, total_amount, scheduled_at, services:service_id(name)')
        .eq('customer_id', selectedCustomerId)
        .eq('organization_id', organizationId)
        .in('status', ['completed', 'confirmed'])
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setLastBooking({
          address: data.address,
          city: data.city,
          state: data.state,
          zip_code: data.zip_code,
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          square_footage: data.square_footage,
          service_name: (data.services as any)?.name || null,
          service_id: data.service_id,
          total_amount: data.total_amount,
          scheduled_at: data.scheduled_at,
        });
      } else {
        setLastBooking(null);
      }
      setLoadingLast(false);
    };

    fetchLast();
  }, [selectedCustomerId, organizationId]);

  const handleAutoFill = () => {
    if (!lastBooking) return;
    if (lastBooking.address) setAddress(lastBooking.address);
    if (lastBooking.city) setCity(lastBooking.city);
    if (lastBooking.state) setState(lastBooking.state);
    if (lastBooking.zip_code) setZipCode(lastBooking.zip_code);
    if (lastBooking.bedrooms) setBedrooms(lastBooking.bedrooms);
    if (lastBooking.bathrooms) setBathrooms(lastBooking.bathrooms);
    if (lastBooking.square_footage) setSquareFootage(lastBooking.square_footage);
    if (lastBooking.service_id) setSelectedServiceId(lastBooking.service_id);
    if (lastBooking.total_amount) setTotalAmount(lastBooking.total_amount);
    toast.success('Auto-filled from last booking');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10">
          <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Customer Information</h3>
          <p className="text-sm text-muted-foreground">Select an existing customer or add a new one</p>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <Tabs value={customerTab} onValueChange={(v) => setCustomerTab(v as 'existing' | 'new')}>
            <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-secondary/50">
              <TabsTrigger 
                value="existing" 
                className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg text-sm font-medium"
              >
                Existing Customer
              </TabsTrigger>
              <TabsTrigger 
                value="new" 
                className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg text-sm font-medium"
              >
                New Customer
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="existing" className="mt-6 space-y-4">
              <CustomerSearchInput
                customers={customers || []}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={setSelectedCustomerId}
                placeholder="Type to search customers..."
              />

              {/* Auto-fill from last booking */}
              {selectedCustomerId && lastBooking && (
                <div className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Booking</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleAutoFill}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Auto-fill
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {lastBooking.service_name && (
                      <Badge variant="secondary" className="text-xs">{lastBooking.service_name}</Badge>
                    )}
                    {lastBooking.address && (
                      <Badge variant="outline" className="text-xs">{lastBooking.address}</Badge>
                    )}
                    {lastBooking.total_amount && (
                      <Badge variant="outline" className="text-xs">${lastBooking.total_amount.toFixed(2)}</Badge>
                    )}
                  </div>
                </div>
              )}
              {selectedCustomerId && loadingLast && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading last booking...
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="new" className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName" className="text-sm font-medium">First Name *</Label>
                  <Input
                    id="firstName"
                    value={newCustomer.first_name}
                    onChange={(e) => updateNewCustomer('first_name', e.target.value)}
                    placeholder="John"
                    className="mt-2 h-11 bg-secondary/30 border-border/50"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName" className="text-sm font-medium">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={newCustomer.last_name}
                    onChange={(e) => updateNewCustomer('last_name', e.target.value)}
                    placeholder="Doe"
                    className="mt-2 h-11 bg-secondary/30 border-border/50"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-medium">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => updateNewCustomer('email', e.target.value)}
                  placeholder="john@example.com"
                  className="mt-2 h-11 bg-secondary/30 border-border/50"
                />
              </div>
              <div>
                <Label htmlFor="phone" className="text-sm font-medium">Phone</Label>
                <Input
                  id="phone"
                  value={newCustomer.phone}
                  onChange={(e) => updateNewCustomer('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="mt-2 h-11 bg-secondary/30 border-border/50"
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
