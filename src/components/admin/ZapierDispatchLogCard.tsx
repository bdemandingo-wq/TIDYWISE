import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Loader2, History, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';

interface LogRow {
  id: string;
  organization_id: string;
  webhook_id: string | null;
  event_type: string;
  status_code: number | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export function ZapierDispatchLogCard() {
  const { organization } = useOrganization();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!organization?.id) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('zapier_dispatch_log')
      .select('id,organization_id,webhook_id,event_type,status_code,success,error_message,created_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      toast.error('Failed to load dispatch log');
    } else {
      setRows((data ?? []) as LogRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Dispatch log
          </CardTitle>
          <CardDescription>
            Recent Zapier delivery attempts for this organization (last 50). Use for debugging
            failed events.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No dispatch attempts yet.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-md border p-2 text-xs"
              >
                {r.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <span className="text-muted-foreground shrink-0 w-40">
                  {new Date(r.created_at).toLocaleString()}
                </span>
                <Badge variant="outline" className="font-mono shrink-0">
                  {r.event_type}
                </Badge>
                <Badge variant="secondary" className="shrink-0">
                  HTTP {r.status_code ?? '—'}
                </Badge>
                {r.error_message && (
                  <span className="text-destructive truncate" title={r.error_message}>
                    {r.error_message}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
