import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

/**
 * Compact stat tile used in the Campaigns stats bar.
 *
 * Extracted verbatim from CampaignsPage.tsx — rendered output is unchanged.
 * The only difference is that `icon` is typed as `LucideIcon` rather than
 * `typeof Send`, which avoids importing an icon purely to borrow its type.
 * Type-level only; every existing call site already passes a Lucide icon.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: "up" | "down";
}) {
  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-xl md:text-2xl font-bold">{value}</p>
          {trend === "up" && <TrendingUp className="w-4 h-4 text-emerald-500" />}
          {trend === "down" && <TrendingDown className="w-4 h-4 text-destructive" />}
        </div>
      </CardContent>
    </Card>
  );
}
