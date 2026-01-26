import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CheckCircle, Camera, ClipboardCheck, Loader2 } from 'lucide-react';
import { BookingPhotoUpload } from './BookingPhotoUpload';

interface BookingChecklistProps {
  bookingId: string;
  staffId: string;
  onComplete?: () => void;
}

interface ChecklistItem {
  id: string;
  title: string;
  is_completed: boolean;
  notes: string | null;
  photo_url: string | null;
  checklist_item_id: string | null;
  requires_photo?: boolean;
}

export function BookingChecklist({ bookingId, staffId, onComplete }: BookingChecklistProps) {
  const queryClient = useQueryClient();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Fetch booking service info
  const { data: bookingService } = useQuery({
    queryKey: ['booking-service', bookingId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bookings')
        .select('service:services(name)')
        .eq('id', bookingId)
        .single();
      return data?.service;
    },
  });

  // Fetch or create booking checklist
  const { data: checklist, isLoading } = useQuery({
    queryKey: ['booking-checklist', bookingId],
    queryFn: async () => {
      // First check if a checklist exists
      const { data: existing } = await supabase
        .from('booking_checklists')
        .select(`
          id,
          completed_at,
          booking_checklist_items(
            id,
            title,
            is_completed,
            notes,
            photo_url,
            checklist_item_id
          )
        `)
        .eq('booking_id', bookingId)
        .single();

      if (existing) {
        return existing;
      }

      // Get the booking's service to find a matching template
      const { data: booking } = await supabase
        .from('bookings')
        .select('service_id, service:services(name)')
        .eq('id', bookingId)
        .single();

      // Find a matching template - prioritize service-specific templates
      const baseTemplateQuery = () => supabase
        .from('checklist_templates')
        .select(`
          id,
          service_id,
          service:services(name),
          checklist_items(id, title, requires_photo, sort_order)
        `)
        .eq('is_active', true);

      // First try to find a service-specific template by exact service_id
      let serviceTemplate = null;
      if (booking?.service_id) {
        const { data: exactMatch } = await baseTemplateQuery()
          .eq('service_id', booking.service_id)
          .limit(1)
          .maybeSingle();
        
        serviceTemplate = exactMatch;
        
        // If no exact match, try to match by service NAME
        // This handles cases where there are duplicate services with same name but different IDs
        if (!serviceTemplate && booking?.service?.name) {
          const { data: allTemplates } = await baseTemplateQuery()
            .not('service_id', 'is', null);
          
          // Find a template whose linked service has the same name
          serviceTemplate = allTemplates?.find(
            (t: any) => t.service?.name?.toLowerCase() === booking.service.name.toLowerCase()
          ) || null;
        }

        if (serviceTemplate) {
          // Use service-specific template
          const { data: newChecklist, error: createError } = await supabase
            .from('booking_checklists')
            .insert({
              booking_id: bookingId,
              staff_id: staffId,
              template_id: serviceTemplate.id,
            })
            .select()
            .single();

          if (createError) throw createError;

          const templateItems = (serviceTemplate.checklist_items || []) as Array<{
            id: string;
            title: string;
            requires_photo: boolean;
            sort_order: number;
          }>;

          const sortedItems = [...templateItems].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

          await supabase
            .from('booking_checklist_items')
            .insert(
              sortedItems.map((item) => ({
                booking_checklist_id: newChecklist.id,
                checklist_item_id: item.id,
                title: item.title,
                is_completed: false,
              }))
            );

          const { data: refetched } = await supabase
            .from('booking_checklists')
            .select(`
              id,
              completed_at,
              booking_checklist_items(
                id,
                title,
                is_completed,
                notes,
                photo_url,
                checklist_item_id
              )
            `)
            .eq('id', newChecklist.id)
            .single();

          return refetched;
        }
      }

      // Fall back to default template (no service_id)
      const { data: template } = await supabase
        .from('checklist_templates')
        .select(`
          id,
          checklist_items(id, title, requires_photo, sort_order)
        `)
        .eq('is_active', true)
        .is('service_id', null)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();

      if (!template) {
        // Create a default checklist if no template exists
        const { data: newChecklist, error: createError } = await supabase
          .from('booking_checklists')
          .insert({
            booking_id: bookingId,
            staff_id: staffId,
          })
          .select()
          .single();

        if (createError) throw createError;

        // Add default items
        const defaultItems = [
          'Dust all surfaces',
          'Vacuum floors',
          'Mop hard floors',
          'Clean bathrooms',
          'Clean kitchen',
          'Empty trash bins',
          'Final walkthrough',
        ];

        const { error: itemsError } = await supabase
          .from('booking_checklist_items')
          .insert(
            defaultItems.map((title) => ({
              booking_checklist_id: newChecklist.id,
              title,
              is_completed: false,
            }))
          );

        if (itemsError) throw itemsError;

        // Refetch
        const { data: refetched } = await supabase
          .from('booking_checklists')
          .select(`
            id,
            completed_at,
            booking_checklist_items(
              id,
              title,
              is_completed,
              notes,
              photo_url,
              checklist_item_id
            )
          `)
          .eq('id', newChecklist.id)
          .single();

        return refetched;
      }

      // Create checklist from template
      const { data: newChecklist, error: createError } = await supabase
        .from('booking_checklists')
        .insert({
          booking_id: bookingId,
          staff_id: staffId,
          template_id: template.id,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Add items from template
      const templateItems = (template.checklist_items || []) as Array<{
        id: string;
        title: string;
        requires_photo: boolean;
        sort_order: number;
      }>;

      const sortedItems = [...templateItems].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      const { error: itemsError } = await supabase
        .from('booking_checklist_items')
        .insert(
          sortedItems.map((item) => ({
            booking_checklist_id: newChecklist.id,
            checklist_item_id: item.id,
            title: item.title,
            is_completed: false,
          }))
        );

      if (itemsError) throw itemsError;

      // Refetch
      const { data: refetched } = await supabase
        .from('booking_checklists')
        .select(`
          id,
          completed_at,
          booking_checklist_items(
            id,
            title,
            is_completed,
            notes,
            photo_url,
            checklist_item_id
          )
        `)
        .eq('id', newChecklist.id)
        .single();

      return refetched;
    },
  });

  // Toggle item completion
  const toggleItem = useMutation({
    mutationFn: async ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) => {
      const { error } = await supabase
        .from('booking_checklist_items')
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-checklist', bookingId] });
    },
    onError: () => {
      toast.error('Failed to update item');
    },
  });

  // Update item notes
  const updateNotes = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) => {
      const { error } = await supabase
        .from('booking_checklist_items')
        .update({ notes })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-checklist', bookingId] });
      toast.success('Notes saved');
    },
    onError: () => {
      toast.error('Failed to save notes');
    },
  });

  // Complete checklist
  const completeChecklist = useMutation({
    mutationFn: async () => {
      if (!checklist?.id) throw new Error('No checklist found');

      const { error } = await supabase
        .from('booking_checklists')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', checklist.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-checklist', bookingId] });
      toast.success('Checklist completed!');
      onComplete?.();
    },
    onError: () => {
      toast.error('Failed to complete checklist');
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2">Loading checklist...</p>
        </CardContent>
      </Card>
    );
  }

  const items = (checklist?.booking_checklist_items || []) as ChecklistItem[];
  const completedCount = items.filter((item) => item.is_completed).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;
  const isCompleted = checklist?.completed_at != null;
  const allItemsComplete = items.length > 0 && completedCount === items.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Cleaning Checklist</CardTitle>
            </div>
            {bookingService?.name && (
              <Badge variant="outline" className="w-fit text-xs">
                {bookingService.name}
              </Badge>
            )}
          </div>
          {isCompleted ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="w-3 h-3 mr-1" />
              Completed
            </Badge>
          ) : (
            <Badge variant="secondary">
              {completedCount}/{items.length}
            </Badge>
          )}
        </div>
        <Progress value={progress} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`p-3 rounded-lg border transition-colors ${
              item.is_completed ? 'bg-muted/50 border-muted' : 'bg-card border-border'
            }`}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={item.is_completed}
                onCheckedChange={(checked) =>
                  toggleItem.mutate({ itemId: item.id, isCompleted: checked as boolean })
                }
                disabled={isCompleted}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    item.is_completed ? 'line-through text-muted-foreground' : ''
                  }`}
                >
                  {item.title}
                </p>
                {item.notes && (
                  <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                )}
              </div>
              {!isCompleted && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                >
                  <Camera className="w-4 h-4" />
                </Button>
              )}
            </div>

            {expandedItem === item.id && !isCompleted && (
              <div className="mt-3 pl-7 space-y-3">
                <Textarea
                  placeholder="Add notes..."
                  defaultValue={item.notes || ''}
                  onBlur={(e) => {
                    if (e.target.value !== (item.notes || '')) {
                      updateNotes.mutate({ itemId: item.id, notes: e.target.value });
                    }
                  }}
                  className="text-sm"
                  rows={2}
                />
                <BookingPhotoUpload
                  bookingId={bookingId}
                  staffId={staffId}
                />
              </div>
            )}
          </div>
        ))}

        {!isCompleted && allItemsComplete && (
          <Button
            className="w-full mt-4"
            onClick={() => completeChecklist.mutate()}
            disabled={completeChecklist.isPending}
          >
            {completeChecklist.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Mark Checklist Complete
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
