import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useServicePricing, ServicePricingData } from '@/hooks/useServicePricing';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { calculateBasePrice } from '@/lib/pricingEngine';
import { 
  squareFootageRanges,
  bedroomPricing as defaultBedroomPricing,
  extras as defaultExtras,
  petOptions as defaultPetOptions,
  homeConditionOptions as defaultHomeConditionOptions,
} from '@/data/pricingData';
import { Save, Pencil, Plus, Trash2, Loader2, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Service {
  id: string;
  name: string;
}

export function ServicePricingEditor() {
  const { organization } = useOrganization();
  const { getServicePricing, saveServicePricing, loading: pricingLoading, refetch } = useServicePricing();
  const { settings: orgSettings, saveSettings: saveOrgSettings, loading: settingsLoading } = useOrganizationSettings();
  const combinedPricingEnabled = !!orgSettings?.combined_pricing_enabled;
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [currentPricing, setCurrentPricing] = useState<ServicePricingData | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingCombined, setTogglingCombined] = useState(false);
  const [editingCell, setEditingCell] = useState<{ type: string; index: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAddExtraOpen, setIsAddExtraOpen] = useState(false);
  const [newExtra, setNewExtra] = useState({ name: '', price: '' });
  const [isAddPetOpen, setIsAddPetOpen] = useState(false);
  const [newPet, setNewPet] = useState({ label: '', price: '' });
  const [isAddConditionOpen, setIsAddConditionOpen] = useState(false);
  const [newCondition, setNewCondition] = useState({ label: '', price: '' });
  const [isAddBedroomOpen, setIsAddBedroomOpen] = useState(false);
  const [newBedroom, setNewBedroom] = useState({ bedrooms: '', bathrooms: '', price: '' });
  const seededOnceRef = useRef(false);

  // ── Combined Pricing Mode preview state ───────────────────────────────────
  // 1500 sqft / 3 bed / 2.5 bath defaults map directly into the default
  // bed/bath grid ($230) and the "Up to 1500 sf" tier. Stored locally only —
  // never written to org settings.
  const [previewSqftLabel, setPreviewSqftLabel] = useState<string>(
    () =>
      squareFootageRanges.find((r) => r.maxSqFt === 1500)?.label ??
      squareFootageRanges[Math.floor(squareFootageRanges.length / 2)]?.label ??
      squareFootageRanges[0].label,
  );
  const [previewBeds, setPreviewBeds] = useState<string>('3');
  const [previewBaths, setPreviewBaths] = useState<string>('2.5');

  // Turn-off confirmation
  const [turnOffOpen, setTurnOffOpen] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [usageCountLoading, setUsageCountLoading] = useState(false);

  // Seed-defaults dialog (only when turning ON with an empty grid)
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);

  // Fetch services from database
  useEffect(() => {
    async function fetchServices() {
      if (!organization?.id) return;
      
      const { data, error } = await supabase
        .from('services')
        .select('id, name')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        console.error('Error fetching services:', error);
        return;
      }
      
      setServices(data || []);
      if (data && data.length > 0 && !selectedServiceId) {
        setSelectedServiceId(data[0].id);
      }
    }
    
    fetchServices();
  }, [organization?.id]);

  // Load pricing when service changes
  useEffect(() => {
    if (selectedServiceId) {
      const pricing = getServicePricing(selectedServiceId);
      setCurrentPricing(pricing);
    }
  }, [selectedServiceId, getServicePricing, pricingLoading]);

  const handleSave = async () => {
    if (!selectedServiceId || !currentPricing) return;
    
    setSaving(true);
    const success = await saveServicePricing(selectedServiceId, currentPricing);
    setSaving(false);
    
    if (success) {
      toast.success('Pricing saved successfully');
      refetch();
    } else {
      toast.error('Failed to save pricing');
    }
  };

  const handleSqftPriceEdit = (index: number, newPrice: number) => {
    if (!currentPricing) return;
    const newPrices = [...currentPricing.sqft_prices];
    newPrices[index] = newPrice;
    setCurrentPricing({ ...currentPricing, sqft_prices: newPrices });
    setEditingCell(null);
  };

  const handleBedroomPriceEdit = (index: number, newPrice: number) => {
    if (!currentPricing) return;
    const newPricing = [...currentPricing.bedroom_pricing];
    newPricing[index] = { ...newPricing[index], basePrice: newPrice };
    setCurrentPricing({ ...currentPricing, bedroom_pricing: newPricing });
    setEditingCell(null);
  };

  const handleDeleteBedroom = (index: number) => {
    if (!currentPricing) return;
    const newPricing = currentPricing.bedroom_pricing.filter((_, i) => i !== index);
    setCurrentPricing({ ...currentPricing, bedroom_pricing: newPricing });
  };

  const handleAddBedroom = () => {
    if (!currentPricing || !newBedroom.bedrooms || !newBedroom.bathrooms || !newBedroom.price) return;
    const bedroomItem = {
      bedrooms: newBedroom.bedrooms,
      bathrooms: newBedroom.bathrooms,
      basePrice: parseFloat(newBedroom.price),
    };
    setCurrentPricing({ ...currentPricing, bedroom_pricing: [...currentPricing.bedroom_pricing, bedroomItem] });
    setNewBedroom({ bedrooms: '', bathrooms: '', price: '' });
    setIsAddBedroomOpen(false);
  };

  const handleExtraEdit = (index: number, field: 'name' | 'price', value: string | number) => {
    if (!currentPricing) return;
    const newExtras = [...currentPricing.extras];
    newExtras[index] = { ...newExtras[index], [field]: value };
    setCurrentPricing({ ...currentPricing, extras: newExtras });
    setEditingCell(null);
  };

  const handleDeleteExtra = (index: number) => {
    if (!currentPricing) return;
    const newExtras = currentPricing.extras.filter((_, i) => i !== index);
    setCurrentPricing({ ...currentPricing, extras: newExtras });
  };

  const handleAddExtra = () => {
    if (!currentPricing || !newExtra.name || !newExtra.price) return;
    const extra = {
      id: `custom_${Date.now()}`,
      name: newExtra.name,
      price: parseFloat(newExtra.price),
      note: '',
    };
    setCurrentPricing({ ...currentPricing, extras: [...currentPricing.extras, extra] });
    setNewExtra({ name: '', price: '' });
    setIsAddExtraOpen(false);
  };

  const handlePetOptionEdit = (index: number, newPrice: number) => {
    if (!currentPricing) return;
    const newOptions = [...currentPricing.pet_options];
    newOptions[index] = { ...newOptions[index], price: newPrice };
    setCurrentPricing({ ...currentPricing, pet_options: newOptions });
    setEditingCell(null);
  };

  const handleConditionEdit = (index: number, newPrice: number) => {
    if (!currentPricing) return;
    const newOptions = [...currentPricing.home_condition_options];
    newOptions[index] = { ...newOptions[index], price: newPrice };
    setCurrentPricing({ ...currentPricing, home_condition_options: newOptions });
    setEditingCell(null);
  };

  const handleDeletePet = (index: number) => {
    if (!currentPricing) return;
    const newOptions = currentPricing.pet_options.filter((_, i) => i !== index);
    setCurrentPricing({ ...currentPricing, pet_options: newOptions });
  };

  const handleAddPet = () => {
    if (!currentPricing || !newPet.label || !newPet.price) return;
    const pet = {
      id: `pet_${Date.now()}`,
      label: newPet.label,
      price: parseFloat(newPet.price),
    };
    setCurrentPricing({ ...currentPricing, pet_options: [...currentPricing.pet_options, pet] });
    setNewPet({ label: '', price: '' });
    setIsAddPetOpen(false);
  };

  const handleDeleteCondition = (index: number) => {
    if (!currentPricing) return;
    const newOptions = currentPricing.home_condition_options.filter((_, i) => i !== index);
    setCurrentPricing({ ...currentPricing, home_condition_options: newOptions });
  };

  const handleAddCondition = () => {
    if (!currentPricing || !newCondition.label || !newCondition.price) return;
    const condition = {
      id: Date.now(),
      label: newCondition.label,
      price: parseFloat(newCondition.price),
    };
    setCurrentPricing({ ...currentPricing, home_condition_options: [...currentPricing.home_condition_options, condition] });
    setNewCondition({ label: '', price: '' });
    setIsAddConditionOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, onSave: () => void) => {
    if (e.key === 'Enter') {
      onSave();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const selectedService = services.find(s => s.id === selectedServiceId);

  if (pricingLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Dual-mode live preview. Both columns ALWAYS render so admins can see
  // exactly what flipping the toggle will do. We pass identical inputs and
  // only flip combinedPricingEnabled. Engine is single source of truth for
  // sqftPart / bedBathPart / base — never recompute here.
  // The OFF column uses pricingMode: 'sqft' to reflect the square-footage-
  // first booking flow (see the muted note rendered next to it).
  const previewOff = useMemo(() => {
    if (!currentPricing) return null;
    return calculateBasePrice({
      sqftPrices: currentPricing.sqft_prices,
      bedroomPricing: currentPricing.bedroom_pricing,
      minimumPrice: currentPricing.minimum_price,
      squareFootageLabel: previewSqftLabel,
      bedrooms: previewBeds,
      bathrooms: previewBaths,
      combinedPricingEnabled: false,
      pricingMode: 'sqft',
    });
  }, [currentPricing, previewSqftLabel, previewBeds, previewBaths]);

  const previewOn = useMemo(() => {
    if (!currentPricing) return null;
    return calculateBasePrice({
      sqftPrices: currentPricing.sqft_prices,
      bedroomPricing: currentPricing.bedroom_pricing,
      minimumPrice: currentPricing.minimum_price,
      squareFootageLabel: previewSqftLabel,
      bedrooms: previewBeds,
      bathrooms: previewBaths,
      combinedPricingEnabled: true,
    });
  }, [currentPricing, previewSqftLabel, previewBeds, previewBaths]);

  const previewDelta = (previewOn?.base ?? 0) - (previewOff?.base ?? 0);

  // Workhorse — actually flips the org setting and (optionally) seeds.
  const performToggleCombined = async (next: boolean, seed: boolean) => {
    if (togglingCombined) return;
    setTogglingCombined(true);
    try {
      const ok = await saveOrgSettings({ combined_pricing_enabled: next });
      if (!ok) {
        toast.error('Failed to update Combined Pricing Mode');
        return;
      }
      if (next && seed && currentPricing) {
        const seeded = { ...currentPricing, bedroom_pricing: defaultBedroomPricing };
        setCurrentPricing(seeded);
        await saveServicePricing(selectedServiceId, seeded);
        toast.success('Bed/bath pricing seeded with default values — edit anytime');
      } else {
        toast.success(next ? 'Combined Pricing Mode enabled' : 'Combined Pricing Mode disabled');
      }
    } finally {
      setTogglingCombined(false);
    }
  };

  // Counts recent bookings that "used combined pricing" so the OFF
  // confirmation dialog can show real impact. The bookings table doesn't
  // carry a per-row `combined_pricing_applied` column, so when the org's
  // current setting is ON we use a 30-day booking count as an approximation
  // and label it as such. Returns null if the query fails.
  const loadUsageCount = async () => {
    if (!organization?.id) {
      setUsageCount(null);
      return;
    }
    setUsageCountLoading(true);
    try {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .gte('created_at', since);
      if (error) throw error;
      setUsageCount(count ?? 0);
    } catch (err) {
      console.warn('[ServicePricingEditor] usage count fetch failed:', err);
      setUsageCount(null);
    } finally {
      setUsageCountLoading(false);
    }
  };

  const handleToggleCombined = async (next: boolean) => {
    if (togglingCombined) return;

    if (!next) {
      // Turning OFF — confirm first. Don't touch saveOrgSettings yet.
      setUsageCount(null);
      setTurnOffOpen(true);
      void loadUsageCount();
      return;
    }

    // Turning ON. If the bed/bath grid is empty we offer to seed with defaults.
    const gridEmpty =
      !currentPricing ||
      !currentPricing.bedroom_pricing ||
      currentPricing.bedroom_pricing.length === 0;
    if (gridEmpty) {
      setSeedDialogOpen(true);
      return;
    }

    await performToggleCombined(true, false);
  };

  return (
    <div className="space-y-6">
      {/* Combined Pricing Mode toggle */}
      <Card className="border-primary/30">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="font-semibold">Combined Pricing Mode</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground">
                        <Info className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      When OFF, estimates are calculated from Square Footage tiers only. When ON,
                      estimates add Bedroom/Bath pricing on top of the Square Footage price for a
                      more detailed quote. Bed/bath data is always captured either way.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-sm text-muted-foreground max-w-xl">
                Toggle ON to add bed/bath pricing on top of square footage. Defaults to OFF — your
                current pricing behavior won't change unless you turn this on.
              </p>
            </div>
            <Switch
              checked={combinedPricingEnabled}
              onCheckedChange={handleToggleCombined}
              disabled={togglingCombined || settingsLoading}
            />
          </div>

          {/* Interactive dual-mode preview — both modes always render so admins
              can see exactly what flipping the toggle would do. */}
          {currentPricing && previewOff && previewOn && (
            <div className="mt-4 space-y-3">
              {/* Inputs */}
              <div className="p-3 rounded-lg bg-muted/50 border space-y-3">
                <p className="text-xs text-muted-foreground">
                  Live preview — adjust values to see how each mode prices a sample home.
                  Changes here aren't saved.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Square footage</Label>
                    <Select value={previewSqftLabel} onValueChange={setPreviewSqftLabel}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {squareFootageRanges.map((r) => (
                          <SelectItem key={r.label} value={r.label}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Bedrooms</Label>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      step={1}
                      value={previewBeds}
                      onChange={(e) => setPreviewBeds(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Bathrooms</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      step={0.5}
                      value={previewBaths}
                      onChange={(e) => setPreviewBaths(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Two-column comparison. Active mode gets border-primary;
                  inactive gets a muted border. Both render regardless of state. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <PreviewColumn
                  title="Square footage only"
                  subtitle="Reflects square-footage-first booking flow."
                  result={previewOff}
                  active={!combinedPricingEnabled}
                  showBedBathLine={false}
                />
                <PreviewColumn
                  title="Combined (sqft + bed/bath)"
                  subtitle="Sqft tier + bed/bath grid, added together."
                  result={previewOn}
                  active={combinedPricingEnabled}
                  showBedBathLine
                />
              </div>

              <div className="text-xs">
                <span className="text-muted-foreground">Difference: </span>
                <span
                  className={
                    previewDelta > 0
                      ? 'text-emerald-500 font-semibold'
                      : 'text-muted-foreground'
                  }
                >
                  {previewDelta > 0 ? `+$${previewDelta}` : '$0'}
                </span>
                <span className="text-muted-foreground">
                  {' '}when Combined is ON
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Service Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Service-Specific Pricing</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a service to edit its unique pricing parameters. Changes are saved independently for each service.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label>Select Service Category</Label>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Choose a service..." />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={saving || !selectedServiceId}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
          {selectedService && (
            <Badge variant="secondary" className="mt-3">
              Editing: {selectedService.name}
            </Badge>
          )}
        </CardContent>
      </Card>

      {selectedServiceId && currentPricing && (
        <>
          {/* Square Footage Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Square Footage Pricing</CardTitle>
              <p className="text-sm text-muted-foreground">Click any price to edit</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {squareFootageRanges.map((range, i) => (
                        <TableHead key={range.label} className="text-center min-w-[90px]">
                          {range.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      {squareFootageRanges.map((range, index) => (
                        <TableCell 
                          key={index}
                          className="text-center cursor-pointer hover:bg-secondary/50 transition-colors"
                          onClick={() => {
                            setEditingCell({ type: 'sqft', index });
                            setEditValue((currentPricing.sqft_prices[index] || 0).toString());
                          }}
                        >
                          {editingCell?.type === 'sqft' && editingCell.index === index ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleSqftPriceEdit(index, parseFloat(editValue) || 0)}
                              onKeyDown={(e) => handleKeyDown(e, () => handleSqftPriceEdit(index, parseFloat(editValue) || 0))}
                              className="w-20 h-8 text-center mx-auto"
                              autoFocus
                              type="number"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              ${currentPricing.sqft_prices[index] || 0}
                              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                            </span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <Label>Minimum Price</Label>
                <Input
                  type="number"
                  value={currentPricing.minimum_price}
                  onChange={(e) => setCurrentPricing({ ...currentPricing, minimum_price: parseFloat(e.target.value) || 0 })}
                  className="w-32 mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Bedroom/Bathroom Pricing */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Bedroom & Bathroom Pricing</CardTitle>
                  <p className="text-sm text-muted-foreground">Click any price to edit</p>
                </div>
                <Dialog open={isAddBedroomOpen} onOpenChange={setIsAddBedroomOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Row
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Bedroom/Bathroom Pricing</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Bedrooms</Label>
                        <Input
                          value={newBedroom.bedrooms}
                          onChange={(e) => setNewBedroom({ ...newBedroom, bedrooms: e.target.value })}
                          placeholder="e.g., 4"
                        />
                      </div>
                      <div>
                        <Label>Bathrooms</Label>
                        <Input
                          value={newBedroom.bathrooms}
                          onChange={(e) => setNewBedroom({ ...newBedroom, bathrooms: e.target.value })}
                          placeholder="e.g., 2.5"
                        />
                      </div>
                      <div>
                        <Label>Base Price ($)</Label>
                        <Input
                          type="number"
                          value={newBedroom.price}
                          onChange={(e) => setNewBedroom({ ...newBedroom, price: e.target.value })}
                          placeholder="200"
                        />
                      </div>
                      <Button onClick={handleAddBedroom} className="w-full">Add Pricing Row</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bedrooms</TableHead>
                      <TableHead>Bathrooms</TableHead>
                      <TableHead className="text-center">Base Price</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentPricing.bedroom_pricing.map((item, index) => (
                      <TableRow key={`${item.bedrooms}-${item.bathrooms}-${index}`} className="group">
                        <TableCell className="font-medium">{item.bedrooms} Bed</TableCell>
                        <TableCell>{item.bathrooms} Bath</TableCell>
                        <TableCell 
                          className="text-center cursor-pointer hover:bg-secondary/50 transition-colors"
                          onClick={() => {
                            setEditingCell({ type: 'bedroom', index });
                            setEditValue(item.basePrice.toString());
                          }}
                        >
                          {editingCell?.type === 'bedroom' && editingCell.index === index ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleBedroomPriceEdit(index, parseFloat(editValue) || 0)}
                              onKeyDown={(e) => handleKeyDown(e, () => handleBedroomPriceEdit(index, parseFloat(editValue) || 0))}
                              className="w-24 h-8 text-center mx-auto"
                              autoFocus
                              type="number"
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              ${item.basePrice}
                              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100"
                            onClick={() => handleDeleteBedroom(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Add-On Extras */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Add-On Extras</CardTitle>
                  <p className="text-sm text-muted-foreground">Click to edit prices</p>
                </div>
                <Dialog open={isAddExtraOpen} onOpenChange={setIsAddExtraOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Extra
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Extra</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={newExtra.name}
                          onChange={(e) => setNewExtra({ ...newExtra, name: e.target.value })}
                          placeholder="e.g., Window Cleaning"
                        />
                      </div>
                      <div>
                        <Label>Price ($)</Label>
                        <Input
                          type="number"
                          value={newExtra.price}
                          onChange={(e) => setNewExtra({ ...newExtra, price: e.target.value })}
                          placeholder="25"
                        />
                      </div>
                      <Button onClick={handleAddExtra} className="w-full">Add Extra</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {currentPricing.extras.map((extra, index) => (
                  <div 
                    key={extra.id}
                    className="p-4 rounded-lg border hover:bg-secondary/30 transition-colors relative group"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => handleDeleteExtra(index)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                    <p className="font-medium text-sm mb-1">{extra.name}</p>
                    <div
                      className="cursor-pointer"
                      onClick={() => {
                        setEditingCell({ type: 'extra', index });
                        setEditValue(extra.price.toString());
                      }}
                    >
                      {editingCell?.type === 'extra' && editingCell.index === index ? (
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleExtraEdit(index, 'price', parseFloat(editValue) || 0)}
                          onKeyDown={(e) => handleKeyDown(e, () => handleExtraEdit(index, 'price', parseFloat(editValue) || 0))}
                          className="w-20 h-7 text-center"
                          autoFocus
                          type="number"
                        />
                      ) : (
                        <Badge variant="secondary" className="text-primary font-semibold">
                          ${extra.price}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pet & Condition Options */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Pet Options</CardTitle>
                  <Dialog open={isAddPetOpen} onOpenChange={setIsAddPetOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-full">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Pet Option</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Label</Label>
                          <Input
                            value={newPet.label}
                            onChange={(e) => setNewPet({ ...newPet, label: e.target.value })}
                            placeholder="e.g., Large Dog"
                          />
                        </div>
                        <div>
                          <Label>Price ($)</Label>
                          <Input
                            type="number"
                            value={newPet.price}
                            onChange={(e) => setNewPet({ ...newPet, price: e.target.value })}
                            placeholder="15"
                          />
                        </div>
                        <Button onClick={handleAddPet} className="w-full">Add Pet Option</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {currentPricing.pet_options.map((opt, index) => (
                      <TableRow key={opt.id} className="group">
                        <TableCell>{opt.label}</TableCell>
                        <TableCell 
                          className="text-right cursor-pointer hover:bg-secondary/50"
                          onClick={() => {
                            setEditingCell({ type: 'pet', index });
                            setEditValue(opt.price.toString());
                          }}
                        >
                          {editingCell?.type === 'pet' && editingCell.index === index ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handlePetOptionEdit(index, parseFloat(editValue) || 0)}
                              onKeyDown={(e) => handleKeyDown(e, () => handlePetOptionEdit(index, parseFloat(editValue) || 0))}
                              className="w-20 h-7 text-center ml-auto"
                              autoFocus
                              type="number"
                            />
                          ) : (
                            <span>${opt.price}</span>
                          )}
                        </TableCell>
                        <TableCell className="w-10">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                            onClick={() => handleDeletePet(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Home Condition Options</CardTitle>
                  <Dialog open={isAddConditionOpen} onOpenChange={setIsAddConditionOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-full">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Condition Option</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Label</Label>
                          <Input
                            value={newCondition.label}
                            onChange={(e) => setNewCondition({ ...newCondition, label: e.target.value })}
                            placeholder="e.g., Very Dirty"
                          />
                        </div>
                        <div>
                          <Label>Extra Price ($)</Label>
                          <Input
                            type="number"
                            value={newCondition.price}
                            onChange={(e) => setNewCondition({ ...newCondition, price: e.target.value })}
                            placeholder="50"
                          />
                        </div>
                        <Button onClick={handleAddCondition} className="w-full">Add Condition</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {currentPricing.home_condition_options.map((opt, index) => (
                      <TableRow key={opt.id} className="group">
                        <TableCell className="text-sm">{opt.label}</TableCell>
                        <TableCell 
                          className="text-right cursor-pointer hover:bg-secondary/50"
                          onClick={() => {
                            setEditingCell({ type: 'condition', index });
                            setEditValue(opt.price.toString());
                          }}
                        >
                          {editingCell?.type === 'condition' && editingCell.index === index ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleConditionEdit(index, parseFloat(editValue) || 0)}
                              onKeyDown={(e) => handleKeyDown(e, () => handleConditionEdit(index, parseFloat(editValue) || 0))}
                              className="w-20 h-7 text-center ml-auto"
                              autoFocus
                              type="number"
                            />
                          ) : (
                            <span>+${opt.price}</span>
                          )}
                        </TableCell>
                        <TableCell className="w-10">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteCondition(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Turn-off confirmation. Intercepts Switch ON → OFF before saving so
          admins know how many recent bookings would have priced differently. */}
      <AlertDialog open={turnOffOpen} onOpenChange={setTurnOffOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off Combined Pricing Mode?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {usageCountLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Checking recent bookings…
                    </span>
                  ) : usageCount == null ? (
                    <span>
                      Couldn't reach the bookings table. New estimates will revert
                      to square-footage-only.
                    </span>
                  ) : (
                    <span>
                      <span className="font-semibold text-foreground">
                        ~{usageCount} booking{usageCount === 1 ? '' : 's'}
                      </span>{' '}
                      in the last 30 days used combined pricing (approximate —
                      based on bookings created while combined mode was on).
                      New estimates will revert to square-footage-only.
                    </span>
                  )}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togglingCombined || usageCountLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={togglingCombined || usageCountLoading}
              onClick={async () => {
                await performToggleCombined(false, false);
                setTurnOffOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {togglingCombined ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Seed-defaults preview. Only opens when toggling ON with an empty
          bed/bath grid. "Skip" still flips the toggle ON without seeding. */}
      <Dialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seed bed/bath pricing?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            We'll populate this service's bed/bath grid with these starting
            values. You can edit any cell after.
          </p>
          <div className="rounded-md border bg-muted/30 max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bedrooms</TableHead>
                  <TableHead>Bathrooms</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defaultBedroomPricing.slice(0, 6).map((row, i) => (
                  <TableRow key={`${row.bedrooms}-${row.bathrooms}-${i}`}>
                    <TableCell>{row.bedrooms} Bed</TableCell>
                    <TableCell>{row.bathrooms} Bath</TableCell>
                    <TableCell className="text-right">${row.basePrice}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground px-3 py-2">
              + {Math.max(0, defaultBedroomPricing.length - 6)} more rows seeded.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              disabled={togglingCombined}
              onClick={async () => {
                setSeedDialogOpen(false);
                await performToggleCombined(true, false);
              }}
            >
              Skip — I'll add manually
            </Button>
            <Button
              disabled={togglingCombined}
              onClick={async () => {
                setSeedDialogOpen(false);
                await performToggleCombined(true, true);
              }}
            >
              {togglingCombined ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Seed defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper: a single side-by-side preview column. Active mode gets a
// `border-primary` ring; inactive gets the standard muted border so the
// either/or behavior is obvious at a glance. Math breakdown reflects engine
// truth (sqftPart, bedBathPart, base) — no recomputation here.
function PreviewColumn({
  title,
  subtitle,
  result,
  active,
  showBedBathLine,
}: {
  title: string;
  subtitle: string;
  result: { base: number; sqftPart: number; bedBathPart: number };
  active: boolean;
  showBedBathLine: boolean;
}) {
  const subtotal = result.sqftPart + (showBedBathLine ? result.bedBathPart : 0);
  const minimumApplied = result.base > subtotal;
  return (
    <div
      className={
        'p-3 rounded-lg bg-muted/50 transition-colors ' +
        (active
          ? 'border-2 border-primary ring-1 ring-primary/30'
          : 'border border-border')
      }
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {active && (
          <Badge variant="secondary" className="text-[10px] uppercase">
            Active
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>

      <div className="font-mono text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sqft tier</span>
          <span>${result.sqftPart}</span>
        </div>
        {showBedBathLine ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">+ Bed/bath</span>
            <span>${result.bedBathPart}</span>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bed/bath</span>
            <span className="text-muted-foreground italic">not used</span>
          </div>
        )}
        <div className="border-t border-border my-1" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>${subtotal}</span>
        </div>
        {minimumApplied && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Minimum floor</span>
            <span>${result.base}</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Total</span>
        <span className="text-2xl font-bold text-primary">
          ${result.base}
        </span>
      </div>
    </div>
  );
}
