import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookingForm } from '../BookingFormContext';
import { squareFootageRanges, bedroomOptions, bathroomOptions, frequencyOptions, extras as extrasData } from '@/data/pricingData';

export function ServiceStep() {
  const {
    services,
    selectedServiceId,
    setSelectedServiceId,
    squareFootage,
    setSquareFootage,
    bedrooms,
    setBedrooms,
    bathrooms,
    setBathrooms,
    frequency,
    setFrequency,
    selectedExtras,
    toggleExtra,
    extrasTotal,
  } = useBookingForm();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10">
          <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Service Selection</h3>
          <p className="text-sm text-muted-foreground">Choose the service type and property details</p>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6 space-y-5">
          <div>
            <Label className="text-sm font-medium">Service Type *</Label>
            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
              <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {services?.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name} - ${service.price}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium">Square Footage</Label>
            <Select value={squareFootage} onValueChange={setSquareFootage}>
              <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                <SelectValue placeholder="Select sq ft range" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {squareFootageRanges.map((range) => (
                  <SelectItem key={range.label} value={range.label}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Bedrooms</Label>
              <Select value={bedrooms} onValueChange={setBedrooms}>
                <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {bedroomOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Bathrooms</Label>
              <Select value={bathrooms} onValueChange={setBathrooms}>
                <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {bathroomOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {frequencyOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label} {opt.discount > 0 && `(${opt.discount * 100}% off)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Extras */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <Label className="text-sm font-medium">Add-On Services</Label>
            {extrasTotal > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                +${extrasTotal}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {extrasData.map((extra) => (
              <div 
                key={extra.id}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                  selectedExtras.includes(extra.id) 
                    ? "border-primary bg-primary/5 shadow-sm" 
                    : "border-border/50 hover:border-primary/30 hover:bg-secondary/30"
                )}
                onClick={() => toggleExtra(extra.id)}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0",
                  selectedExtras.includes(extra.id)
                    ? "border-primary bg-primary"
                    : "border-border"
                )}>
                  {selectedExtras.includes(extra.id) && (
                    <CheckCircle className="w-3 h-3 text-primary-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{extra.name}</p>
                  <p className="text-xs text-muted-foreground">${extra.price}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
