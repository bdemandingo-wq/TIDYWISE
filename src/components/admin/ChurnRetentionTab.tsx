import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const REASON_LABELS: Record<string, string> = {
  not_enough_jobs: "Not enough cleaning jobs",
  going_manual: "Going back to manual (pen & paper)",
  switching_crm: "Switching to another CRM",
  too_expensive: "Too expensive",
  too_complicated: "Too complicated",
  missing_feature: "Missing a feature",
  booking_didnt_work: "Booking / scheduling issues",
  payments_didnt_work: "Payments / payouts issues",
  just_testing: "Just testing it out",
  pausing_slow_season: "Pausing (slow season)",
  other: "Other",
};

interface ChurnData {
  window_days: number;
  total_cancellations: number;
  reason_counts: Record<string, number>;
  competitors: { name: string; count: number }[];
  missing_features: { feature: string; count: number }[];
  recent_feedback: { reason: string; text: string; canceled_at: string }[];
  pauses: {
    total: number;
    active: number;
    resumed: number;
    by_duration_months: Record<string, number>;
  };
  winback: { shown: number; claimed: number; declined: number };
}

export default function ChurnRetentionTab() {
  const [days, setDays] = useState(90);

  const { data, isLoading, error } = useQuery<ChurnData>({
    queryKey: ["churn-analytics", days],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("cancellation-analytics", {
        body: { days },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as ChurnData;
    },
  });

  const reasonRows = data
    ? Object.entries(data.reason_counts).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Churn &amp; retention</h3>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
            <SelectItem value="365">Last 365 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive">
          {(error as Error).message || "Failed to load churn analytics"}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total cancellations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{data.total_cancellations}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pauses (active / resumed)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {data.pauses.active} / {data.pauses.resumed}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  1mo: {data.pauses.by_duration_months["1"] ?? 0} · 2mo:{" "}
                  {data.pauses.by_duration_months["2"] ?? 0} · 3mo:{" "}
                  {data.pauses.by_duration_months["3"] ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Win-back offers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {data.winback.claimed} claimed
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.winback.shown} pending · {data.winback.declined} declined
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reasons for cancellation</CardTitle>
            </CardHeader>
            <CardContent>
              {reasonRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cancellations in this window.</p>
              ) : (
                <div className="space-y-2">
                  {reasonRows.map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm">{REASON_LABELS[key] ?? key}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Competitors switched to</CardTitle>
              </CardHeader>
              <CardContent>
                {data.competitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None reported.</p>
                ) : (
                  <div className="space-y-2">
                    {data.competitors.map((c) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <span className="text-sm">{c.name}</span>
                        <Badge variant="secondary">{c.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Missing features mentioned</CardTitle>
              </CardHeader>
              <CardContent>
                {data.missing_features.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None reported.</p>
                ) : (
                  <div className="space-y-2">
                    {data.missing_features.map((f) => (
                      <div key={f.feature} className="flex items-center justify-between">
                        <span className="text-sm">{f.feature}</span>
                        <Badge variant="secondary">{f.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recent_feedback.length === 0 ? (
                <p className="text-sm text-muted-foreground">No feedback yet.</p>
              ) : (
                data.recent_feedback.map((f, i) => (
                  <div key={i} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline">
                        {REASON_LABELS[f.reason] ?? f.reason}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {/* eslint-disable-next-line local/no-device-local-dates -- viewer-local display of a stored instant */}
                        {new Date(f.canceled_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm">{f.text}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
