import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Moon } from "lucide-react";

/** 0–23 as the picker shows them: "8:00 PM", "9:00 AM". */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }),
}));

const hourLabel = (h: number) => HOUR_OPTIONS[((h % 24) + 24) % 24]?.label ?? `${h}:00`;

/**
 * Quiet hours for campaign SMS.
 *
 * The window is whole hours in the ORGANISATION's timezone, not the viewer's —
 * an owner travelling must not shift when their customers get texted. The zone
 * is named on screen for that reason.
 *
 * The window normally wraps midnight (20:00 → 09:00), so the copy states the
 * span in words rather than leaving the reader to work out that "start 20, end
 * 9" means overnight.
 */
export function QuietHoursCard({
  enabled,
  startHour,
  endHour,
  timezone,
  onChange,
}: {
  enabled: boolean;
  startHour: number;
  endHour: number;
  timezone: string;
  onChange: (field: "campaign_quiet_hours_enabled" | "campaign_quiet_hours_start" | "campaign_quiet_hours_end", value: boolean | number) => void;
}) {
  const wrapsMidnight = startHour > endHour;
  const sameHour = startHour === endHour;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="w-5 h-5" />
          Quiet Hours
        </CardTitle>
        <CardDescription>
          Campaign messages pause overnight and resume automatically. Booking confirmations,
          reminders and other transactional messages are not affected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="pr-4">
            <p className="text-sm font-medium">Pause campaigns overnight</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Queued messages are held, not dropped — a campaign picks up where it left off.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => onChange("campaign_quiet_hours_enabled", v)}
            aria-label="Pause campaigns overnight"
          />
        </div>

        <div className={enabled ? "" : "opacity-50 pointer-events-none"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quiet-start">Stop sending at</Label>
              <Select
                value={String(startHour)}
                onValueChange={(v) => onChange("campaign_quiet_hours_start", parseInt(v, 10))}
              >
                <SelectTrigger id="quiet-start"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quiet-end">Resume sending at</Label>
              <Select
                value={String(endHour)}
                onValueChange={(v) => onChange("campaign_quiet_hours_end", parseInt(v, 10))}
              >
                <SelectTrigger id="quiet-end"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
            {sameHour ? (
              <p className="text-destructive">
                Start and resume are the same hour, so nothing would ever send. Pick a different resume time.
              </p>
            ) : (
              <p>
                No campaign messages between{" "}
                <span className="font-medium text-foreground">{hourLabel(startHour)}</span> and{" "}
                <span className="font-medium text-foreground">{hourLabel(endHour)}</span>
                {wrapsMidnight ? " the next morning" : " the same day"}.
              </p>
            )}
            <p className="text-muted-foreground">
              Times are in your business timezone,{" "}
              <span className="font-medium text-foreground">{timezone}</span>. Change it under General.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
