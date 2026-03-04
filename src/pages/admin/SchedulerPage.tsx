import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SchedulerCalendar } from '@/components/admin/SchedulerCalendar';
import { useStaff, useBookings } from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';
import { Filter, Download, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTestMode } from '@/contexts/TestModeContext';

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
  const { maskName } = useTestMode();

  const handleExport = async (type: 'csv' | 'json') => {
    setExporting(true);
    try {
      if (type === 'csv') {
        const headers = ['Booking #', 'Customer', 'Service', 'Date', 'Time', 'Staff', 'Status', 'Amount'];
        const rows = bookings.map(b => [
          b.booking_number,
          b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
          b.service?.name || (b.total_amount === 0 ? 'Re-clean' : 'Service'),
          format(new Date(b.scheduled_at), 'yyyy-MM-dd'),
          format(new Date(b.scheduled_at), 'h:mm a'),
          b.staff?.name || 'Unassigned',
          b.status,
          `$${b.total_amount}`
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookings-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(bookings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookings-${format(new Date(), 'yyyy-MM-dd')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Export completed');
    } catch (error) {
      toast.error('Failed to export');
    } finally {
      setExporting(false);
    }
  };

  // Must match SchedulerCalendar palette exactly
  const STAFF_COLOR_PALETTE = [
    '#1d4ed8', '#15803d', '#7c3aed', '#c2410c', '#be185d', '#0e7490',
    '#b91c1c', '#4338ca', '#0f766e', '#a21caf', '#ca8a04', '#0369a1'
  ];
  
  // Create color map using custom colors when available, fallback to palette
  const sortedStaff = [...staff].sort((a, b) => a.id.localeCompare(b.id));
  const staffColorMap = new Map<string, string>();
  sortedStaff.forEach((s, index) => {
    // Use custom calendar_color if set, otherwise use palette
    const color = (s as any).calendar_color || STAFF_COLOR_PALETTE[index % STAFF_COLOR_PALETTE.length];
    staffColorMap.set(s.id, color);
  });

  return (
    <AdminLayout
      title="Scheduler"
      subtitle="Manage your bookings and appointments"
      actions={
        <div className="flex items-center gap-2">
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
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {/* Staff Legend */}
      {staff.length > 0 && (
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Staff:</span>
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: staffColorMap.get(s.id) || '#6b7280' }}
              />
              <span className="text-sm">{maskName(s.name)}</span>
            </div>
          ))}
        </div>
      )}

      <SchedulerCalendar statusFilter={statusFilter} />
    </AdminLayout>
  );
}
