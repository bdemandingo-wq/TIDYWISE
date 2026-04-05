import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SchedulerCalendar } from '@/components/admin/SchedulerCalendar';
import { useStaff, useBookings } from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';
import { Filter, Download, Loader2, Users, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTestMode } from '@/contexts/TestModeContext';
import { SEOHead } from '@/components/SEOHead';

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

const filterLabels: Record<StatusFilter, string> = {
  all: 'All Bookings',
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function SchedulerPage() {
  const { data: staff = [] } = useStaff();
  const { data: bookings = [] } = useBookings();
  const [exporting, setExporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [staffFilter, setStaffFilter] = useState<string | null>(null);
  const { maskName } = useTestMode();

  const getExportRows = () => {
    const headers = ['Booking #', 'Customer', 'Service', 'Date', 'Time', 'Staff', 'Status', 'Amount'];
    const rows = bookings.map(b => [
      String(b.booking_number),
      b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
      b.service?.name || (b.total_amount === 0 ? 'Re-clean' : 'Service'),
      format(new Date(b.scheduled_at), 'yyyy-MM-dd'),
      format(new Date(b.scheduled_at), 'h:mm a'),
      b.staff?.name || 'Unassigned',
      b.status,
      `$${b.total_amount}`
    ]);
    return { headers, rows };
  };

  const handleExport = async (type: 'csv' | 'json' | 'xlsx' | 'pdf' | 'print') => {
    setExporting(true);
    try {
      const { headers, rows } = getExportRows();
      const filename = `bookings-${format(new Date(), 'yyyy-MM-dd')}`;

      if (type === 'csv') {
        const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (type === 'json') {
        const blob = new Blob([JSON.stringify(bookings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (type === 'xlsx') {
        const XLSX = await import('xlsx');
        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = headers.map(() => ({ wch: 18 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
        XLSX.writeFile(wb, `${filename}.xlsx`);
      } else if (type === 'pdf') {
        const { default: jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(18);
        doc.setTextColor(40, 40, 40);
        doc.text('TidyWise — Bookings Report', 14, 18);
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text(`Generated ${format(new Date(), 'MMMM d, yyyy h:mm a')}  •  ${bookings.length} bookings`, 14, 26);
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 32,
          theme: 'grid',
          headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 14, right: 14 },
        });
        doc.save(`${filename}.pdf`);
      } else if (type === 'print') {
        const printWin = window.open('', '_blank');
        if (!printWin) { toast.error('Popup blocked — please allow popups'); return; }
        const tableRows = rows.map(r => `<tr>${r.map(c => `<td style="padding:6px 10px;border:1px solid #ddd;font-size:13px">${c}</td>`).join('')}</tr>`).join('');
        printWin.document.write(`<!DOCTYPE html><html><head><title>Bookings</title><style>body{font-family:Arial,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}th{background:#2563eb;color:#fff;padding:8px 10px;font-size:13px;text-align:left}h1{font-size:20px;margin-bottom:4px}p{color:#888;font-size:13px;margin-bottom:16px}@media print{body{margin:0}}</style></head><body><h1>TidyWise — Bookings Report</h1><p>Generated ${format(new Date(), 'MMMM d, yyyy h:mm a')} • ${bookings.length} bookings</p><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`);
        printWin.document.close();
        printWin.focus();
        printWin.print();
      }
      if (type !== 'print') toast.success('Export completed');
    } catch (error) {
      toast.error('Failed to export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout
      title="Scheduler"
      subtitle="Manage your bookings and appointments"
      actions={
        <div className="flex items-center gap-2">
      <SEOHead title="Scheduler | TidyWise" description="Schedule and assign cleaning jobs" noIndex />
          {/* Staff Filter Dropdown */}
          <Select
            value={staffFilter || 'all'}
            onValueChange={(v) => setStaffFilter(v === 'all' ? null : v)}
          >
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <Users className="w-4 h-4 mr-1.5 shrink-0" />
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {maskName(s.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                {filterLabels[statusFilter]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                All Bookings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setStatusFilter('pending')}>
                Pending
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('confirmed')}>
                Confirmed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('in_progress')}>
                In Progress
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('completed')}>
                Completed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('cancelled')}>
                Cancelled
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" disabled={exporting}>
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                <Download className="w-4 h-4 mr-2" /> Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                <Download className="w-4 h-4 mr-2" /> Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('xlsx')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('pdf')}>
                <FileText className="w-4 h-4 mr-2" /> Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('print')}>
                <Printer className="w-4 h-4 mr-2" /> Print View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <SchedulerCalendar statusFilter={statusFilter} staffFilter={staffFilter} />
    </AdminLayout>
  );
}
