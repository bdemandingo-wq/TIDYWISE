import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  AUTOMATION_ROW_TYPE,
  type AutomationKey,
} from '@/lib/automationTemplates';

/**
 * Custom automation copy lives in `organization_automations.settings`, under a
 * `templates` object keyed by AutomationKey. No new table: the row already
 * exists for every org, and `settings` was empty on 960 of 961 of them.
 *
 *   settings = { ...whatever else, templates: { reminder_soon: "Hi ..." } }
 *
 * A key with no entry means "use the default" — absence is the normal state,
 * not an error, and the sender treats it that way.
 */

export type TemplateMap = Partial<Record<AutomationKey, string>>;

type SettingsRow = { id: string; automation_type: string; settings: Record<string, unknown> | null };

export function useOrgAutomationTemplates() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['org-automation-templates', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<{ templates: TemplateMap; rows: SettingsRow[] }> => {
      const { data, error } = await supabase
        .from('organization_automations')
        .select('id, automation_type, settings')
        .eq('organization_id', organizationId!);

      // Deliberately NOT swallowed into an empty object: an owner who sees a
      // blank editor would assume their custom copy was lost and rewrite it.
      if (error) throw error;

      const rows = (data ?? []) as SettingsRow[];
      const templates: TemplateMap = {};
      for (const row of rows) {
        const stored = (row.settings as { templates?: Record<string, unknown> } | null)?.templates;
        if (!stored) continue;
        for (const [key, value] of Object.entries(stored)) {
          if (typeof value === 'string' && value.trim()) {
            templates[key as AutomationKey] = value;
          }
        }
      }
      return { templates, rows };
    },
  });

  const save = useMutation({
    mutationFn: async ({ key, body }: { key: AutomationKey; body: string | null }) => {
      if (!organizationId) throw new Error('No active organization');

      const automationType = AUTOMATION_ROW_TYPE[key];
      const existing = query.data?.rows.find((r) => r.automation_type === automationType);

      // Read-modify-write on the whole `settings` blob, so we never clobber
      // other keys sharing the row (all three reminder messages do).
      const currentSettings = (existing?.settings ?? {}) as Record<string, unknown>;
      const currentTemplates = { ...((currentSettings.templates as Record<string, unknown>) ?? {}) };

      // null / empty means "go back to the default", which is the ABSENCE of a
      // key rather than an empty string — an empty string would still be a
      // customisation, and the resolver would have to guess.
      if (body && body.trim()) currentTemplates[key] = body.trim();
      else delete currentTemplates[key];

      const nextSettings = { ...currentSettings, templates: currentTemplates };

      if (existing) {
        const { error } = await supabase
          .from('organization_automations')
          .update({ settings: nextSettings })
          .eq('id', existing.id)
          .eq('organization_id', organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_automations')
          .insert({
            organization_id: organizationId,
            automation_type: automationType,
            is_enabled: true,
            settings: nextSettings,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-automation-templates', organizationId] });
    },
  });

  return {
    templates: query.data?.templates ?? {},
    isLoading: query.isLoading,
    error: query.error as Error | null,
    save,
  };
}
