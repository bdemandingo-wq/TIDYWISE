import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { Loader2, RotateCcw, LayoutGrid } from "lucide-react";
import { setFooterHiddenItems } from "@/hooks/useFooterVisibility";

type FooterItem = {
  id: string;
  label: string;
  required?: boolean;
  group: "Product" | "Company" | "Compare";
};

const footerItems: FooterItem[] = [
  { id: "product:features", label: "Features", group: "Product" },
  { id: "product:blog", label: "Blog", group: "Product" },
  { id: "product:testimonials", label: "Testimonials", group: "Product" },

  { id: "company:contact", label: "Contact", group: "Company" },
  { id: "company:privacy", label: "Privacy", group: "Company" },
  { id: "company:terms", label: "Terms", group: "Company" },

  { id: "compare:jobber", label: "vs Jobber", group: "Compare" },
  { id: "compare:booking-koala", label: "vs Booking Koala", group: "Compare" },
];

export function FooterVisibilitySettings() {
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const { organizationId } = useOrgId();

  const visibleCount = useMemo(
    () => footerItems.length - hiddenItems.length,
    [hiddenItems]
  );

  useEffect(() => {
    const loadPreferences = async () => {
      if (!user?.id || !organizationId) return;

      const { data } = await supabase
        .from("user_preferences")
        .select("preference_value")
        .eq("user_id", user.id)
        .eq("organization_id", organizationId)
        .eq("preference_key", "footer_hidden")
        .maybeSingle();

      if (data?.preference_value) {
        const hidden = data.preference_value as string[];
        setHiddenItems(hidden);
        setFooterHiddenItems(hidden);
      }
    };

    loadPreferences();
  }, [user?.id, organizationId]);

  const saveToDatabase = async (newHidden: string[]) => {
    if (!user?.id || !organizationId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_preferences")
        .upsert(
          {
            user_id: user.id,
            organization_id: organizationId,
            preference_key: "footer_hidden",
            preference_value: newHidden,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,organization_id,preference_key" }
        );

      if (error) throw error;
    } catch (e) {
      console.error("Error saving footer preferences:", e);
      toast.error("Failed to save footer preference");
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (id: string) => {
    setHiddenItems((prev) => {
      const newHidden = prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id];
      setFooterHiddenItems(newHidden);
      saveToDatabase(newHidden);
      return newHidden;
    });
  };

  const resetToDefault = async () => {
    setHiddenItems([]);
    setFooterHiddenItems([]);

    if (user?.id && organizationId) {
      await supabase
        .from("user_preferences")
        .delete()
        .eq("user_id", user.id)
        .eq("organization_id", organizationId)
        .eq("preference_key", "footer_hidden");
    }

    toast.success("Footer reset to default");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" />
              Footer Links
            </CardTitle>
            <CardDescription className="mt-1">
              Choose which links show up in the marketing footer.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            className="gap-2"
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reset
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary">{visibleCount} visible</Badge>
          {hiddenItems.length > 0 && <Badge variant="outline">{hiddenItems.length} hidden</Badge>}
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3">
          {footerItems.map((item) => {
            const isHidden = hiddenItems.includes(item.id);
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  isHidden ? "bg-muted/50 opacity-60" : "bg-card"
                }`}
              >
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.group}</div>
                </div>
                <Switch checked={!isHidden} onCheckedChange={() => toggleItem(item.id)} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
