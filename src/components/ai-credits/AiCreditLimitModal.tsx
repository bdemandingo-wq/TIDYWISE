import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BuyAiCreditsButton } from "./BuyAiCreditsButton";

export interface AiCreditLimitPayload {
  used: number;
  limit: number;
  purchasedBalance: number;
  resetsAt: string;
  message?: string;
}

// A tiny event bus so any AI feature can trigger the shared modal without
// wiring props through the tree.
type Listener = (payload: AiCreditLimitPayload) => void;
const listeners = new Set<Listener>();

export function openAiCreditLimitModal(payload: AiCreditLimitPayload) {
  listeners.forEach((fn) => fn(payload));
}

/**
 * Parses a supabase.functions.invoke error and, if it's the 402
 * daily_limit_reached payload, opens the modal and returns true.
 */
export async function handlePossibleAiCreditError(error: unknown): Promise<boolean> {
  // FunctionsHttpError exposes the raw Response on .context
  const ctx = (error as { context?: Response })?.context;
  if (!ctx || typeof ctx.text !== "function") return false;
  try {
    const text = await ctx.text();
    const parsed = JSON.parse(text);
    if (parsed?.code === "daily_limit_reached") {
      openAiCreditLimitModal({
        used: parsed.used,
        limit: parsed.limit,
        purchasedBalance: parsed.purchasedBalance ?? 0,
        resetsAt: parsed.resetsAt,
        message: parsed.message,
      });
      return true;
    }
  } catch { /* not JSON — not our payload */ }
  return false;
}

function formatCountdown(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return "any moment now";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Mount once at the app root — listens for openAiCreditLimitModal calls. */
export function AiCreditLimitModal() {
  const [payload, setPayload] = useState<AiCreditLimitPayload | null>(null);

  useEffect(() => {
    const listener: Listener = (p) => setPayload(p);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const open = !!payload;
  const countdown = payload ? formatCountdown(payload.resetsAt) : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setPayload(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>You've used today's free AI actions</DialogTitle>
          <DialogDescription className="pt-2">
            {payload?.message
              ?? `You've used ${payload?.used}/${payload?.limit} free AI actions for today.`}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
          <div><b>Resets in:</b> {countdown} (midnight UTC)</div>
          {payload && payload.purchasedBalance > 0 && (
            <div><b>Purchased credits available:</b> {payload.purchasedBalance}</div>
          )}
          <div className="text-muted-foreground pt-1">
            Buy 500 credits for $10 to keep going right now. Purchased credits never expire.
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setPayload(null)}>Wait until reset</Button>
          <BuyAiCreditsButton />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
