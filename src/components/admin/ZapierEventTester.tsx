import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Loader2, Play, FileJson, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  ZAPIER_EVENT_META,
  ZAPIER_SAMPLE_PAYLOADS,
  buildSampleEnvelope,
} from '@/lib/zapierEventSamples';
import type { ZapierEvent } from '@/lib/zapier';

interface RunResult {
  dispatched: number;
  envelope: unknown;
  results: Array<{
    webhook_id: string;
    status: number | null;
    success: boolean;
    attempts: number;
    error: string | null;
  }>;
}

export function ZapierEventTester() {
  const { organization } = useOrganization();
  const [running, setRunning] = useState<ZapierEvent | null>(null);
  const [results, setResults] = useState<Partial<Record<ZapierEvent, RunResult>>>({});

  const runTest = async (event: ZapierEvent) => {
    if (!organization?.id) return;
    setRunning(event);
    try {
      const { data, error } = await supabase.functions.invoke('zapier-dispatch', {
        body: {
          organization_id: organization.id,
          event_type: event,
          payload: ZAPIER_SAMPLE_PAYLOADS[event],
        },
      });
      if (error) throw error;
      const result = data as RunResult;
      setResults((prev) => ({ ...prev, [event]: result }));
      if (result.dispatched === 0) {
        toast.info('No active webhooks for this event. Add one below first.');
      } else if (result.results.every((r) => r.success)) {
        toast.success(`Test fired to ${result.dispatched} webhook(s)`);
      } else {
        toast.error('Some webhooks returned errors. See details.');
      }
    } catch (e) {
      toast.error('Failed to send test');
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="h-5 w-5 text-primary" />
          Event payload preview & test
        </CardTitle>
        <CardDescription>
          Preview the exact JSON each event sends to Zapier, then fire a test with sample data
          to any active webhooks for that event.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {ZAPIER_EVENT_META.map((meta) => {
            const envelope = buildSampleEnvelope(
              meta.value,
              organization?.id ?? '<organization_id>',
            );
            const result = results[meta.value];
            return (
              <AccordionItem key={meta.value} value={meta.value}>
                <AccordionTrigger>
                  <div className="flex items-center gap-3 text-left">
                    <Badge variant="outline" className="font-mono text-xs">
                      {meta.value}
                    </Badge>
                    <span className="text-sm">{meta.label}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{meta.description}</p>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                        Sample payload sent to Zapier
                      </p>
                      <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-72">
{JSON.stringify(envelope, null, 2)}
                      </pre>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => runTest(meta.value)}
                        disabled={running === meta.value}
                      >
                        {running === meta.value ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Play className="h-4 w-4 mr-1" />
                        )}
                        Send test
                      </Button>
                      {result && (
                        <span className="text-xs text-muted-foreground">
                          Dispatched to {result.dispatched} webhook(s)
                        </span>
                      )}
                    </div>
                    {result && result.results.length > 0 && (
                      <div className="space-y-2 pt-2">
                        {result.results.map((r) => (
                          <div
                            key={r.webhook_id}
                            className="flex items-center gap-2 text-xs rounded border p-2"
                          >
                            {r.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            <span className="font-mono truncate">{r.webhook_id}</span>
                            <Badge variant="secondary">HTTP {r.status ?? '—'}</Badge>
                            <Badge variant="outline">{r.attempts} attempt(s)</Badge>
                            {r.error && (
                              <span className="text-destructive truncate">{r.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
