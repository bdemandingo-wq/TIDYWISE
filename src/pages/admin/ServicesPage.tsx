import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  cleaningServices, 
  squareFootageRanges, 
  extras,
  CleaningService 
} from '@/data/pricingData';
import { DollarSign, Home, Sparkles, Truck, HardHat, Plus } from 'lucide-react';

const serviceIcons: Record<string, React.ReactNode> = {
  deep_clean: <Sparkles className="w-5 h-5" />,
  standard_clean: <Home className="w-5 h-5" />,
  monthly_clean: <Home className="w-5 h-5" />,
  biweekly_clean: <Home className="w-5 h-5" />,
  weekly_clean: <Home className="w-5 h-5" />,
  move_in_out: <Truck className="w-5 h-5" />,
  construction: <HardHat className="w-5 h-5" />,
};

function ServiceCard({ service }: { service: CleaningService }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
            style={{ backgroundColor: service.color }}
          >
            {serviceIcons[service.id]}
          </div>
          <div>
            <CardTitle className="text-lg">{service.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{service.description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Minimum Price</p>
            <p className="text-2xl font-bold">${service.minimumPrice}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Price Range</p>
            <p className="text-lg font-semibold">
              ${service.prices[0]} - ${service.prices[service.prices.length - 1]}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PricingTable() {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background min-w-[180px]">Service</TableHead>
            {squareFootageRanges.map((range) => (
              <TableHead key={range.maxSqFt} className="text-center min-w-[90px]">
                {range.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cleaningServices.map((service) => (
            <TableRow key={service.id}>
              <TableCell className="sticky left-0 bg-background font-medium">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: service.color }}
                  />
                  {service.name}
                </div>
              </TableCell>
              {service.prices.map((price, index) => (
                <TableCell key={index} className="text-center">
                  ${price}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ExtrasSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {extras.map((extra) => (
        <Card key={extra.id}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold">{extra.name}</h4>
                {extra.note && (
                  <p className="text-sm text-muted-foreground">{extra.note}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-lg">
                <DollarSign className="w-4 h-4" />
                {extra.price}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MinimumPricesSection() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cleaningServices.map((service) => (
        <Card key={service.id}>
          <CardContent className="pt-6 text-center">
            <div 
              className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-white"
              style={{ backgroundColor: service.color }}
            >
              {serviceIcons[service.id]}
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {service.name.split(' ')[0]}
            </p>
            <p className="text-2xl font-bold">${service.minimumPrice}</p>
            <p className="text-xs text-muted-foreground">minimum</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ServicesPage() {
  return (
    <AdminLayout
      title="Services & Pricing"
      subtitle="Square footage-based pricing for all cleaning services"
    >
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pricing-table">Full Pricing Table</TabsTrigger>
          <TabsTrigger value="extras">Add-On Extras</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Service Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cleaningServices.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>

          {/* Minimum Prices */}
          <Card>
            <CardHeader>
              <CardTitle>Minimum Prices</CardTitle>
            </CardHeader>
            <CardContent>
              <MinimumPricesSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing-table">
          <Card>
            <CardHeader>
              <CardTitle>Complete Pricing by Square Footage</CardTitle>
              <p className="text-sm text-muted-foreground">
                Goal: 1 cleaner should produce $50-$70 per hour in revenue
              </p>
            </CardHeader>
            <CardContent>
              <PricingTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extras">
          <Card>
            <CardHeader>
              <CardTitle>Add-On Extras</CardTitle>
              <p className="text-sm text-muted-foreground">
                Additional services that can be added to any cleaning
              </p>
            </CardHeader>
            <CardContent>
              <ExtrasSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
