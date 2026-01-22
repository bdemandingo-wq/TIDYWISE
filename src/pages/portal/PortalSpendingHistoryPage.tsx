import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalSpendingHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);

  const total = useMemo(
    () => invoices.reduce((sum, i) => sum + (Number(i.total_amount ?? i.total ?? 0) || 0), 0),
    [invoices]
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }
      const { data: c } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setCustomerId(c?.id ?? null);

      if (c?.id) {
        const { data } = await supabase
          .from("invoices")
          .select("id, created_at, status, total_amount, subtotal")
          .eq("customer_id", c.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (!cancelled) setInvoices(data ?? []);
      }

      setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PortalLayout title="Spending History">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">${total.toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">Based on invoices visible to your account.</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !customerId ? (
              <p className="text-sm text-muted-foreground">No customer link found.</p>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div>
                      <div className="text-sm font-medium">{new Date(inv.created_at).toLocaleDateString()}</div>
                      <div className="text-xs text-muted-foreground">Status: {inv.status}</div>
                    </div>
                    <div className="text-sm font-medium">${Number(inv.total_amount ?? 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
