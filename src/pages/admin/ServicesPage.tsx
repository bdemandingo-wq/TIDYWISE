import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Settings2, AlertTriangle } from 'lucide-react';
import { ServicePricingEditor } from '@/components/admin/ServicePricingEditor';
import { CustomServicesManager } from '@/components/admin/CustomServicesManager';

import { ExtrasPricingManager } from '@/components/admin/ExtrasPricingManager';

export default function ServicesPage() {
  return (
    <AdminLayout
      title="Services & Pricing"
      subtitle="Manage pricing independently for each service category"
    >
      <Tabs defaultValue="custom-services" className="space-y-6">
        <TabsList>
          <TabsTrigger value="custom-services" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Custom Services
          </TabsTrigger>
          <TabsTrigger value="service-pricing" className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Service Pricing
          </TabsTrigger>
          <TabsTrigger value="extras">Add-On Extras</TabsTrigger>
        </TabsList>

        {/* Custom Services Management */}
        <TabsContent value="custom-services" className="space-y-6">
          <CustomServicesManager />
        </TabsContent>

        <TabsContent value="service-pricing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-primary" />
                Important
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                To ensure your public booking form always shows the correct prices, update pricing in this tab.
              </p>
            </CardHeader>
          </Card>
          <ServicePricingEditor />
        </TabsContent>

        <TabsContent value="extras">
          <Card>
            <CardHeader>
              <CardTitle>Add-On Extras</CardTitle>
              <p className="text-sm text-muted-foreground">
                Additional services that can be added to a cleaning. Select a service to edit its add-ons.
              </p>
            </CardHeader>
            <CardContent>
              <ExtrasPricingManager />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
