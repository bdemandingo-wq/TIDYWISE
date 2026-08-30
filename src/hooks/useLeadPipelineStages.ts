import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface LeadPipelineStage {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  position: number;
}

/** Slug used as the lead's `status` value. Must match the DB check on leads.status. */
export function slugifyStageLabel(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function useLeadPipelineStages() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['lead-pipeline-stages', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<LeadPipelineStage[]> => {
      const { data, error } = await supabase
        .from('lead_pipeline_stages')
        .select('*')
        .eq('organization_id', orgId!)
        .order('position', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return (data || []) as LeadPipelineStage[];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['lead-pipeline-stages', orgId] });

  const addStage = useMutation({
    mutationFn: async (label: string) => {
      if (!orgId) throw new Error('No active organization');
      const key = slugifyStageLabel(label);
      if (!key) throw new Error('Please enter a valid section name');
      const { error } = await supabase.from('lead_pipeline_stages').insert({
        organization_id: orgId,
        key,
        label: label.trim(),
        position: (query.data?.length || 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const renameStage = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase
        .from('lead_pipeline_stages')
        .update({ label: label.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteStage = useMutation({
    mutationFn: async (stage: LeadPipelineStage) => {
      if (!orgId) throw new Error('No active organization');
      // Move any leads sitting in this section back to New so they never
      // disappear from the board along with the column.
      const { error: moveError } = await supabase
        .from('leads')
        .update({ status: 'new' })
        .eq('organization_id', orgId)
        .eq('status', stage.key);
      if (moveError) throw moveError;

      const { error } = await supabase
        .from('lead_pipeline_stages')
        .delete()
        .eq('id', stage.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  return {
    stages: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    addStage,
    renameStage,
    deleteStage,
  };
}
