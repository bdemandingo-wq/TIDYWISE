import { AdminLayout } from '@/components/admin/AdminLayout';
import { MigrationWizard } from '@/components/admin/MigrationWizard';
import { SEOHead } from '@/components/SEOHead';

export default function DataImportPage() {
  return (
    <AdminLayout
      title="Import Data"
      subtitle="Migrate your data from BookingKoala or Jobber"
    >
      <SEOHead title="Import Data | TidyWise" description="Import your data from other platforms" noIndex />
      <div className="max-w-3xl mx-auto">
        <MigrationWizard />
      </div>
    </AdminLayout>
  );
}
