import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { safeDatabaseAction } from "@/lib/safeAction";

type CustomerLink = { id: string; organization_id: string };

export default function PortalRequestCleanPage() {
  const [customer, setCustomer] = useState<CustomerLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [bookings, setBookings] = useState<any[]>([]);

  const canSubmit = useMemo(() => !!customer && !!scheduledAt, [customer, scheduledAt]);

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
        .select("id, organization_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setCustomer(c ?? null);

      if (c?.id) {
        const { data: b } = await supabase
          .from("bookings")
          .select("id, scheduled_at, status, payment_status, is_draft")
          .eq("customer_id", c.id)
          .order("scheduled_at", { ascending: false })
          .limit(20);
        if (!cancelled) setBookings(b ?? []);
      }
      setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!customer) return;
    await safeDatabaseAction(
      () =>
        supabase.from("bookings").insert({
          organization_id: customer.organization_id,
          customer_id: customer.id,
          scheduled_at: new Date(scheduledAt).toISOString(),
          duration: 180,
          total_amount: 0,
          status: "pending",
          payment_status: "pending",
          is_draft: true,
          notes: notes || null,
        }),
      {
        tableName: "bookings",
        operation: "insert",
        successMessage: "Request submitted!",
        errorMessagePrefix: "Could not submit request",
      }
    );
  };

  return (
    <PortalLayout title="Request a Clean">
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>New request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Preferred date/time</label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Notes (optional)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button onClick={submit} disabled={!canSubmit || loading}>
              Submit request
            </Button>
            <p className="text-xs text-muted-foreground">
              Requests are saved as drafts for admin approval.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div>
                      <div className="text-sm font-medium">{new Date(b.scheduled_at).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">
                        Status: {b.status}{b.is_draft ? " (draft)" : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">Payment: {b.payment_status}</div>
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
