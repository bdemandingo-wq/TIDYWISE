import { AdminLayout } from '@/components/admin/AdminLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { ServicesMobileBody } from '@/pages/admin/SimpleWiredPages';
import type { ActionChip } from '@/components/portal-v2';
import { matrixToCsv } from '@/lib/orgDataExport';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Settings2, AlertTriangle, CalendarClock, Download, Loader2 } from 'lucide-react';
import { ServicePricingEditor } from '@/components/admin/ServicePricingEditor';
import { CustomServicesManager } from '@/components/admin/CustomServicesManager';
import { CustomFrequenciesManager } from '@/components/admin/CustomFrequenciesManager';
import { ExtrasPricingManager } from '@/components/admin/ExtrasPricingManager';
import { useServicePricing } from '@/hooks/useServicePricing';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { squareFootageRanges } from '@/data/pricingData';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';


export default function ServicesPage() {
  const isMobile = useIsMobile();
  const { organization } = useOrganization();
  const { servicePricing, loading: pricingLoading } = useServicePricing();
  const [downloading, setDownloading] = useState(false);




  const handleDownloadCSV = useCallback(async () => {
    if (!organization?.id) return;
    setDownloading(true);
    try {
      // Fetch all services
      const { data: services } = await supabase
        .from('services')
        .select('id, name')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name');

      if (!services || services.length === 0) {
        toast.error('No services found to export');
        setDownloading(false);
        return;
      }

      /*
        A multi-section sheet, so it is assembled line by line rather than as
        one matrix. Every DATA line goes through matrixToCsv([[…]]) — one row in,
        one escaped line out — instead of being hand-built with template
        literals. The old form pre-wrapped names in quotes without doubling the
        inner ones, so a service called 6" Baseboards ended its own field and
        shifted every price after it.

        Section markers and the fixed ASCII headers are pushed raw: they contain
        no comma, quote or newline, and routing them through the escaper would
        only obscure that they are literals.
      */
      const rows: string[] = [];

      // --- Section 1: Square Footage Pricing ---
      const sqftHeader = ['Service', ...squareFootageRanges.map(r => r.label), 'Minimum Price'];
      rows.push(matrixToCsv([sqftHeader]));

      for (const svc of services) {
        const pricing = servicePricing.get(svc.id);
        const prices = pricing?.sqft_prices || [];
        const min = pricing?.minimum_price ?? '';
        rows.push(matrixToCsv([[
          svc.name,
          ...squareFootageRanges.map((_, i) => prices[i] ?? ''),
          min,
        ]]));
      }

      rows.push(''); // blank line

      // --- Section 2: Bedroom/Bathroom Pricing ---
      rows.push('--- Bedroom/Bathroom Pricing ---');
      rows.push('Service,Bedrooms,Bathrooms,Base Price');
      for (const svc of services) {
        const pricing = servicePricing.get(svc.id);
        const bedroomPricing = pricing?.bedroom_pricing || [];
        for (const bp of bedroomPricing) {
          rows.push(matrixToCsv([[svc.name, bp.bedrooms, bp.bathrooms, bp.basePrice]]));
        }
      }

      rows.push('');

      // --- Section 3: Add-On Extras ---
      rows.push('--- Add-On Extras ---');
      rows.push('Service,Extra Name,Price,Note');
      for (const svc of services) {
        const pricing = servicePricing.get(svc.id);
        const extras = pricing?.extras || [];
        for (const ex of extras) {
          rows.push(matrixToCsv([[svc.name, ex.name, ex.price, ex.note || '']]));
        }
      }

      rows.push('');

      // --- Section 4: Pet Options ---
      rows.push('--- Pet Options ---');
      rows.push('Service,Option,Price');
      for (const svc of services) {
        const pricing = servicePricing.get(svc.id);
        const pets = pricing?.pet_options || [];
        for (const p of pets) {
          rows.push(matrixToCsv([[svc.name, p.label, p.price]]));
        }
      }

      rows.push('');

      // --- Section 5: Home Condition Options ---
      rows.push('--- Home Condition Options ---');
      rows.push('Service,Condition,Price');
      for (const svc of services) {
        const pricing = servicePricing.get(svc.id);
        const conditions = pricing?.home_condition_options || [];
        for (const c of conditions) {
          rows.push(matrixToCsv([[svc.name, c.label, c.price]]));
        }
      }

      // Download
      const csvContent = rows.join('\n');
      const { exportFile } = await import('@/lib/exportFile');
      /* eslint-disable-next-line local/no-device-local-dates -- names an export file with the downloader's own day; no org context here and nothing downstream reads it */
      await exportFile(`service-pricing-${new Date().toISOString().slice(0, 10)}.csv`, csvContent, 'text/csv');
      toast.success('Pricing sheet downloaded');
    } catch (err) {
      console.error('CSV export error:', err);
      toast.error('Failed to download pricing sheet');
    } finally {
      setDownloading(false);
    }
  }, [organization?.id, servicePricing]);

  /* ── Mobile arm ──────────────────────────────────────────────────────
     Desktop untouched below. The phone renders ServicesMobileBody — the same
     component its -v2 route shows — with this page's own toolbar
     actions as chips. Handlers stay here; only rendering moves. */
  const mobileActions: ActionChip[] = [
    { id: 'csv', label: 'Download CSV', icon: <Download className="h-3.5 w-3.5" />, onClick: handleDownloadCSV },
  ];

  if (isMobile) {
    return (
      <AdminLayout title="Services & Pricing" subtitle="Manage pricing independently for each service category">
        <ServicesMobileBody actions={mobileActions} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Services & Pricing"
      subtitle="Manage pricing independently for each service category"
      actions={
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleDownloadCSV}
          disabled={downloading || pricingLoading}
        >
      <SEOHead title="Services | TidyWise" description="Manage your cleaning service offerings" noIndex />
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download CSV
        </Button>
      }
    >
<div className="portal-v2 portal-v2-scroll">
      <Tabs defaultValue="custom-services" className="space-y-6" data-tour-id="services-list">
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none">
          <TabsList className="inline-flex w-max min-w-full sm:w-auto">
            <TabsTrigger value="custom-services" className="flex items-center gap-2 whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Custom Services
            </TabsTrigger>
            <TabsTrigger value="service-pricing" className="flex items-center gap-2 whitespace-nowrap">
              <Settings2 className="w-4 h-4" />
              Service Pricing
            </TabsTrigger>
            <TabsTrigger value="extras" className="whitespace-nowrap">Add-On Extras</TabsTrigger>
            <TabsTrigger value="frequencies" className="flex items-center gap-2 whitespace-nowrap">
              <CalendarClock className="w-4 h-4" />
              Frequencies
            </TabsTrigger>
          </TabsList>
        </div>


        {/* Custom Services Management */}
        <TabsContent value="custom-services" className="space-y-6">
          <CustomServicesManager />
        </TabsContent>

        <TabsContent value="service-pricing" className="space-y-6">
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary font-bold">
                <AlertTriangle className="w-5 h-5" />
                ⚠️ Important
              </CardTitle>
              <p className="text-sm font-semibold text-foreground">
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

        <TabsContent value="frequencies" className="space-y-6">
          <CustomFrequenciesManager />
        </TabsContent>
      </Tabs>
    </div>
</AdminLayout>
  );
}
