import { useRef, useState } from 'react';
import { Download, Loader2, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgRole } from '@/hooks/useOrgRole';
import { saveBlob } from '@/lib/fileActions';
import {
  buildManifest,
  buildOrgExport,
  EXPORT_TABLES,
  type TableExportResult,
} from '@/lib/orgDataExport';

/**
 * "Download all my data" — one zip of CSVs, one file per table.
 *
 * Owner-only. Note that this gate is UI-only and is NOT enforced by the
 * database: a manager can already read payroll_payments directly through the
 * API. payroll_payments carries a policy literally named "Financial:
 * owner+admin only" (has_org_financial_access, which is owner-only), but two
 * other PERMISSIVE policies on the same table use is_org_admin(), which
 * accepts owner, admin AND manager — and permissive policies OR together, so
 * the narrow one grants nothing the broad ones did not already allow.
 * Verified against the live database: a manager in TIDYWISE reads all 31
 * payroll rows. Restricting the button is worth doing, but it is a UX decision
 * until those policies are reconciled, not a security boundary.
 */
export function OrgDataExportCard() {
  const { organization } = useOrganization();
  const { isOwner } = useOrgRole();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0, label: '' });
  const [results, setResults] = useState<TableExportResult[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Owners only. Rendering nothing is deliberate: a disabled control invites
  // "why can't I?" from a manager who cannot be given the answer anyway.
  if (!isOwner) return null;

  const handleExport = async () => {
    if (!organization?.id) {
      toast.error('No organisation selected');
      return;
    }

    setIsExporting(true);
    setResults(null);
    setProgress({ completed: 0, total: EXPORT_TABLES.length, label: 'Starting' });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const exported = await buildOrgExport(
        organization.id,
        (p) => setProgress({ completed: p.completed, total: p.total, label: p.currentLabel }),
        controller.signal,
      );
      setResults(exported);

      // Stamped here rather than inside the export so the builder stays free of
      // clock reads — the same reason the workflow scripts avoid Date.now().
      const generatedAt = new Date();
      /* eslint-disable-next-line local/no-device-local-dates -- names a download file with the UTC day; the manifest carries the full ISO instant, and nothing downstream parses this stamp */
      const stamp = generatedAt.toISOString().slice(0, 10);
      const slug = (organization.name || 'organisation')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const files = [
        // Empty tables ship as empty files on purpose: a predictable, complete
        // set beats one where absence is ambiguous.
        ...exported.map((r) => ({
          name: `${r.file}.csv`,
          // A UTF-8 BOM so Excel opens accented names correctly instead of
          // mojibake. Numbers and Sheets both tolerate it.
          input: new Blob(['﻿' + r.csv], { type: 'text/csv;charset=utf-8' }),
        })),
        {
          name: 'MANIFEST.csv',
          input: new Blob([
            '﻿' + buildManifest(organization.name || '', exported, generatedAt.toISOString()),
          ]),
        },
      ];

      const { downloadZip } = await import('client-zip');
      const blob = await downloadZip(files).blob();
      await saveBlob(blob, `tidywise-export-${slug}-${stamp}.zip`);

      const incomplete = exported.filter((r) => r.error);
      const totalRows = exported.reduce((sum, r) => sum + r.rowCount, 0);

      if (incomplete.length > 0) {
        // Never a bare success when part of it failed — a partial export that
        // reports success is the failure mode this whole feature exists to
        // avoid.
        toast.warning(
          `Exported ${totalRows.toLocaleString()} rows, but ${incomplete.length} table(s) had problems. See the summary below and MANIFEST.csv.`,
          { duration: 8000 },
        );
      } else {
        toast.success(
          `Exported ${totalRows.toLocaleString()} rows across ${exported.length} tables.`,
        );
      }
    } catch (err) {
      console.error('[org-export] failed:', err);
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const incomplete = results?.filter((r) => r.error) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="w-5 h-5" />
          Export all your data
        </CardTitle>
        <CardDescription>
          Downloads every business record this organisation owns as a zip of CSV files — one file
          per table, plus a manifest listing row counts. Customers, bookings, invoices, staff,
          payroll, expenses, messages and more.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleExport} disabled={isExporting} className="gap-2 min-h-[44px]">
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {isExporting ? 'Preparing your export…' : 'Download all data'}
        </Button>

        {isExporting && (
          <div className="space-y-2">
            <Progress value={pct} />
            <p className="text-xs text-muted-foreground">
              {progress.completed} of {progress.total} — {progress.label}
            </p>
          </div>
        )}

        {results && !isExporting && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              {incomplete.length === 0 ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  All {results.length} tables exported
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  {incomplete.length} of {results.length} tables had problems
                </>
              )}
            </p>
            {incomplete.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1">
                {incomplete.map((r) => (
                  <li key={r.table}>
                    <span className="font-medium">{r.label}</span>: {r.error}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {results.reduce((s, r) => s + r.rowCount, 0).toLocaleString()} rows total.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
