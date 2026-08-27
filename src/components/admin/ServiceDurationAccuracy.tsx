/**
 * ServiceDurationAccuracy – which services consistently run over their
 * scheduled duration.
 *
 * A service that habitually runs 40% long is mispriced, not abused: the
 * scheduled duration is wrong, so every job on it is quoted short, capped at
 * payroll, and flagged. Fixing the service duration fixes the cause; capping
 * pay only manages the symptom.
 *
 * Pure query over columns that already exist — cleaner_checkin_at,
 * cleaner_checkout_at, duration, service_id. No new storage.
 *
 * Bookings with no service, or whose service has duration 0, are excluded:
 * bookings.duration is BookingStepper's `selectedService?.duration || 60` for
 * those, so the ratio would compare against a default rather than a real
 * scheduled time and a genuine 3h re-clean would read as 200% over.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { QueryError } from '@/components/QueryError';

/** Below this many completed, clocked jobs a service's average is noise. */
const MIN_JOBS = 5;

interface ServiceRow {
  serviceName: string;
  jobs: number;
  avgRatio: number;
  overCount: number;
  avgScheduledHours: number;
  avgActualHours: number;
}

export function ServiceDurationAccuracy() {
  const { organizationId } = useOrgId();

  const { data: rows = [], isLoading, error: rowsError } = useQuery({
    queryKey: ['service-duration-accuracy', organizationId],
    queryFn: async (): Promise<ServiceRow[]> => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('duration, cleaner_checkin_at, cleaner_checkout_at, service_id, service:services(name, duration)')
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .not('service_id', 'is', null)
        .not('cleaner_checkin_at', 'is', null)
        .not('cleaner_checkout_at', 'is', null);
      if (error) throw error;

      const byService = new Map<string, { sched: number[]; actual: number[] }>();
      for (const b of (data ?? []) as any[]) {
        const svc = Array.isArray(b.service) ? b.service[0] : b.service;
        // Same trustworthiness rule as the reconcile step in StaffPortal.
        if (!svc?.name || Number(svc.duration ?? 0) <= 0) continue;

        const checkin = new Date(b.cleaner_checkin_at).getTime();
        const checkout = new Date(b.cleaner_checkout_at).getTime();
        if (!Number.isFinite(checkin) || !Number.isFinite(checkout) || checkout <= checkin) continue;

        const sched = Number(b.duration || 0) / 60;
        if (sched <= 0) continue;

        const entry = byService.get(svc.name) ?? { sched: [], actual: [] };
        entry.sched.push(sched);
        entry.actual.push((checkout - checkin) / (1000 * 60 * 60));
        byService.set(svc.name, entry);
      }

      const out: ServiceRow[] = [];
      for (const [serviceName, e] of byService) {
        if (e.sched.length < MIN_JOBS) continue;
        const avgScheduledHours = e.sched.reduce((a, b) => a + b, 0) / e.sched.length;
        const avgActualHours = e.actual.reduce((a, b) => a + b, 0) / e.actual.length;
        out.push({
          serviceName,
          jobs: e.sched.length,
          avgScheduledHours,
          avgActualHours,
          avgRatio: avgScheduledHours > 0 ? avgActualHours / avgScheduledHours : 0,
          overCount: e.actual.filter((a, i) => a > e.sched[i] * 1.25).length,
        });
      }
      return out.sort((a, b) => b.avgRatio - a.avgRatio);
    },
    enabled: !!organizationId,
  });

  const worst = useMemo(() => rows.filter((r) => r.avgRatio >= 1.25), [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Service Duration Accuracy</CardTitle>
        <CardDescription>
          How long each service actually takes versus how long it's scheduled for,
          from completed jobs with a clock-in and clock-out. A service that
          consistently runs over is scheduled too short — the fix is the service's
          duration, not the cleaner's pay.
          {' '}Services with fewer than {MIN_JOBS} clocked jobs are hidden.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rowsError ? (
          <QueryError subject="service duration accuracy" />
        ) : isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not enough completed jobs with clock-in and clock-out times yet.
          </p>
        ) : (
          <>
            {worst.length > 0 && (
              <p className="mb-4 text-sm">
                <span className="font-medium text-warning">{worst.length}</span>{' '}
                {worst.length === 1 ? 'service runs' : 'services run'} more than 25% over
                scheduled on average.
              </p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Scheduled</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Ratio</TableHead>
                    <TableHead className="text-right">Over 25%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.serviceName}>
                      <TableCell className="font-medium">{r.serviceName}</TableCell>
                      <TableCell className="text-right">{r.jobs}</TableCell>
                      <TableCell className="text-right">{r.avgScheduledHours.toFixed(1)}h</TableCell>
                      <TableCell className="text-right">{r.avgActualHours.toFixed(1)}h</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.avgRatio >= 1.25 ? 'destructive' : 'secondary'}>
                          {(r.avgRatio * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.overCount}/{r.jobs}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
