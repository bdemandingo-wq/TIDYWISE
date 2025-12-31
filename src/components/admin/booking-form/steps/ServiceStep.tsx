import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, CheckCircle, DollarSign, PawPrint, Home, Ruler, BedDouble } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookingForm } from '../BookingFormContext';
import { useServicePricing } from '@/hooks/useServicePricing';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { 
  squareFootageRanges, 
  bedroomOptions, 
  bathroomOptions, 
  frequencyOptions
} from '@/data/pricingData';

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
    totalAmount,
    setTotalAmount,
    pricingMode,
    setPricingMode,
    homeCondition,
    setHomeCondition,
    petOption,
    setPetOption,
    conditionTotal,
    petTotal,
    selectedService,
    calculatedPrice,
  } = useBookingForm();

  // Use service-specific pricing
  const { getServicePricing, loading: pricingLoading } = useServicePricing();
  const { settings: orgSettings } = useOrganizationSettings();
  
  // Get pricing for selected service
  const servicePricing = selectedServiceId ? getServicePricing(selectedServiceId) : null;
  
  // Use service-specific extras, pets, condition options or defaults
  const extras = servicePricing?.extras || [];
  const petOptions = servicePricing?.pet_options || [];
  const homeConditionOptions = servicePricing?.home_condition_options || [];

  const totalAddOns = extrasTotal + conditionTotal + petTotal;
  
  // Check visibility settings
  const showSqft = orgSettings?.show_sqft_on_booking !== false;
  const showBedBath = orgSettings?.show_bed_bath_on_booking !== false;
  const showAddons = orgSettings?.show_addons_on_booking !== false;
  const showFrequency = orgSettings?.show_frequency_discount !== false;
  const showPets = orgSettings?.show_pet_options !== false;
  const showCondition = orgSettings?.show_home_condition !== false;

  // If sqft pricing is hidden, force Bed & Bath pricing so totals can compute
  useEffect(() => {
    if (!showSqft && showBedBath && pricingMode !== 'bedroom') {
      setPricingMode('bedroom');
    }
    if (showSqft && pricingMode === 'bedroom' && !showBedBath) {
      setPricingMode('sqft');
    }
  }, [showSqft, showBedBath, pricingMode, setPricingMode]);

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
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Calculated Price Display */}
          {selectedServiceId && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Calculated Price (from pricing sheet)</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                ${calculatedPrice.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Base + extras + condition + pets
              </p>
            </div>
          )}

          {/* Price Override */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Adjust Price (Override)
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Leave empty to use calculated price"
              value={totalAmount > 0 ? totalAmount : ''}
              onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
              className="mt-2 h-11 bg-secondary/30 border-border/50"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter a value only if you want to override the calculated price
            </p>
          </div>

          {/* Pricing Mode Tabs - Only show sqft if enabled */}
          {showSqft ? (
            <div>
              <Label className="text-sm font-medium mb-2 block">Pricing Method</Label>
              <Tabs value={pricingMode} onValueChange={(v) => setPricingMode(v as 'sqft' | 'bedroom')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="sqft" className="flex items-center gap-2">
                    <Ruler className="h-4 w-4" />
                    Square Footage
                  </TabsTrigger>
                  {showBedBath && (
                    <TabsTrigger value="bedroom" className="flex items-center gap-2">
                      <BedDouble className="h-4 w-4" />
                      Bed & Bath
                    </TabsTrigger>
                  )}
                </TabsList>
                
                <TabsContent value="sqft" className="mt-4">
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
                </TabsContent>
                
                {showBedBath && (
                  <TabsContent value="bedroom" className="mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Bedrooms</Label>
                        <Select value={bedrooms} onValueChange={setBedrooms}>
                          <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border-border">
                            {bedroomOptions.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt} Bedroom{opt !== '1' && opt !== '0' ? 's' : ''}</SelectItem>
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
                              <SelectItem key={opt} value={opt}>{opt} Bath{opt !== '1' ? 's' : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Base price calculated from bedroom/bathroom combination
                    </p>
                  </TabsContent>
                )}
              </Tabs>
            </div>
          ) : showBedBath ? (
            /* Bed/Bath only mode when sqft is hidden but bed/bath is enabled */
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Bedrooms</Label>
                <Select value={bedrooms} onValueChange={setBedrooms}>
                  <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {bedroomOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt} Bedroom{opt !== '1' && opt !== '0' ? 's' : ''}</SelectItem>
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
                      <SelectItem key={opt} value={opt}>{opt} Bath{opt !== '1' ? 's' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {/* Always show bed/bath for reference when in sqft mode and bed/bath is enabled */}
          {showSqft && showBedBath && pricingMode === 'sqft' && (
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
          )}

          {showFrequency && (
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
          )}
        </CardContent>
      </Card>

      {/* Home Condition & Pets - only show if enabled */}
      {(showCondition || showPets) && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-6 space-y-5">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Home className="h-4 w-4 text-muted-foreground" />
                Home Condition & Pets
              </Label>
              {(conditionTotal > 0 || petTotal > 0) && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                  +${conditionTotal + petTotal}
                </Badge>
              )}
            </div>
            
            {showCondition && (
              <div>
                <Label className="text-sm font-medium">Home Condition (1-5 scale)</Label>
                <p className="text-xs text-muted-foreground mb-2">5 being the dirtiest - additional charges may apply</p>
                <Select value={homeCondition.toString()} onValueChange={(v) => setHomeCondition(parseInt(v))}>
                  <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {homeConditionOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id.toString()}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{opt.label}</span>
                          {opt.price > 0 && (
                            <span className="text-amber-600 font-medium">+${opt.price}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {showPets && (
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  <PawPrint className="h-4 w-4 text-muted-foreground" />
                  Pets
                </Label>
                <Select value={petOption} onValueChange={setPetOption}>
                  <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {petOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{opt.label}</span>
                          {opt.price > 0 && (
                            <span className="text-amber-600 font-medium">+${opt.price}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Extras - only show if enabled */}
      {showAddons && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm font-medium">Add-On Services</Label>
              {totalAddOns > 0 && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">
                  +${totalAddOns} total
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {extras.map((extra) => (
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
                    <p className="text-xs text-muted-foreground">
                      {extra.note ? extra.note : `$${extra.price}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}