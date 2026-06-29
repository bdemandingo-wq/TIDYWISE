import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Activity, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';

interface Hook {
  id: string;
  name: string;
  webhook_url: string;
  event_type: string;
  is_active: boolean;
}
interface Stat {
  total: number;
  success: number;
}
interface Validation {
  status: 'idle' | 'checking' | 'ok' | 'fail';
  code?: number | null;
  error?: string | null;
}

export function ZapierWebhookHealthCard() {
  const { organization } = useOrganization();
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [validations, setValidations] = useState<Record<string, Validation>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!organization?.id) return;
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const [{ data: hookData }, { data: logData }] = await Promise.all([
      (supabase as any)
        .from('org_zapier_webhooks')
        .select('id,name,webhook_url,event_type,is_active')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('zapier_dispatch_log')
        .select('webhook_id,success')
        .eq('organization_id', organization.id)
        .gte('created_at', since),
    ]);
    const s: Record<string, Stat> = {};
    (logData ?? []).forEach((r: any) => {
      if (!r.webhook_id) return;
      const cur = s[r.webhook_id] ?? { total: 0, success: 0 };
      cur.total += 1;
      if (r.success) cur.success += 1;
      s[r.webhook_id] = cur;
    });
    setStats(s);
    setHooks((hookData ?? []) as Hook[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const validate = async (h: Hook) => {
    if (!organization?.id) return;
    setValidations((v) => ({ ...v, [h.id]: { status: 'checking' } }));
    try {
      const { data, error } = await supabase.functions.invoke('zapier-dispatch', {
        body: { organization_id: organization.id, validate_webhook_id: h.id, event_type: 'webhook.validate' },
      });
      if (error) throw error;
      const ok = (data as any)?.success;
      setValidations((v) => ({
        ...v,
        [h.id]: {
          status: ok ? 'ok' : 'fail',
          code: (data as any)?.status ?? null,
          error: (data as any)?.error ?? null,
        },
      }));
      toast[ok ? 'success' : 'error'](ok ? 'Webhook reachable' : 'Webhook validation failed');
    } catch (e) {
      setValidations((v) => ({ ...v, [h.id]: { status: 'fail', error: String(e) } }));
      toast.error('Validation failed');
    }
  };

  const validateAll = async () => {
    for (const h of hooks) await validate(h);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Webhook health
          </CardTitle>
          <CardDescription>
            Validate each active webhook and view delivery success rate over the last 24 hours.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => { load(); }} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" /> Refresh</>}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : hooks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No active webhooks. Add and enable one above to monitor health.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={validateAll}>
                Validate all
              </Button>
            </div>
            {hooks.map((h) => {
              const st = stats[h.id] ?? { total: 0, success: 0 };
              const rate = st.total === 0 ? null : Math.round((st.success / st.total) * 100);
              const v = validations[h.id];
              const tone =
                rate === null
                  ? 'text-muted-foreground'
                  : rate >= 95
                    ? 'text-green-600'
                    : rate >= 80
                      ? 'text-yellow-600'
                      : 'text-destructive';
              return (
                <div key={h.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{h.name}</p>
                        <Badge variant="outline" className="font-mono text-xs">{h.event_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{h.webhook_url}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {v?.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      {v?.status === 'fail' && <XCircle className="h-4 w-4 text-destructive" />}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => validate(h)}
                        disabled={v?.status === 'checking'}
                      >
                        {v?.status === 'checking' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Validate'
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={rate ?? 0} className="h-2 flex-1" />
                    <span className={`text-xs font-medium tabular-nums shrink-0 ${tone}`}>
                      {rate === null ? 'No data' : `${rate}%`}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {st.success}/{st.total} · 24h
                    </span>
                  </div>
                  {v?.status === 'fail' && v.error && (
                    <p className="text-xs text-destructive truncate">{v.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
