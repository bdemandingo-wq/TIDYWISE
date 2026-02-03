import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Save, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useServicePricing } from "@/hooks/useServicePricing";

interface Extra {
  id: string;
  name: string;
  price: number;
  note: string;
  icon?: string;
}

interface Service {
  id: string;
  name: string;
}

function EditableExtrasSection({
  extras,
  onUpdateExtra,
  onDeleteExtra,
  onAddExtra,
  saving,
}: {
  extras: Extra[];
  onUpdateExtra: (id: string, updates: Partial<Extra>) => void;
  onDeleteExtra: (id: string) => void;
  onAddExtra: (extra: Extra) => void;
  saving: boolean;
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
    if (Number.isNaN(price) || !editValue.name.trim()) return;
    onUpdateExtra(id, { name: editValue.name.trim(), price });
    setEditingId(null);
  };

  const handleAddExtra = () => {
    const price = parseFloat(newExtra.price);
    if (Number.isNaN(price) || !newExtra.name.trim()) return;
    onAddExtra({
      id: `custom_${Date.now()}`,
      name: newExtra.name.trim(),
      price,
      note: "",
    });
    setNewExtra({ name: "", price: "" });
    setIsAddDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Changes here sync to the booking form for the selected service.
        </p>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
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
              <Button onClick={handleAddExtra} className="w-full" disabled={saving}>
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
              disabled={saving}
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
                    disabled={saving}
                  />
                  <Input
                    type="number"
                    value={editValue.price}
                    onChange={(e) => setEditValue({ ...editValue, price: e.target.value })}
                    className="text-center"
                    disabled={saving}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSaveEdit(extra.id)}
                    className="w-full"
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3 mr-1" />
                    )}
                    Save
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
    </div>
  );
}

export function ExtrasPricingManager() {
  const { organization } = useOrganization();
  const { servicePricing, getServicePricing, saveServicePricing, loading: pricingLoading } = useServicePricing();

  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [extras, setExtras] = useState<Extra[]>([]);
  const [saving, setSaving] = useState(false);

  const isLoading = pricingLoading;

  useEffect(() => {
    const fetchServices = async () => {
      if (!organization?.id) return;
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.error("Error fetching services:", error);
        toast.error("Failed to load services");
        return;
      }

      const list = (data || []) as Service[];
      setServices(list);
      if (!selectedServiceId && list.length > 0) setSelectedServiceId(list[0].id);
    };

    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  // Keep local extras in sync with backend pricing for selected service
  useEffect(() => {
    if (!selectedServiceId) return;
    const pricing = getServicePricing(selectedServiceId);
    setExtras((pricing.extras || []) as Extra[]);
  }, [selectedServiceId, servicePricing, getServicePricing]);

  const persistExtras = async (nextExtras: Extra[], successMessage: string) => {
    if (!organization?.id || !selectedServiceId) return;
    setSaving(true);
    setExtras(nextExtras);

    const ok = await saveServicePricing(selectedServiceId, { extras: nextExtras });
    setSaving(false);

    if (!ok) {
      toast.error("Could not save extras. Please try again.");
      return;
    }

    toast.success(successMessage);
  };

  const handleUpdateExtra = (id: string, updates: Partial<Extra>) => {
    const next = extras.map((e) => (e.id === id ? { ...e, ...updates } : e));
    void persistExtras(next, "Extra saved");
  };

  const handleDeleteExtra = (id: string) => {
    const next = extras.filter((e) => e.id !== id);
    void persistExtras(next, "Extra deleted");
  };

  const handleAddExtra = (extra: Extra) => {
    const next = [...extras, extra];
    void persistExtras(next, "Extra added");
  };

  const selectedServiceName = useMemo(
    () => services.find((s) => s.id === selectedServiceId)?.name,
    [services, selectedServiceId]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Service</Label>
        <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a service" />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedServiceName && (
          <p className="text-xs text-muted-foreground">
            Editing extras for: <span className="font-medium">{selectedServiceName}</span>
          </p>
        )}
      </div>

      <EditableExtrasSection
        extras={extras}
        onUpdateExtra={handleUpdateExtra}
        onDeleteExtra={handleDeleteExtra}
        onAddExtra={handleAddExtra}
        saving={saving}
      />
    </div>
  );
}
