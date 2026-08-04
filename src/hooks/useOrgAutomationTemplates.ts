import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  AUTOMATION_ROW_TYPE,
  type AutomationKey,
} from '@/lib/automationTemplates';

/**
 * Custom automation copy lives in `organization_automations.settings`, under a
 * `templates` object keyed by AutomationKey, with email subjects alongside in
 * `template_subjects`. No new table: the row already exists for most orgs, and
 * `settings` was empty on 960 of 961 of them.
 *
 *   settings = { ...whatever else,
 *                templates:         { reminder_soon: "Hi ..." },
 *                template_subjects: { winback_step_1: "..." } }
 *
 * A key with no entry means "use the default" — absence is the normal state,
 * not an error, and the senders treat it that way.
 *
 * EDITING DOES NOT ENABLE. Where no row exists we insert one with
 * `is_enabled: false`. Rewording a message an owner has deliberately switched
 * off must not switch it back on.
 */

export type TemplateMap = Partial<Record<AutomationKey, string>>;

type SettingsRow = {
  id: string;
  automation_type: string;
  is_enabled: boolean;
  settings: Record<string, unknown> | null;
};

export function useOrgAutomationTemplates() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['org-automation-templates', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<{
      templates: TemplateMap;
      subjects: TemplateMap;
      enabled: Record<string, boolean>;
      rows: SettingsRow[];
    }> => {
      const { data, error } = await supabase
        .from('organization_automations')
        .select('id, automation_type, is_enabled, settings')
        .eq('organization_id', organizationId!);

      // Deliberately NOT swallowed into an empty object: an owner who sees a
      // blank editor would assume their custom copy was lost and rewrite it.
      if (error) throw error;

      const rows = (data ?? []) as SettingsRow[];
      const templates: TemplateMap = {};
      const subjects: TemplateMap = {};
      const enabled: Record<string, boolean> = {};

      for (const row of rows) {
        enabled[row.automation_type] = !!row.is_enabled;
        const settings = (row.settings ?? {}) as {
          templates?: Record<string, unknown>;
          template_subjects?: Record<string, unknown>;
        };
        for (const [key, value] of Object.entries(settings.templates ?? {})) {
          if (typeof value === 'string' && value.trim()) templates[key as AutomationKey] = value;
        }
        for (const [key, value] of Object.entries(settings.template_subjects ?? {})) {
          if (typeof value === 'string' && value.trim()) subjects[key as AutomationKey] = value;
        }
      }
      return { templates, subjects, enabled, rows };
    },
  });

  const save = useMutation({
    mutationFn: async ({
      key,
      body,
      subject,
    }: { key: AutomationKey; body: string | null; subject?: string | null }) => {
      if (!organizationId) throw new Error('No active organization');

      const automationType = AUTOMATION_ROW_TYPE[key];
      const existing = query.data?.rows.find((r) => r.automation_type === automationType);

      // Read-modify-write on the whole `settings` blob, so we never clobber
      // other keys sharing the row (all three reminder messages do, and so do
      // the three win-back steps).
      const currentSettings = (existing?.settings ?? {}) as Record<string, unknown>;
      const nextTemplates = { ...((currentSettings.templates as Record<string, unknown>) ?? {}) };
      const nextSubjects = {
        ...((currentSettings.template_subjects as Record<string, unknown>) ?? {}),
      };

      // null / empty means "go back to the default", which is the ABSENCE of a
      // key rather than an empty string — an empty string would still be a
      // customisation, and would resolve to the default anyway while looking
      // like a saved edit in the UI.
      if (body === null || !body.trim()) delete nextTemplates[key];
      else nextTemplates[key] = body;

      if (subject !== undefined) {
        if (subject === null || !subject.trim()) delete nextSubjects[key];
        else nextSubjects[key] = subject;
      }

      const nextSettings = {
        ...currentSettings,
        templates: nextTemplates,
        template_subjects: nextSubjects,
      };

      if (existing) {
        const { error } = await supabase
          .from('organization_automations')
          .update({ settings: nextSettings as unknown as Json })
          .eq('id', existing.id)
          .eq('organization_id', organizationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_automations')
          .insert([{
            organization_id: organizationId,
            automation_type: automationType,
            // Disabled on purpose — see the note at the top of this file.
            is_enabled: false,
            settings: nextSettings as unknown as Json,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-automation-templates', organizationId] });
    },
  });

  return {
    templates: query.data?.templates ?? {},
    subjects: query.data?.subjects ?? {},
    /** Keyed by automation_type, so the editor can show an "Off" chip. */
    enabledByType: query.data?.enabled ?? {},
    isLoading: query.isLoading,
    error: query.error as Error | null,
    save,
  };
}
