import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface HealthReport {
  organization_id: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  hours_since_inbound: number | null;
  sms_enabled: boolean;
  has_api_key: boolean;
  has_phone_number_id: boolean;
  openphone_api_reachable: boolean;
  webhook_registered: boolean;
  webhook_url_match: boolean;
  registered_webhooks: Array<{ id: string; url: string; events: string[] }>;
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

export function MessagesHealthBanner() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>("");
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
      setWebhookUrl(data?.webhook_url ?? "");
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
  const stale =
    report.hours_since_inbound !== null && report.hours_since_inbound > 24;
  const showBanner = hasIssues || stale;

  if (!showBanner) {
    return (
      <div className="flex items-center justify-between gap-2 px-4 py-1.5 text-xs text-muted-foreground border-b">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
          Messaging healthy · last inbound {formatRelative(report.last_inbound_at)}
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
    <Alert variant={hasIssues ? "destructive" : "default"} className="rounded-none border-x-0 border-t-0">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>
          {hasIssues
            ? "Messaging needs attention"
            : `No new messages in ${report.hours_since_inbound}h`}
        </span>
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
        <div className="text-xs mt-1">
          Last inbound: <strong>{formatRelative(report.last_inbound_at)}</strong> · Last
          outbound: <strong>{formatRelative(report.last_outbound_at)}</strong>
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
            {webhookUrl && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded bg-muted/50">
                <code className="text-[10px] break-all flex-1">{webhookUrl}</code>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    toast.success("Webhook URL copied");
                  }}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
            )}
            {report.registered_webhooks.length > 0 && (
              <div>
                <div className="font-medium mt-2">Webhooks currently in OpenPhone:</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {report.registered_webhooks.map((w) => (
                    <li key={w.id} className="break-all">
                      {w.url}{" "}
                      <span className="text-muted-foreground">
                        ({w.events.join(", ") || "no events"})
                      </span>
                    </li>
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
