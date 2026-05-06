import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useCopilotEnabled } from '@/hooks/useCopilotEnabled';

export function CopilotSettingsCard() {
  const { organization } = useOrganization();
  const enabled = useCopilotEnabled();
  const [saving, setSaving] = useState(false);
  // Local optimistic mirror so the switch doesn't lag while the realtime
  // round-trip lands.
  const [localValue, setLocalValue] = useState<boolean | null>(null);
  useEffect(() => {
    if (enabled !== null) setLocalValue(enabled);
  }, [enabled]);

  const checked = localValue ?? true;

  const handleToggle = async (next: boolean) => {
    if (!organization?.id || saving) return;
    setLocalValue(next);
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      // Upsert so orgs without a row yet get one created on first toggle.
      const { error } = await db
        .from('onboarding_progress')
        .upsert(
          { organization_id: organization.id, copilot_enabled: next },
          { onConflict: 'organization_id' },
        );
      if (error) throw error;
      toast.success(next ? 'Tidy enabled' : 'Tidy disabled');
    } catch (err) {
      console.error('[copilot-settings] toggle failed', err);
      setLocalValue(!next);
      toast.error('Could not update setting. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          AI Co-pilot (Tidy)
        </CardTitle>
        <CardDescription>
          Your in-app assistant for setup help and how-to questions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="copilot-enabled" className="cursor-pointer">
            Enable Tidy
          </Label>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <Switch
              id="copilot-enabled"
              checked={checked}
              onCheckedChange={handleToggle}
              disabled={saving || enabled === null}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Tidy is your AI co-pilot. Click the indigo bubble in the bottom-right of any page
          to ask questions, get help with features, or walk through setup. Toggle off to hide
          Tidy across your entire organization.
        </p>
      </CardContent>
    </Card>
  );
}
