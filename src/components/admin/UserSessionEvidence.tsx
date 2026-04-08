import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { Search, FileDown, Loader2, Clock, CalendarDays, Activity, Timer } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SessionRow {
  id: string;
  session_start: string;
  session_end: string | null;
  duration_seconds: number;
  is_active: boolean;
}

interface SessionReport {
  email: string;
  totalSessions: number;
  firstSession: string;
  lastSession: string;
  totalDurationSeconds: number;
  sessions: SessionRow[];
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '< 1m';
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function UserSessionEvidence() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error('Please enter an email address');
      return;
    }

    setLoading(true);
    setSearched(true);
    setReport(null);

    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('id, session_start, session_end, duration_seconds, is_active')
        .eq('user_email', trimmed)
        .order('session_start', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        setReport(null);
        setLoading(false);
        return;
      }

      const sessions: SessionRow[] = data;
      const totalDuration = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
      const sorted = [...sessions].sort((a, b) => new Date(a.session_start).getTime() - new Date(b.session_start).getTime());

      setReport({
        email: trimmed,
        totalSessions: sessions.length,
        firstSession: sorted[0].session_start,
        lastSession: sorted[sorted.length - 1].session_start,
        totalDurationSeconds: totalDuration,
        sessions,
      });
    } catch (err: any) {
      toast.error('Failed to fetch session data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    if (!report) return;

    const doc = new jsPDF({ orientation: 'landscape' });
    const now = format(new Date(), 'MMMM d, yyyy h:mm a');

    // Header
    doc.setFontSize(18);
    doc.text('TidyWise Usage Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated ${now} — For dispute reference`, 14, 28);
    doc.text(`User: ${report.email}`, 14, 34);

    // Summary
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Summary', 14, 46);

    autoTable(doc, {
      startY: 50,
      head: [['Metric', 'Value']],
      body: [
        ['Total Sessions', String(report.totalSessions)],
        ['First Session', format(new Date(report.firstSession), 'MMM d, yyyy h:mm a')],
        ['Last Session', format(new Date(report.lastSession), 'MMM d, yyyy h:mm a')],
        ['Total Time in Platform', formatDuration(report.totalDurationSeconds)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30] },
      margin: { left: 14 },
    });

    // Session details
    const finalY = (doc as any).lastAutoTable?.finalY || 100;
    doc.setFontSize(12);
    doc.text('Session Log', 14, finalY + 12);

    autoTable(doc, {
      startY: finalY + 16,
      head: [['#', 'Date', 'Start Time', 'End Time', 'Duration', 'Status']],
      body: report.sessions.map((s, i) => [
        String(i + 1),
        format(new Date(s.session_start), 'MMM d, yyyy'),
        format(new Date(s.session_start), 'h:mm a'),
        s.session_end ? format(new Date(s.session_end), 'h:mm a') : '—',
        formatDuration(s.duration_seconds),
        s.is_active ? 'Active' : 'Ended',
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30] },
      margin: { left: 14 },
      styles: { fontSize: 9 },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `TidyWise Usage Report — ${report.email} — Page ${i} of ${pageCount}`,
        14,
        doc.internal.pageSize.height - 10
      );
    }

    const fileName = `TidyWise_Usage_Report_${report.email.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(fileName);
    toast.success('PDF exported');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          User Session Evidence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Search by email to view session history. Export as PDF for dispute reference.
        </p>

        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-sm"
          />
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Search</span>
          </Button>
        </div>

        {/* No results */}
        {searched && !loading && !report && (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No session data found for this email</p>
          </div>
        )}

        {/* Results */}
        {report && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Activity className="h-3.5 w-3.5" />
                  Total Sessions
                </div>
                <p className="text-xl font-bold">{report.totalSessions}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  First Session
                </div>
                <p className="text-sm font-semibold">{format(new Date(report.firstSession), 'MMM d, yyyy')}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  Last Session
                </div>
                <p className="text-sm font-semibold">{format(new Date(report.lastSession), 'MMM d, yyyy')}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Timer className="h-3.5 w-3.5" />
                  Total Time
                </div>
                <p className="text-xl font-bold">{formatDuration(report.totalDurationSeconds)}</p>
              </div>
            </div>

            {/* Export button */}
            <Button variant="outline" onClick={handleExportPDF} className="gap-2">
              <FileDown className="h-4 w-4" />
              Export as PDF
            </Button>

            {/* Session list */}
            <div>
              <h4 className="text-sm font-medium mb-2">Session Log ({report.sessions.length})</h4>
              <ScrollArea className="h-[300px] rounded-md border">
                <div className="divide-y">
                  {report.sessions.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs w-6">{i + 1}</span>
                        <div>
                          <p className="font-medium">
                            {format(new Date(s.session_start), 'MMM d, yyyy')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(s.session_start), 'h:mm a')}
                            {s.session_end && ` — ${format(new Date(s.session_end), 'h:mm a')}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{formatDuration(s.duration_seconds)}</span>
                        <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">
                          {s.is_active ? 'Active' : 'Ended'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
