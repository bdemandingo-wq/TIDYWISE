import { AdminLayout } from '@/components/admin/AdminLayout';
import { SchedulerCalendar } from '@/components/admin/SchedulerCalendar';
import { mockStaff } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Filter, Download } from 'lucide-react';

export default function SchedulerPage() {
  return (
    <AdminLayout
      title="Scheduler"
      subtitle="Manage your bookings and appointments"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      }
    >
      {/* Staff Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Staff:</span>
        {mockStaff.map((staff) => (
          <div key={staff.id} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: staff.color }}
            />
            <span className="text-sm">{staff.name}</span>
          </div>
        ))}
      </div>

      <SchedulerCalendar />
    </AdminLayout>
  );
}
