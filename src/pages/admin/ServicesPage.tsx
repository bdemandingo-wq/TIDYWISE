import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  cleaningServices as defaultCleaningServices, 
  squareFootageRanges, 
  extras as defaultExtras,
  bedroomPricing as defaultBedroomPricing,
  CleaningService 
} from '@/data/pricingData';
import { Home, Sparkles, Truck, HardHat, Plus, Pencil, Save, Trash2, Bed } from 'lucide-react';
import { toast } from 'sonner';

interface Extra {
  id: string;
  name: string;
  price: number;
  note: string;
  icon?: string;
}

interface BedroomPricingItem {
  bedrooms: string;
  bathrooms: string;
  basePrice: number;
}

const serviceIcons: Record<string, React.ReactNode> = {
  deep_clean: <Sparkles className="w-5 h-5" />,
  standard_clean: <Home className="w-5 h-5" />,
  monthly_clean: <Home className="w-5 h-5" />,
  biweekly_clean: <Home className="w-5 h-5" />,
  weekly_clean: <Home className="w-5 h-5" />,
  move_in_out: <Truck className="w-5 h-5" />,
  construction: <HardHat className="w-5 h-5" />,
};

function EditablePricingTable({ 
  services, 
  onUpdatePrice 
}: { 
  services: CleaningService[];
  onUpdatePrice: (serviceId: string, priceIndex: number, newPrice: number) => void;
}) {
  const [editingCell, setEditingCell] = useState<{serviceId: string; priceIndex: number} | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleStartEdit = (serviceId: string, priceIndex: number, currentPrice: number) => {
    setEditingCell({ serviceId, priceIndex });
    setEditValue(currentPrice.toString());
  };

  const handleSaveEdit = () => {
    if (editingCell) {
      const newPrice = parseFloat(editValue);
      if (!isNaN(newPrice) && newPrice >= 0) {
        onUpdatePrice(editingCell.serviceId, editingCell.priceIndex, newPrice);
        toast.success("Price updated");
      }
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background min-w-[180px]">Service</TableHead>
            {squareFootageRanges.slice(0, 7).map((range) => (
              <TableHead key={range.maxSqFt} className="text-center min-w-[90px]">
                {range.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((service) => (
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
              {service.prices.slice(0, 7).map((price, index) => (
                <TableCell 
                  key={index} 
                  className="text-center cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => handleStartEdit(service.id, index, price)}
                >
                  {editingCell?.serviceId === service.id && editingCell.priceIndex === index ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      className="w-20 h-8 text-center mx-auto"
                      autoFocus
                      type="number"
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      ${price}
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                    </span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground mt-2">Click any price to edit. Changes are saved locally.</p>
    </div>
  );
}

function EditableExtrasSection({ 
  extras, 
  onUpdateExtra,
  onDeleteExtra,
  onAddExtra
}: { 
  extras: Extra[];
  onUpdateExtra: (id: string, updates: Partial<Extra>) => void;
  onDeleteExtra: (id: string) => void;
  onAddExtra: (extra: Extra) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState({ name: "", price: "" });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newExtra, setNewExtra] = useState({ name: "", price: "" });

  const handleStartEdit = (extra: Extra) => {
    setEditingId(extra.id);
    setEditValue({ name: extra.name, price: extra.price.toString() });
  };

  const handleSaveEdit = (id: string) => {
    const price = parseFloat(editValue.price);
    if (!isNaN(price) && editValue.name) {
      onUpdateExtra(id, { name: editValue.name, price });
      toast.success("Extra updated");
    }
    setEditingId(null);
  };

  const handleAddExtra = () => {
    const price = parseFloat(newExtra.price);
    if (!isNaN(price) && newExtra.name) {
      onAddExtra({
        id: `custom_${Date.now()}`,
        name: newExtra.name,
        price,
        note: ""
      });
      setNewExtra({ name: "", price: "" });
      setIsAddDialogOpen(false);
      toast.success("Extra added");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
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
                  placeholder="e.g., Pet Hair Removal"
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
              <Button onClick={handleAddExtra} className="w-full">
                Add Extra
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {extras.map((extra) => (
          <Card key={extra.id} className="hover:shadow-md transition-shadow relative group">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-6 w-6"
              onClick={() => onDeleteExtra(extra.id)}
            >
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
            <CardContent className="p-6 flex flex-col items-center justify-center text-center h-[140px]">
              {editingId === extra.id ? (
                <div className="space-y-2 w-full">
                  <Input
                    value={editValue.name}
                    onChange={(e) => setEditValue({ ...editValue, name: e.target.value })}
                    className="text-center text-sm"
                  />
                  <Input
                    type="number"
                    value={editValue.price}
                    onChange={(e) => setEditValue({ ...editValue, price: e.target.value })}
                    className="text-center"
                  />
                  <Button size="sm" onClick={() => handleSaveEdit(extra.id)} className="w-full">
                    <Save className="w-3 h-3 mr-1" /> Save
                  </Button>
                </div>
              ) : (
                <>
                  <div 
                    className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() => handleStartEdit(extra)}
                  >
                    <Plus className="w-6 h-6 text-primary" />
                  </div>
                  <h4 
                    className="font-semibold text-base mb-1 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => handleStartEdit(extra)}
                  >
                    {extra.name}
                  </h4>
                  <p className="text-xl font-bold text-primary">${extra.price}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Click any item to edit. Changes are saved locally.</p>
    </div>
  );
}

function EditableBedroomPricingTable({
  pricing,
  onUpdatePrice
}: {
  pricing: BedroomPricingItem[];
  onUpdatePrice: (index: number, newPrice: number) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleStartEdit = (index: number, currentPrice: number) => {
    setEditingIndex(index);
    setEditValue(currentPrice.toString());
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null) {
      const newPrice = parseFloat(editValue);
      if (!isNaN(newPrice) && newPrice >= 0) {
        onUpdatePrice(editingIndex, newPrice);
      }
      setEditingIndex(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditingIndex(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bedrooms</TableHead>
            <TableHead>Bathrooms</TableHead>
            <TableHead className="text-center">Base Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pricing.map((item, index) => (
            <TableRow key={`${item.bedrooms}-${item.bathrooms}`}>
              <TableCell className="font-medium">{item.bedrooms} Bed</TableCell>
              <TableCell>{item.bathrooms} Bath</TableCell>
              <TableCell 
                className="text-center cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => handleStartEdit(index, item.basePrice)}
              >
                {editingIndex === index ? (
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleKeyDown}
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground mt-2">Click any price to edit. Changes are saved locally.</p>
    </div>
  );
}

export default function ServicesPage() {
  const [services, setServices] = useState<CleaningService[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [bedroomPricing, setBedroomPricing] = useState<BedroomPricingItem[]>([]);

  // Load from localStorage or use defaults
  useEffect(() => {
    const savedServices = localStorage.getItem("tidywise_services");
    const savedExtras = localStorage.getItem("tidywise_extras");
    const savedBedroomPricing = localStorage.getItem("tidywise_bedroom_pricing");
    
    if (savedServices) {
      setServices(JSON.parse(savedServices));
    } else {
      setServices(defaultCleaningServices);
    }

    if (savedExtras) {
      setExtras(JSON.parse(savedExtras));
    } else {
      setExtras(defaultExtras);
    }

    if (savedBedroomPricing) {
      setBedroomPricing(JSON.parse(savedBedroomPricing));
    } else {
      setBedroomPricing(defaultBedroomPricing);
    }
  }, []);

  // Save to localStorage whenever services change
  useEffect(() => {
    if (services.length > 0) {
      localStorage.setItem("tidywise_services", JSON.stringify(services));
    }
  }, [services]);

  useEffect(() => {
    if (extras.length > 0) {
      localStorage.setItem("tidywise_extras", JSON.stringify(extras));
    }
  }, [extras]);

  useEffect(() => {
    if (bedroomPricing.length > 0) {
      localStorage.setItem("tidywise_bedroom_pricing", JSON.stringify(bedroomPricing));
    }
  }, [bedroomPricing]);

  const handleUpdatePrice = (serviceId: string, priceIndex: number, newPrice: number) => {
    setServices(prev => prev.map(service => {
      if (service.id === serviceId) {
        const newPrices = [...service.prices];
        newPrices[priceIndex] = newPrice;
        return { ...service, prices: newPrices };
      }
      return service;
    }));
  };

  const handleUpdateExtra = (id: string, updates: Partial<Extra>) => {
    setExtras(prev => prev.map(extra => 
      extra.id === id ? { ...extra, ...updates } : extra
    ));
  };

  const handleDeleteExtra = (id: string) => {
    setExtras(prev => prev.filter(extra => extra.id !== id));
    toast.success("Extra deleted");
  };

  const handleAddExtra = (extra: Extra) => {
    setExtras(prev => [...prev, extra]);
  };

  const handleUpdateBedroomPrice = (index: number, newPrice: number) => {
    setBedroomPricing(prev => prev.map((item, i) => 
      i === index ? { ...item, basePrice: newPrice } : item
    ));
    toast.success("Price updated");
  };

  return (
    <AdminLayout
      title="Services & Pricing"
      subtitle="Square footage-based pricing for all cleaning services"
    >
      <Tabs defaultValue="pricing-table" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pricing-table">Full Pricing Table</TabsTrigger>
          <TabsTrigger value="bed-bath">Bed & Bath Pricing</TabsTrigger>
          <TabsTrigger value="extras">Add-On Extras</TabsTrigger>
        </TabsList>

        <TabsContent value="pricing-table">
          <Card>
            <CardHeader>
              <CardTitle>Complete Pricing by Square Footage</CardTitle>
              <p className="text-sm text-muted-foreground">
                Click any price to edit.
              </p>
            </CardHeader>
            <CardContent>
              <EditablePricingTable 
                services={services} 
                onUpdatePrice={handleUpdatePrice}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bed-bath">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bed className="w-5 h-5" />
                Bedroom & Bathroom Pricing
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Base prices by bedroom and bathroom count. Click any price to edit.
              </p>
            </CardHeader>
            <CardContent>
              <EditableBedroomPricingTable 
                pricing={bedroomPricing}
                onUpdatePrice={handleUpdateBedroomPrice}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extras">
          <Card>
            <CardHeader>
              <CardTitle>Add-On Extras</CardTitle>
              <p className="text-sm text-muted-foreground">
                Additional services that can be added to any cleaning. Click to edit or add new ones.
              </p>
            </CardHeader>
            <CardContent>
              <EditableExtrasSection 
                extras={extras}
                onUpdateExtra={handleUpdateExtra}
                onDeleteExtra={handleDeleteExtra}
                onAddExtra={handleAddExtra}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
