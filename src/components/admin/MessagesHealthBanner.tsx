import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface HealthReport {
  organization_id: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  hours_since_inbound: number | null;
  sms_enabled: boolean;
  has_api_key: boolean;
  has_phone_number_id: boolean;
  api_key_valid: boolean;
  phone_number_id_valid: boolean;
  phone_number: string | null;
  issues: string[];
  recommendations: string[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const isInboundStale = (report: HealthReport) =>
  report.hours_since_inbound === null || report.hours_since_inbound > 24;

export function MessagesHealthBanner() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [expanded, setExpanded] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "messaging-health-check",
        { body: {} },
      );
      if (error) throw error;
      const first = (data?.reports ?? [])[0] as HealthReport | undefined;
      setReport(first ?? null);
    } catch (err: any) {
      toast.error("Health check failed", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runCheck();
  }, []);

  if (loading && !report) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground border-b">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking messaging health…
      </div>
    );
  }

  if (!report) return null;

  const hasIssues = report.issues.length > 0;
  const allGood =
    report.api_key_valid &&
    report.phone_number_id_valid &&
    report.sms_enabled &&
    !hasIssues &&
    !isInboundStale(report);
  const credentialsValid =
    report.api_key_valid &&
    report.phone_number_id_valid &&
    report.sms_enabled &&
    !hasIssues;

  if (allGood || credentialsValid) {
    return (
      <div className="flex items-center justify-between gap-2 px-4 py-1.5 text-xs text-muted-foreground border-b">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className={`w-3.5 h-3.5 ${allGood ? "text-green-600" : "text-amber-600"}`} />
          {allGood ? "OpenPhone messages synced" : "OpenPhone connected · sync needed"}
          {report.phone_number && (
            <span className="font-mono"> · {report.phone_number}</span>
          )}
          {" · last inbound "}
          {formatRelative(report.last_inbound_at)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={runCheck}
          disabled={loading}
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Recheck
        </Button>
      </div>
    );
  }

  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>Messaging needs attention</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "Details"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={runCheck}
            disabled={loading}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </AlertTitle>
      <AlertDescription>
        <div className="text-xs mt-1 flex flex-wrap gap-x-3">
          <span>
            API key:{" "}
            <strong>
              {report.has_api_key
                ? report.api_key_valid
                  ? "✓ valid"
                  : "✗ invalid"
                : "✗ missing"}
            </strong>
          </span>
          <span>
            Phone ID:{" "}
            <strong>
              {report.has_phone_number_id
                ? report.phone_number_id_valid
                  ? `✓ ${report.phone_number ?? "valid"}`
                  : "✗ invalid"
                : "✗ missing"}
            </strong>
          </span>
          <span>
            Last inbound: <strong>{formatRelative(report.last_inbound_at)}</strong>
          </span>
        </div>
        {expanded && (
          <div className="mt-3 space-y-2 text-xs">
            <ul className="list-disc pl-5 space-y-0.5">
              {report.issues.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
            {report.recommendations.length > 0 && (
              <div>
                <div className="font-medium mt-2">How to fix:</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {report.recommendations.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
