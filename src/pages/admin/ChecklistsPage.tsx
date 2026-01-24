import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';
import { 
  ClipboardCheck, 
  Plus, 
  Camera, 
  Trash2, 
  GripVertical, 
  Loader2,
  ChevronDown,
  ChevronUp,
  Pencil
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ChecklistItem {
  id?: string;
  title: string;
  description?: string;
  requires_photo: boolean;
  sort_order: number;
}

interface TemplateFormData {
  id?: string;
  name: string;
  description: string;
  service_id: string;
  items: ChecklistItem[];
}

const emptyFormData: TemplateFormData = {
  name: '',
  description: '',
  service_id: '',
  items: []
};

// Sortable Item Component
interface SortableItemProps {
  item: ChecklistItem;
  index: number;
  onRemove: (index: number) => void;
}

function SortableChecklistItem({ item, index, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `item-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-card border rounded-lg"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
      <div className="flex-1">
        <p className="font-medium">{item.title}</p>
        {item.description && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}
      </div>
      {item.requires_photo && (
        <Badge variant="outline" className="gap-1">
          <Camera className="w-3 h-3" />
          Photo
        </Badge>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(index)}
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}

export default function ChecklistsPage() {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(emptyFormData);
  const [newItem, setNewItem] = useState({ title: '', description: '', requires_photo: false });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = parseInt(String(active.id).replace('item-', ''));
      const newIndex = parseInt(String(over.id).replace('item-', ''));

      setFormData(prev => ({
        ...prev,
        items: arrayMove(prev.items, oldIndex, newIndex).map((item, idx) => ({
          ...item,
          sort_order: idx
        }))
      }));
    }
  };

  // Fetch templates with items
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['checklist-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select(`
          *,
          items:checklist_items(*)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(t => ({
        ...t,
        items: t.items?.sort((a: any, b: any) => a.sort_order - b.sort_order) || []
      }));
    }
  });

  // Fetch services
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Create template
  const createTemplate = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      if (!organization?.id) {
        throw new Error('No organization found');
      }
      const { data: template, error } = await supabase
        .from('checklist_templates')
        .insert({
          name: data.name,
          description: data.description,
          service_id: data.service_id || null,
          organization_id: organization.id,
        })
        .select()
        .single();
      
      if (error) throw error;

      // Insert items
      if (data.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('checklist_items')
          .insert(
            data.items.map((item, index) => ({
              template_id: template.id,
              title: item.title,
              description: item.description,
              requires_photo: item.requires_photo,
              sort_order: index
            }))
          );
        if (itemsError) throw itemsError;
      }

      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
      toast.success('Checklist template created!');
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error(`Failed to create template: ${error.message}`);
    }
  });

  // Update template
  const updateTemplate = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      if (!data.id) throw new Error('Template ID required');

      // Update template
      const { error } = await supabase
        .from('checklist_templates')
        .update({
          name: data.name,
          description: data.description,
          service_id: data.service_id || null
        })
        .eq('id', data.id);
      
      if (error) throw error;

      // Delete existing items
      const { error: deleteError } = await supabase
        .from('checklist_items')
        .delete()
        .eq('template_id', data.id);
      
      if (deleteError) throw deleteError;

      // Insert new items
      if (data.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('checklist_items')
          .insert(
            data.items.map((item, index) => ({
              template_id: data.id,
              title: item.title,
              description: item.description || null,
              requires_photo: item.requires_photo,
              sort_order: index
            }))
          );
        if (itemsError) throw itemsError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
      toast.success('Checklist template updated!');
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error(`Failed to update template: ${error.message}`);
    }
  });

  // Toggle template active
  const toggleTemplate = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('checklist_templates')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
    }
  });

  // Delete template
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('checklist_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
      toast.success('Template deleted');
    }
  });

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setFormData(emptyFormData);
    setNewItem({ title: '', description: '', requires_photo: false });
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: any) => {
    setEditingTemplate(template.id);
    setFormData({
      id: template.id,
      name: template.name,
      description: template.description || '',
      service_id: template.service_id || '',
      items: template.items.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        requires_photo: item.requires_photo,
        sort_order: item.sort_order
      }))
    });
    setNewItem({ title: '', description: '', requires_photo: false });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
    setFormData(emptyFormData);
    setNewItem({ title: '', description: '', requires_photo: false });
  };

  const addItemToForm = () => {
    if (!newItem.title.trim()) return;
    setFormData({
      ...formData,
      items: [...formData.items, { ...newItem, sort_order: formData.items.length }]
    });
    setNewItem({ title: '', description: '', requires_photo: false });
  };

  const removeItemFromForm = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = () => {
    if (editingTemplate) {
      updateTemplate.mutate(formData);
    } else {
      createTemplate.mutate(formData);
    }
  };

  const isSubmitting = createTemplate.isPending || updateTemplate.isPending;

  if (isLoading) {
    return (
      <AdminLayout title="Cleaning Checklists" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Cleaning Checklists"
      subtitle="Digital checklists for quality assurance"
      actions={
        <Button className="gap-2" onClick={openCreateDialog}>
          <Plus className="w-4 h-4" />
          Create Checklist
        </Button>
      }
    >
      {/* Dialog for Create/Edit */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Checklist Template' : 'Create Checklist Template'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                placeholder="Standard Home Cleaning Checklist"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Describe what this checklist covers..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Assign to Service (optional)</Label>
              <Select
                value={formData.service_id || "all"}
                onValueChange={value => setFormData({ ...formData, service_id: value === "all" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Checklist Items */}
            <div className="border-t pt-4">
              <Label className="mb-3 block">
                Checklist Items ({formData.items.length})
                {formData.items.length > 1 && (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    Drag to reorder
                  </span>
                )}
              </Label>
              
              {/* Added items list with drag and drop */}
              {formData.items.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={formData.items.map((_, index) => `item-${index}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 mb-4">
                      {formData.items.map((item, index) => (
                        <SortableChecklistItem
                          key={`item-${index}`}
                          item={item}
                          index={index}
                          onRemove={removeItemFromForm}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              
              {/* Add new item form */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <Input
                  placeholder="Item title (e.g., 'Clean kitchen counters')"
                  value={newItem.title}
                  onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItemToForm())}
                />
                <Input
                  placeholder="Optional description"
                  value={newItem.description}
                  onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="requires-photo"
                      checked={newItem.requires_photo}
                      onCheckedChange={(checked) => 
                        setNewItem({ ...newItem, requires_photo: checked as boolean })
                      }
                    />
                    <Label htmlFor="requires-photo" className="flex items-center gap-2 cursor-pointer">
                      <Camera className="w-4 h-4" />
                      Photo suggested (optional)
                    </Label>
                  </div>
                  <Button type="button" size="sm" onClick={addItemToForm} disabled={!newItem.title.trim()}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Item
                  </Button>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!formData.name || formData.items.length === 0 || isSubmitting}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingTemplate 
                ? `Update Checklist (${formData.items.length} items)` 
                : `Create Checklist (${formData.items.length} items)`
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Templates</p>
              <p className="text-2xl font-bold">{templates.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <ClipboardCheck className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{templates.filter(t => t.is_active).length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10">
              <Camera className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Photo Suggested Items</p>
              <p className="text-2xl font-bold">
                {templates.reduce((sum, t) => sum + t.items.filter((i: any) => i.requires_photo).length, 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Templates List */}
      <div className="space-y-4">
        {templates.length === 0 ? (
          <Card className="p-8 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No checklists yet</h3>
            <p className="text-muted-foreground mb-4">Create checklist templates for your cleaning staff</p>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Checklist
            </Button>
          </Card>
        ) : (
          templates.map((template: any) => {
            const service = services.find(s => s.id === template.service_id);
            const isExpanded = expandedTemplate === template.id;
            
            return (
              <Card key={template.id} className="overflow-hidden">
                <div 
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedTemplate(isExpanded ? null : template.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ClipboardCheck className="w-5 h-5 text-primary" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{template.name}</h3>
                          {!template.is_active && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {template.items.length} items
                          {service ? ` • Assigned to: ${service.name}` : ' • Default (all services)'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2 mr-2">
                        <Label htmlFor={`active-${template.id}`} className="text-sm">
                          Active
                        </Label>
                        <Switch
                          id={`active-${template.id}`}
                          checked={template.is_active}
                          onCheckedChange={(checked) => 
                            toggleTemplate.mutate({ id: template.id, is_active: checked })
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(template)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Delete this checklist template?')) {
                            deleteTemplate.mutate(template.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-muted/30">
                    {template.description && (
                      <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                    )}
                    <div className="space-y-2">
                      {template.items.map((item: any, index: number) => (
                        <div key={item.id} className="flex items-center gap-3 p-2 bg-card rounded">
                          <span className="text-sm font-medium text-muted-foreground w-6">
                            {index + 1}.
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.title}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            )}
                          </div>
                          {item.requires_photo && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Camera className="w-3 h-3" />
                              Photo
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </AdminLayout>
  );
}
