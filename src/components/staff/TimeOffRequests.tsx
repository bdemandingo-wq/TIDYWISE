import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CalendarOff, Send, Loader2, Trash2 } from 'lucide-react';

interface Props {
  staffId: string;
  organizationId: string;
}

interface Row {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'denied';
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const statusStyle: Record<Row['status'], string> = {
  pending: 'bg-warning/15 text-warning-foreground border-warning/40',
  approved: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40',
  denied: 'bg-destructive/15 text-destructive border-destructive/40',
};

export function TimeOffRequests({ staffId, organizationId }: Props) {
  const qc = useQueryClient();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['time-off', staffId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('time_off_requests')
        .select('*')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!staffId,
  });

  useEffect(() => {
    if (!staffId) return;
    const ch = supabase
      .channel(`time-off-${staffId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_off_requests', filter: `staff_id=eq.${staffId}` }, () => {
        qc.invalidateQueries({ queryKey: ['time-off', staffId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [staffId, qc]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!start || !end) throw new Error('Pick a start and end date');
      if (end < start) throw new Error('End date must be on or after start date');
      const { data, error } = await (supabase as any)
        .from('time_off_requests')
        .insert({ staff_id: staffId, organization_id: organizationId, start_date: start, end_date: end, reason: reason.trim() || null })
        .select()
        .single();
      if (error) throw error;
      // Fire-and-forget admin notification
      supabase.functions.invoke('notify-time-off-request', {
        body: { requestId: data.id, event: 'created' },
      }).catch(() => {});
      return data;
    },
    onSuccess: () => {
      toast.success('Request submitted');
      setStart(''); setEnd(''); setReason('');
      qc.invalidateQueries({ queryKey: ['time-off', staffId] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit'),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('time_off_requests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Request withdrawn');
      qc.invalidateQueries({ queryKey: ['time-off', staffId] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5" /> Request Time Off</CardTitle>
          <CardDescription>Your manager will review and approve or deny.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="to-start">Start date</Label>
              <Input id="to-start" type="date" min={today} value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to-end">End date</Label>
              <Input id="to-end" type="date" min={start || today} value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="to-reason">Reason (optional)</Label>
            <Textarea id="to-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Vacation, doctor's appointment, etc." rows={3} />
          </div>
          <Button className="gap-2" disabled={submit.isPending || !start || !end} onClick={() => submit.mutate()}>
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit request
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request history</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">
                        {format(parseISO(r.start_date), 'MMM d, yyyy')}
                        {r.end_date !== r.start_date && ` – ${format(parseISO(r.end_date), 'MMM d, yyyy')}`}
                      </p>
                      <Badge variant="outline" className={`capitalize ${statusStyle[r.status]}`}>{r.status}</Badge>
                    </div>
                    {r.reason && <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>}
                    {r.admin_note && (
                      <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Manager note:</span> {r.admin_note}</p>
                    )}
                  </div>
                  {r.status === 'pending' && (
                    <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={() => cancel.mutate(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Withdraw
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TimeOffRequests;
