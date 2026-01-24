import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrgId } from "@/hooks/useOrgId";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Navigation, Plus, Trash2 } from "lucide-react";

type NavRole = "admin" | "member";

export type MobileNavItem = {
  id: string;
  label: string;
  to: string;
  iconKey: string;
};

const ROUTE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Dashboard", value: "/dashboard" },
  { label: "Customers", value: "/dashboard/customers" },
  { label: "Leads", value: "/dashboard/leads" },
  { label: "Messages", value: "/dashboard/messages" },
  { label: "Settings", value: "/dashboard/settings" },
  { label: "Bookings", value: "/dashboard/bookings" },
  { label: "Scheduler", value: "/dashboard/scheduler" },
  { label: "Reports", value: "/dashboard/reports" },
  { label: "Finance", value: "/dashboard/finance" },
];

const ICON_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Home", value: "Home" },
  { label: "Users", value: "Users" },
  { label: "Target", value: "Target" },
  { label: "Messages", value: "MessageSquare" },
  { label: "Settings", value: "Settings" },
  { label: "Calendar", value: "Calendar" },
  { label: "Chart", value: "BarChart3" },
  { label: "List", value: "ClipboardList" },
  { label: "Bell", value: "Bell" },
];

const DEFAULT_ADMIN: MobileNavItem[] = [
  { id: "home", label: "Home", to: "/dashboard", iconKey: "Home" },
  { id: "customers", label: "Customers", to: "/dashboard/customers", iconKey: "Users" },
  { id: "leads", label: "Leads", to: "/dashboard/leads", iconKey: "Target" },
  { id: "messages", label: "Messages", to: "/dashboard/messages", iconKey: "MessageSquare" },
  { id: "settings", label: "Settings", to: "/dashboard/settings", iconKey: "Settings" },
];

const DEFAULT_MEMBER: MobileNavItem[] = DEFAULT_ADMIN;

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function sanitizeItem(raw: any): MobileNavItem | null {
  if (!raw || typeof raw !== "object") return null;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const to = typeof raw.to === "string" ? raw.to.trim() : "";
  const iconKey = typeof raw.iconKey === "string" ? raw.iconKey.trim() : "Home";
  const id = typeof raw.id === "string" ? raw.id : makeId();
  if (!label || !to || !to.startsWith("/")) return null;
  return { id, label, to, iconKey };
}

export function MobileBottomNavSettings() {
  const { organizationId } = useOrgId();
  const { isAdmin } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<NavRole | null>(null);
  const [adminItems, setAdminItems] = useState<MobileNavItem[]>(DEFAULT_ADMIN);
  const [memberItems, setMemberItems] = useState<MobileNavItem[]>(DEFAULT_MEMBER);

  const canEdit = isAdmin;

  const roleState = useMemo(
    () =>
      ({
        admin: [adminItems, setAdminItems] as const,
        member: [memberItems, setMemberItems] as const,
      }) as const,
    [adminItems, memberItems]
  );

  useEffect(() => {
    const load = async () => {
      if (!organizationId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("organization_mobile_nav_settings")
          .select("role, items")
          .eq("organization_id", organizationId);

        if (error) throw error;

        const byRole: Record<string, MobileNavItem[]> = {};
        (data ?? []).forEach((row: any) => {
          const items = Array.isArray(row.items)
            ? (row.items.map(sanitizeItem).filter(Boolean) as MobileNavItem[])
            : [];
          byRole[row.role] = items;
        });

        if (byRole.admin?.length) setAdminItems(byRole.admin);
        if (byRole.member?.length) setMemberItems(byRole.member);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load mobile nav settings");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [organizationId]);

  const moveItem = (role: NavRole, index: number, dir: -1 | 1) => {
    const [items, setItems] = roleState[role];
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const copy = [...items];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item);
    setItems(copy);
  };

  const removeItem = (role: NavRole, id: string) => {
    const [items, setItems] = roleState[role];
    setItems(items.filter((i) => i.id !== id));
  };

  const updateItem = (role: NavRole, id: string, patch: Partial<MobileNavItem>) => {
    const [items, setItems] = roleState[role];
    setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const addItem = (role: NavRole) => {
    const [items, setItems] = roleState[role];
    setItems([
      ...items,
      {
        id: makeId(),
        label: "New",
        to: "/dashboard",
        iconKey: "Home",
      },
    ]);
  };

  const validate = (items: MobileNavItem[]) => {
    if (items.length === 0) return "Add at least 1 item.";
    for (const item of items) {
      if (!item.label.trim()) return "Each item needs a label.";
      if (!item.to.trim().startsWith("/dashboard")) return "Routes must start with /dashboard.";
    }
    return null;
  };

  const saveRole = async (role: NavRole) => {
    if (!organizationId) return;
    const items = role === "admin" ? adminItems : memberItems;
    const err = validate(items);
    if (err) return toast.error(err);

    setSavingRole(role);
    try {
      const { error } = await supabase
        .from("organization_mobile_nav_settings")
        .upsert(
          {
            organization_id: organizationId,
            role,
            items,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "organization_id,role" }
        );

      if (error) throw error;
      toast.success("Mobile nav saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save mobile nav");
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-5 w-5" />
          Mobile Bottom Nav
        </CardTitle>
        <CardDescription>
          Configure the mobile bottom navigation bar (role-based). Extra items appear under “More”.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!canEdit && (
          <div className="text-sm text-muted-foreground mb-4">
            Only admins can edit these settings.
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Tabs defaultValue="admin" className="space-y-4">
            <TabsList>
              <TabsTrigger value="admin">Admin</TabsTrigger>
              <TabsTrigger value="member">Member</TabsTrigger>
            </TabsList>

            {(["admin", "member"] as NavRole[]).map((role) => {
              const items = role === "admin" ? adminItems : memberItems;
              return (
                <TabsContent key={role} value={role} className="space-y-4">
                  <div className="grid gap-3">
                    {items.map((item, idx) => (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="grid grid-cols-1 gap-3">
                          <div className="grid grid-cols-1 gap-2">
                            <Label>Label</Label>
                            <Input
                              value={item.label}
                              onChange={(e) => updateItem(role, item.id, { label: e.target.value })}
                              disabled={!canEdit}
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            <Label>Route</Label>
                            <Select
                              value={item.to}
                              onValueChange={(v) => updateItem(role, item.id, { to: v })}
                              disabled={!canEdit}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a route" />
                              </SelectTrigger>
                              <SelectContent>
                                {ROUTE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            <Label>Icon</Label>
                            <Select
                              value={item.iconKey}
                              onValueChange={(v) => updateItem(role, item.id, { iconKey: v })}
                              disabled={!canEdit}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select an icon" />
                              </SelectTrigger>
                              <SelectContent>
                                {ICON_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => moveItem(role, idx, -1)}
                                disabled={!canEdit || idx === 0}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => moveItem(role, idx, 1)}
                                disabled={!canEdit || idx === items.length - 1}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                            </div>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removeItem(role, item.id)}
                              disabled={!canEdit}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addItem(role)}
                      disabled={!canEdit}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" /> Add item
                    </Button>

                    <Button
                      type="button"
                      onClick={() => saveRole(role)}
                      disabled={!canEdit || savingRole === role}
                      className="gap-2"
                    >
                      {savingRole === role && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save {role}
                    </Button>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
