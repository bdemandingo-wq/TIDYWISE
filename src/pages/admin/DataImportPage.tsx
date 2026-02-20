import { AdminLayout } from '@/components/admin/AdminLayout';
import { MigrationWizard } from '@/components/admin/MigrationWizard';

export default function DataImportPage() {
  return (
    <AdminLayout
      title="Import Data"
      subtitle="Migrate your data from BookingKoala or Jobber"
    >
      <div className="max-w-3xl mx-auto">
        <MigrationWizard />
      </div>
    </AdminLayout>
  );
}
