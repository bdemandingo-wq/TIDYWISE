import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, Save, DoorClosed } from 'lucide-react';
import { toast } from 'sonner';
import {
  useOrganizationSettings,
  DEFAULT_ROOM_REDUCTION_PRICES,
  type ExcludableRoomType,
  type RoomReductionPrices,
} from '@/hooks/useOrganizationSettings';

const ROOM_TYPES: { id: ExcludableRoomType; label: string }[] = [
  { id: 'bedroom', label: 'Bedrooms' },
  { id: 'bathroom', label: 'Bathrooms' },
  { id: 'full_bath', label: 'Full Baths' },
];

export function ExcludeParametersCard() {
  const { settings, loading, saveSettings } = useOrganizationSettings();
  const [excluded, setExcluded] = useState<ExcludableRoomType[]>([]);
  const [prices, setPrices] = useState<RoomReductionPrices>(DEFAULT_ROOM_REDUCTION_PRICES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setExcluded(settings.excluded_room_types ?? []);
    setPrices({ ...DEFAULT_ROOM_REDUCTION_PRICES, ...(settings.room_reduction_prices ?? {}) });
  }, [settings]);

  const toggle = (id: ExcludableRoomType) => {
    setExcluded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveSettings({
      excluded_room_types: excluded,
      room_reduction_prices: prices,
    });
    setSaving(false);
    if (ok) toast.success('Exclude parameters saved');
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
        <CardTitle className="flex items-center gap-2">
          <DoorClosed className="h-5 w-5" />
          Exclude Parameters
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose which room types customers can skip on the booking form, and set the dollar reduction per skipped room.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {ROOM_TYPES.map((rt) => {
          const isExcluded = excluded.includes(rt.id);
          return (
            <div key={rt.id} className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 flex-1">
                <Checkbox
                  id={`exc-${rt.id}`}
                  checked={isExcluded}
                  onCheckedChange={() => toggle(rt.id)}
                />
                <Label htmlFor={`exc-${rt.id}`} className="cursor-pointer">
                  Exclude {rt.label}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">- $</span>
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  value={prices[rt.id] ?? 0}
                  onChange={(e) =>
                    setPrices((p) => ({ ...p, [rt.id]: Number(e.target.value) || 0 }))
                  }
                />
                <span className="text-xs text-muted-foreground">/ room</span>
              </div>
            </div>
          );
        })}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
