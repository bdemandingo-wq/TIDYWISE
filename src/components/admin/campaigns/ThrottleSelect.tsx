import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge } from "lucide-react";
import { describeDuration } from "./CampaignSendConfirmDialog";

/**
 * Sending pace. The floor is 30s and matches the CHECK constraint on
 * campaign_runs.throttle_seconds (30–3600) — the API will not accept faster,
 * and bursting is the carrier-filtering behaviour the queue exists to prevent.
 */
export const THROTTLE_OPTIONS = [
  { value: 30, label: "One every 30 seconds" },
  { value: 60, label: "One every minute" },
  { value: 120, label: "One every 2 minutes" },
  { value: 300, label: "One every 5 minutes" },
];

export function ThrottleSelect({
  value,
  onChange,
  recipientCount,
  id = "campaign-throttle",
}: {
  value: number;
  onChange: (seconds: number) => void;
  /** When known, the pace is expressed as a finish time — the number people actually care about. */
  recipientCount?: number | null;
  id?: string;
}) {
  // An off-list value (set via the API, or a future option) must still display,
  // rather than rendering an empty trigger the way the Days Inactive picker did.
  const options = THROTTLE_OPTIONS.some(o => o.value === value)
    ? THROTTLE_OPTIONS
    : [...THROTTLE_OPTIONS, { value, label: `One every ${value} seconds` }].sort((a, b) => a.value - b.value);

  const duration = recipientCount && recipientCount > 1 ? describeDuration(recipientCount, value) : null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <Gauge className="w-3.5 h-3.5" />
        Sending pace
      </Label>
      <Select value={String(value)} onValueChange={(v) => onChange(parseInt(v, 10))}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {duration
          ? `${recipientCount} recipients takes ${duration}.`
          : "Messages go out one at a time at this pace, so a large campaign spreads over hours."}
      </p>
    </div>
  );
}
