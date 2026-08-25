import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useServicePricing, ServicePricingData } from '@/hooks/useServicePricing';
import { 
  squareFootageRanges,
} from '@/data/pricingData';
import { Save, Pencil, Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { ExcludeParametersCard } from './ExcludeParametersCard';
import { PetsCard } from './PetsCard';


interface Service {
  id: string;
  name: string;
}

type EditingCell = { type: string; index: number } | null;

function SortableConditionRow({
  id,
  opt,
  index,
  editingCell,
  editValue,
  setEditValue,
  setEditingCell,
  onLabelSave,
  onPriceSave,
  onDelete,
  onKeyDown,
}: {
  id: string;
  opt: { id: number | string; label: string; price: number };
  index: number;
  editingCell: EditingCell;
  editValue: string;
  setEditValue: (v: string) => void;
  setEditingCell: (c: EditingCell) => void;
  onLabelSave: (v: string) => void;
  onPriceSave: (v: number) => void;
  onDelete: () => void;
  onKeyDown: (e: React.KeyboardEvent, save: () => void) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: isDragging ? 'hsl(var(--muted))' : undefined,
  };
  return (
    <TableRow ref={setNodeRef} style={style} className="group">
      <TableCell>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Reorder ${opt.label}`}
            className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div
            className="flex-1 cursor-pointer"
            onClick={() => {
              setEditingCell({ type: 'condition-label', index });
              setEditValue(opt.label);
            }}
          >
            {editingCell?.type === 'condition-label' && editingCell.index === index ? (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => onLabelSave(editValue)}
                onKeyDown={(e) => onKeyDown(e, () => onLabelSave(editValue))}
                className="h-7"
                autoFocus
              />
            ) : (
              <span className="inline-flex items-center gap-1">
                {opt.label}
                <Pencil className="w-3 h-3 opacity-50 md:opacity-0 md:group-hover:opacity-50" />
              </span>
            )}
          </div>
        </div>
      </TableCell>
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
            onBlur={() => onPriceSave(parseFloat(editValue) || 0)}
            onKeyDown={(e) => onKeyDown(e, () => onPriceSave(parseFloat(editValue) || 0))}
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
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SortableBedroomRow({
  id,
  item,
  index,
  editingCell,
  editValue,
  setEditValue,
  setEditingCell,
  onPriceSave,
  onDelete,
  onKeyDown,
}: {
  id: string;
  item: { bedrooms: string; bathrooms: string; basePrice: number };
  index: number;
  editingCell: EditingCell;
  editValue: string;
  setEditValue: (v: string) => void;
  setEditingCell: (c: EditingCell) => void;
  onPriceSave: (v: number) => void;
  onDelete: () => void;
  onKeyDown: (e: React.KeyboardEvent, save: () => void) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: isDragging ? 'hsl(var(--muted))' : undefined,
  };
  return (
    <TableRow ref={setNodeRef} style={style} className="group">
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Reorder ${item.bedrooms} bed ${item.bathrooms} bath`}
            className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span>{item.bedrooms} Bed</span>
        </div>
      </TableCell>
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
            onBlur={() => onPriceSave(parseFloat(editValue) || 0)}
            onKeyDown={(e) => onKeyDown(e, () => onPriceSave(parseFloat(editValue) || 0))}
            className="w-24 h-8 text-center mx-auto"
            autoFocus
            type="number"
          />
        ) : (
          <span className="inline-flex items-center gap-1">
            ${item.basePrice}
            <Pencil className="w-3 h-3 opacity-50 md:opacity-0 md:group-hover:opacity-50" />
          </span>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function ServicePricingEditor() {
  const { organization } = useOrganization();
  const { getServicePricing, saveServicePricing, loading: pricingLoading, refetch } = useServicePricing();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [currentPricing, setCurrentPricing] = useState<ServicePricingData | null>(null);
  const [saving, setSaving] = useState(false);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedServiceId is set inside the effect on first load; adding it would clear the user's selection
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

  const handlePetLabelEdit = (index: number, newLabel: string) => {
    if (!currentPricing) return;
    const newOptions = [...currentPricing.pet_options];
    newOptions[index] = { ...newOptions[index], label: newLabel };
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

  const handleConditionLabelEdit = (index: number, newLabel: string) => {
    if (!currentPricing) return;
    const newOptions = [...currentPricing.home_condition_options];
    newOptions[index] = { ...newOptions[index], label: newLabel };
    setCurrentPricing({ ...currentPricing, home_condition_options: newOptions });
    setEditingCell(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleConditionDragEnd = (event: DragEndEvent) => {
    if (!currentPricing) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = currentPricing.home_condition_options;
    const oldIndex = items.findIndex((o) => String(o.id) === String(active.id));
    const newIndex = items.findIndex((o) => String(o.id) === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setCurrentPricing({
      ...currentPricing,
      home_condition_options: arrayMove(items, oldIndex, newIndex),
    });
  };

  const handleBedroomDragEnd = (event: DragEndEvent) => {
    if (!currentPricing) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = currentPricing.bedroom_pricing;
    const oldIndex = parseInt(String(active.id).replace('bed-', ''), 10);
    const newIndex = parseInt(String(over.id).replace('bed-', ''), 10);
    if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return;
    setCurrentPricing({
      ...currentPricing,
      bedroom_pricing: arrayMove(items, oldIndex, newIndex),
    });
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

  return (
    <div className="space-y-6">


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
                      {squareFootageRanges.map((range) => (
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
                              <Pencil className="w-3 h-3 opacity-50 md:opacity-0 md:group-hover:opacity-50" />
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
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                      onDragEnd={handleBedroomDragEnd}
                    >
                      <SortableContext
                        items={currentPricing.bedroom_pricing.map((_, i) => `bed-${i}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {currentPricing.bedroom_pricing.map((item, index) => (
                          <SortableBedroomRow
                            key={`bed-${index}-${item.bedrooms}-${item.bathrooms}`}
                            id={`bed-${index}`}
                            item={item}
                            index={index}
                            editingCell={editingCell}
                            editValue={editValue}
                            setEditValue={setEditValue}
                            setEditingCell={setEditingCell}
                            onPriceSave={(v) => handleBedroomPriceEdit(index, v)}
                            onDelete={() => handleDeleteBedroom(index)}
                            onKeyDown={handleKeyDown}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <ExcludeParametersCard />



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
                      className="absolute top-1 right-1 h-7 w-7 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      onClick={() => handleDeleteExtra(index)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                    <div
                      className="mb-1 cursor-pointer"
                      onClick={() => {
                        setEditingCell({ type: 'extra-name', index });
                        setEditValue(extra.name);
                      }}
                    >
                      {editingCell?.type === 'extra-name' && editingCell.index === index ? (
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleExtraEdit(index, 'name', editValue)}
                          onKeyDown={(e) => handleKeyDown(e, () => handleExtraEdit(index, 'name', editValue))}
                          className="h-7 text-sm"
                          autoFocus
                        />
                      ) : (
                        <p className="font-medium text-sm inline-flex items-center gap-1">
                          {extra.name}
                          <Pencil className="w-3 h-3 opacity-50 md:opacity-0 md:group-hover:opacity-50" />
                        </p>
                      )}
                    </div>
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
            <PetsCard />


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
                            placeholder="e.g., Heavy"
                          />
                        </div>
                        <div>
                          <Label>Price ($)</Label>
                          <Input
                            type="number"
                            value={newCondition.price}
                            onChange={(e) => setNewCondition({ ...newCondition, price: e.target.value })}
                            placeholder="40"
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
                  <TableHeader>
                    <TableRow>
                      <TableHead>Option</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                      onDragEnd={handleConditionDragEnd}
                    >
                      <SortableContext
                        items={currentPricing.home_condition_options.map((o) => String(o.id))}
                        strategy={verticalListSortingStrategy}
                      >
                        {currentPricing.home_condition_options.map((opt, index) => (
                          <SortableConditionRow
                            key={opt.id}
                            id={String(opt.id)}
                            opt={opt}
                            index={index}
                            editingCell={editingCell}
                            editValue={editValue}
                            setEditValue={setEditValue}
                            setEditingCell={setEditingCell}
                            onLabelSave={(v) => handleConditionLabelEdit(index, v)}
                            onPriceSave={(v) => handleConditionEdit(index, v)}
                            onDelete={() => handleDeleteCondition(index)}
                            onKeyDown={handleKeyDown}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
