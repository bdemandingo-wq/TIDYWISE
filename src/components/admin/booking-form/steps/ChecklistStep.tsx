import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Camera, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useBookingForm } from '../BookingFormContext';
import { useOrganization } from '@/contexts/OrganizationContext';

interface ChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  service_id: string | null;
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    requires_photo: boolean;
  }>;
}

export function ChecklistStep() {
  const { selectedChecklistId, setSelectedChecklistId, selectedServiceId } = useBookingForm();
  const { organization } = useOrganization();

  // Fetch active checklist templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['checklist-templates-active', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select(`
          id,
          name,
          description,
          service_id,
          items:checklist_items(id, title, description, requires_photo, sort_order)
        `)
        .eq('organization_id', organization?.id)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      
      return data.map(t => ({
        ...t,
        items: (t.items || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
      })) as ChecklistTemplate[];
    },
    enabled: !!organization?.id
  });

  // Filter templates: show service-specific ones first, then generic ones
  const availableTemplates = templates.filter(t => 
    !t.service_id || t.service_id === selectedServiceId
  );

  // Auto-select service-specific checklist if available
  const serviceSpecificTemplate = templates.find(t => t.service_id === selectedServiceId);
  
  const selectedTemplate = templates.find(t => t.id === selectedChecklistId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-600/10">
            <ClipboardCheck className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Cleaning Checklist</h3>
            <p className="text-sm text-muted-foreground">Loading templates...</p>
          </div>
        </div>
      </div>
    );
  }

  if (availableTemplates.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-600/10">
            <ClipboardCheck className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Cleaning Checklist</h3>
            <p className="text-sm text-muted-foreground">Optional quality assurance checklist</p>
          </div>
        </div>
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-6 text-center text-muted-foreground">
            <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No checklist templates available.</p>
            <p className="text-sm">Create templates in Settings → Checklists</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-600/10">
          <ClipboardCheck className="h-6 w-6 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Cleaning Checklist</h3>
          <p className="text-sm text-muted-foreground">Optional quality assurance checklist for cleaners</p>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6 space-y-5">
          <div>
            <Label className="text-sm font-medium">Checklist Template</Label>
            <Select 
              value={selectedChecklistId || 'none'} 
              onValueChange={(value) => setSelectedChecklistId(value === 'none' ? null : value)}
            >
              <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                <SelectValue placeholder="No checklist" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="none">No checklist</SelectItem>
                {availableTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <span>{template.name}</span>
                      {template.service_id === selectedServiceId && (
                        <Badge variant="secondary" className="text-xs">
                          Service Match
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        ({template.items.length} items)
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {serviceSpecificTemplate && selectedChecklistId !== serviceSpecificTemplate.id && (
              <p className="text-xs text-muted-foreground mt-2">
                💡 Tip: "{serviceSpecificTemplate.name}" is designed for this service type
              </p>
            )}
          </div>

          {/* Preview selected checklist */}
          {selectedTemplate && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">Checklist Preview</Label>
                <Badge variant="outline">
                  {selectedTemplate.items.length} items
                </Badge>
              </div>
              {selectedTemplate.description && (
                <p className="text-sm text-muted-foreground mb-3">{selectedTemplate.description}</p>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedTemplate.items.map((item, index) => (
                  <div 
                    key={item.id} 
                    className="flex items-start gap-3 p-2 bg-muted/50 rounded-lg"
                  >
                    <CheckCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                    {item.requires_photo && (
                      <Badge variant="outline" className="gap-1 text-xs shrink-0">
                        <Camera className="h-3 w-3" />
                        Photo
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
