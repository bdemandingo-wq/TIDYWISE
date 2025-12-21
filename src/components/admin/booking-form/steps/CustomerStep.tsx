import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User } from 'lucide-react';
import { CustomerSearchInput } from '@/components/admin/CustomerSearchInput';
import { useBookingForm } from '../BookingFormContext';

export function CustomerStep() {
  const {
    customerTab,
    setCustomerTab,
    selectedCustomerId,
    setSelectedCustomerId,
    newCustomer,
    updateNewCustomer,
    customers,
  } = useBookingForm();

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
            
            <TabsContent value="existing" className="mt-6">
              <CustomerSearchInput
                customers={customers || []}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={setSelectedCustomerId}
                placeholder="Type to search customers..."
              />
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
