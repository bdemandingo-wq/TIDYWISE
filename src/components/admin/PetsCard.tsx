import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Save, PawPrint } from 'lucide-react';
import { toast } from 'sonner';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';

export function PetsCard() {
  const { settings, loading, saveSettings } = useOrganizationSettings();
  const [petFee, setPetFee] = useState<string>('25');
  const [petEnabled, setPetEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setPetFee(String(settings.pet_fee ?? 25));
    setPetEnabled(settings.pet_toggle_enabled ?? true);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveSettings({
      pet_fee: Number(petFee) || 0,
      pet_toggle_enabled: petEnabled,
    });
    setSaving(false);
    if (ok) toast.success('Pet settings saved');
    else toast.error('Failed to save');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <PawPrint className="h-5 w-5" />
          Pets?
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Show a pet toggle on the booking form and charge a flat pet fee.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Switch checked={petEnabled} onCheckedChange={setPetEnabled} id="pet-toggle-enabled" />
          <Label htmlFor="pet-toggle-enabled" className="cursor-pointer">
            Show pet toggle on booking form
          </Label>
        </div>
        <div>
          <Label className="mb-2 block">Pet fee ($)</Label>
          <Input
            type="number"
            min={0}
            className="w-32"
            value={petFee}
            onChange={(e) => setPetFee(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
