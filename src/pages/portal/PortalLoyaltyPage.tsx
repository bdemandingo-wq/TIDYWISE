import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalLoyaltyPage() {
  const [loading, setLoading] = useState(true);
  const [loyalty, setLoyalty] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

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
      const customerId = c?.id;
      if (customerId) {
        const { data: l } = await supabase
          .from("customer_loyalty")
          .select("points, lifetime_points, tier")
          .eq("customer_id", customerId)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setLoyalty(l ?? null);

        const { data: t } = await supabase
          .from("loyalty_transactions")
          .select("id, created_at, points, transaction_type, description")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(25);
        if (!cancelled) setTransactions(t ?? []);
      }

      setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PortalLayout title="Loyalty">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Your status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !loyalty ? (
              <p className="text-sm text-muted-foreground">No loyalty record yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">Tier</div>
                  <div className="text-lg font-semibold">{loyalty.tier ?? "bronze"}</div>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">Points</div>
                  <div className="text-lg font-semibold">{Number(loyalty.points ?? 0)}</div>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">Lifetime</div>
                  <div className="text-lg font-semibold">{Number(loyalty.lifetime_points ?? 0)}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{t.description ?? t.transaction_type}</div>
                      <div className="text-sm font-medium">{Number(t.points ?? 0)} pts</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
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
