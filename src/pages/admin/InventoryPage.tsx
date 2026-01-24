import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Package, AlertTriangle, Trash2, Edit, RefreshCw, Settings, MoreVertical } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';

interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  cost_per_unit: number;
  supplier: string | null;
  last_restocked_at: string | null;
  custom_fields: Record<string, any>;
}

interface InventoryCategory {
  id: string;
  name: string;
  organization_id: string;
}


const DEFAULT_CATEGORIES = ['supplies', 'equipment', 'chemicals', 'uniforms', 'other'];

export default function InventoryPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [restockDialogOpen, setRestockDialogOpen] = useState(false);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState('');
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { organization } = useOrganization();

  // Fetch inventory items
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  // Fetch custom categories
  const { data: customCategories = [] } = useQuery({
    queryKey: ['inventory-categories', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('inventory_categories')
        .select('*')
        .eq('organization_id', organization.id)
        .order('name');
      if (error) throw error;
      return data as InventoryCategory[];
    },
    enabled: !!organization?.id,
  });


  // Combine default and custom categories
  const allCategories = [
    ...DEFAULT_CATEGORIES,
    ...customCategories.map(c => c.name).filter(n => !DEFAULT_CATEGORIES.includes(n.toLowerCase()))
  ];

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; category: string; quantity: number; min_quantity: number; cost_per_unit: number; supplier?: string; custom_fields?: Record<string, any> }) => {
      if (!organization?.id) {
        throw new Error('No organization found');
      }
      const { error } = await supabase.from('inventory_items').insert([{ ...data, organization_id: organization.id }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Item added');
      setDialogOpen(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<InventoryItem> & { id: string }) => {
      const { error } = await supabase.from('inventory_items').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Item updated');
      setDialogOpen(false);
      setEditingItem(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Item deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleRestock = () => {
    if (!restockItem || !restockAmount) return;
    const newQuantity = restockItem.quantity + parseInt(restockAmount);
    updateMutation.mutate({
      id: restockItem.id,
      quantity: newQuantity,
      last_restocked_at: new Date().toISOString(),
    });
    setRestockDialogOpen(false);
    setRestockItem(null);
    setRestockAmount('');
  };

  const lowStockItems = items.filter(i => i.quantity <= i.min_quantity);
  const totalValue = items.reduce((sum, i) => sum + (i.quantity * i.cost_per_unit), 0);

  return (
    <AdminLayout
      title="Inventory"
      subtitle={`${items.length} items tracked`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setSettingsDialogOpen(true)}>
            <Settings className="w-4 h-4" />
            Settings
          </Button>
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total Items</span>
            </div>
            <p className="text-2xl font-bold mt-1">{items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Low Stock</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-600">{lowStockItems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Total Value</span>
            </div>
            <p className="text-2xl font-bold mt-1">${totalValue.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Low Stock Alert:</span>
              <span>{lowStockItems.map(i => i.name).join(', ')}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Low Stock Min</TableHead>
                <TableHead className="text-right">Cost/Unit</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No inventory items
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.name}</p>
                        {item.description && (
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{item.category}</TableCell>
                    <TableCell className="text-right">
                      <span className={item.quantity <= item.min_quantity ? 'text-amber-600 font-medium' : ''}>
                        {item.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.min_quantity}
                    </TableCell>
                    <TableCell className="text-right">${item.cost_per_unit.toFixed(2)}</TableCell>
                    <TableCell>{item.supplier || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setRestockItem(item);
                            setRestockDialogOpen(true);
                          }}
                          title="Restock"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingItem(item);
                            setDialogOpen(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            if (confirm('Delete this item?')) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <InventoryDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        item={editingItem}
        categories={allCategories}
        onSave={(data) => {
          if (editingItem) {
            updateMutation.mutate({ id: editingItem.id, ...data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />

      {/* Restock Dialog */}
      <Dialog open={restockDialogOpen} onOpenChange={setRestockDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Restock {restockItem?.name}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Add Quantity</Label>
            <Input
              type="number"
              value={restockAmount}
              onChange={(e) => setRestockAmount(e.target.value)}
              placeholder="0"
            />
            <p className="text-sm text-muted-foreground mt-2">
              Current: {restockItem?.quantity} {restockItem?.unit}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRestock}>Restock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <InventorySettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        categories={customCategories}
        organizationId={organization?.id || ''}
      />
    </AdminLayout>
  );
}

function InventoryDialog({
  open,
  onOpenChange,
  item,
  categories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  categories: string[];
  onSave: (data: { name: string; description?: string; category: string; quantity: number; min_quantity: number; cost_per_unit: number; supplier?: string }) => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'supplies',
    quantity: '0',
    min_quantity: '5',
    cost_per_unit: '0',
    supplier: '',
  });

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        description: item.description || '',
        category: item.category || 'supplies',
        quantity: item.quantity?.toString() || '0',
        min_quantity: item.min_quantity?.toString() || '5',
        cost_per_unit: item.cost_per_unit?.toString() || '0',
        supplier: item.supplier || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        category: 'supplies',
        quantity: '0',
        min_quantity: '5',
        cost_per_unit: '0',
        supplier: '',
      });
    }
  }, [item, open]);

  const handleSubmit = () => {
    if (!formData.name) return;
    onSave({
      ...formData,
      quantity: parseInt(formData.quantity),
      min_quantity: parseInt(formData.min_quantity),
      cost_per_unit: parseFloat(formData.cost_per_unit),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit' : 'Add'} Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat} className="capitalize">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Input
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              />
            </div>
            <div>
              <Label>Low Stock Min Qty</Label>
              <Input
                type="number"
                value={formData.min_quantity}
                onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Cost per Unit</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.cost_per_unit}
              onChange={(e) => setFormData({ ...formData, cost_per_unit: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>{item ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InventorySettingsDialog({
  open,
  onOpenChange,
  categories,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: InventoryCategory[];
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<InventoryCategory | null>(null);

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('inventory_categories').insert([{ name, organization_id: organizationId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      setNewCategoryName('');
      toast.success('Category added');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('inventory_categories').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      setEditingCategory(null);
      toast.success('Category updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      toast.success('Category deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    createCategoryMutation.mutate(newCategoryName.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inventory Categories</DialogTitle>
          <DialogDescription>Manage categories for your inventory items.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Default Categories Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Default Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <Badge key={cat} variant="secondary" className="capitalize">{cat}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">These categories are built-in and cannot be removed.</p>
            </CardContent>
          </Card>

          {/* Custom Categories */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Custom Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No custom categories yet.</p>
              ) : (
                categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-2 border rounded-md">
                    {editingCategory?.id === cat.id ? (
                      <Input
                        value={editingCategory.name}
                        onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                        className="flex-1 mr-2"
                        autoFocus
                      />
                    ) : (
                      <span className="capitalize">{cat.name}</span>
                    )}
                    <div className="flex gap-1">
                      {editingCategory?.id === cat.id ? (
                        <>
                          <Button size="sm" onClick={() => updateCategoryMutation.mutate({ id: cat.id, name: editingCategory.name })}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingCategory(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingCategory(cat)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (confirm('Delete this category?')) {
                                deleteCategoryMutation.mutate(cat.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Add new category */}
              <div className="flex gap-2 pt-2 border-t">
                <Input
                  placeholder="New category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                />
                <Button onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
