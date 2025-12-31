import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

export function FormDisplaySettings() {
  const { settings, loading, saveSettings } = useOrganizationSettings();
  const [saving, setSaving] = useState(false);
  const [localSettings, setLocalSettings] = useState({
    show_sqft_on_booking: true,
    show_addons_on_booking: true,
    show_frequency_discount: true,
    show_pet_options: true,
    show_home_condition: true,
    show_bed_bath_on_booking: true,
    sales_tax_percent: 0,
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        show_sqft_on_booking: settings.show_sqft_on_booking,
        show_addons_on_booking: settings.show_addons_on_booking,
        show_frequency_discount: settings.show_frequency_discount,
        show_pet_options: settings.show_pet_options,
        show_home_condition: settings.show_home_condition,
        show_bed_bath_on_booking: settings.show_bed_bath_on_booking,
        sales_tax_percent: settings.sales_tax_percent,
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const success = await saveSettings(localSettings);
    setSaving(false);
    if (success) {
      toast.success('Display settings saved');
    } else {
      toast.error('Failed to save settings');
    }
  };

  const toggleOptions = [
    {
      key: 'show_sqft_on_booking' as const,
      label: 'Square Footage Pricing',
      description: 'Show square footage input field on booking form',
    },
    {
      key: 'show_bed_bath_on_booking' as const,
      label: 'Bed & Bath Selection',
      description: 'Show bedroom and bathroom selection on booking form',
    },
    {
      key: 'show_addons_on_booking' as const,
      label: 'Add-On Extras',
      description: 'Show add-on services selection on booking form',
    },
    {
      key: 'show_frequency_discount' as const,
      label: 'Frequency Discount',
      description: 'Show recurring service frequency options with discounts',
    },
    {
      key: 'show_pet_options' as const,
      label: 'Pet Options',
      description: 'Show pet fee options on booking form',
    },
    {
      key: 'show_home_condition' as const,
      label: 'Home Condition',
      description: 'Show home condition pricing options',
    },
  ];

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Form Display Settings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Control which sections appear on the customer booking form
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visibility Toggles */}
        <div className="space-y-4">
          {toggleOptions.map((option) => (
            <div
              key={option.key}
              className="flex items-center justify-between p-4 rounded-lg border bg-secondary/20 hover:bg-secondary/30 transition-colors"
            >
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-2">
                  {localSettings[option.key] ? (
                    <Eye className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  {option.label}
                </Label>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              <Switch
                checked={localSettings[option.key]}
                onCheckedChange={(checked) =>
                  setLocalSettings((prev) => ({ ...prev, [option.key]: checked }))
                }
              />
            </div>
          ))}
        </div>

        {/* Sales Tax Setting */}
        <div className="pt-4 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Sales Tax %</Label>
              <p className="text-xs text-muted-foreground">
                Applied after discount, shown as separate line item
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={localSettings.sales_tax_percent}
                onChange={(e) =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    sales_tax_percent: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-24 h-10"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Display Settings
        </Button>
      </CardContent>
    </Card>
  );
}
