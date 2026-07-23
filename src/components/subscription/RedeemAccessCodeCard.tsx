import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, TicketCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function RedeemAccessCodeCard() {
  const { checkSubscription } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("redeem_access_code", {
        _code: code.trim(),
      });
      if (error) throw error;
      const payload = data as { expires_at?: string; duration_days?: number } | null;
      const days = payload?.duration_days;
      toast.success(
        days
          ? `Code redeemed — ${days} days of full access activated.`
          : "Code redeemed successfully.",
      );
      setCode("");
      await checkSubscription();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not redeem code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TicketCheck className="h-4 w-4" />
          Have an access code?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={redeem} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="access-code" className="text-xs text-muted-foreground">
              Enter code to activate time-limited access
            </Label>
            <Input
              id="access-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. TIDY30DAYS"
              autoComplete="off"
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy || !code.trim()}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Redeem
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
