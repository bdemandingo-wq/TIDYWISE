import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { extras as defaultExtras } from '@/data/pricingData';
import { Plus, Save, Trash2, Settings2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ServicePricingEditor } from '@/components/admin/ServicePricingEditor';
import { CustomServicesManager } from '@/components/admin/CustomServicesManager';

interface Extra {
  id: string;
  name: string;
  price: number;
  note: string;
  icon?: string;
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

export default function ServicesPage() {
  const [extras, setExtras] = useState<Extra[]>([]);

  // Keep extras local for now (legacy); initialize from defaults.
  useEffect(() => {
    setExtras(defaultExtras);
  }, []);

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
