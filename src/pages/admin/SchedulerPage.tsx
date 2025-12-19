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

export default function SchedulerPage() {
  const { data: staff = [] } = useStaff();
  const { data: bookings = [] } = useBookings();
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: 'csv' | 'json') => {
    setExporting(true);
    try {
      if (type === 'csv') {
        const headers = ['Booking #', 'Customer', 'Service', 'Date', 'Time', 'Staff', 'Status', 'Amount'];
        const rows = bookings.map(b => [
          b.booking_number,
          b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
          b.service?.name || 'Unknown',
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

  // Get unique colors for staff
  const staffColors = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'
  ];

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
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>All Bookings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Pending</DropdownMenuItem>
              <DropdownMenuItem>Confirmed</DropdownMenuItem>
              <DropdownMenuItem>Completed</DropdownMenuItem>
              <DropdownMenuItem>Cancelled</DropdownMenuItem>
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
          {staff.map((s, index) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: staffColors[index % staffColors.length] }}
              />
              <span className="text-sm">{s.name}</span>
            </div>
          ))}
        </div>
      )}

      <SchedulerCalendar />
    </AdminLayout>
  );
}
