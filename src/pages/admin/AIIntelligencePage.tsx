import { AdminLayout } from '@/components/admin/AdminLayout';
import { AIAnalysisCenter } from '@/components/admin/AIAnalysisCenter';

export default function AIIntelligencePage() {
  return (
    <AdminLayout
      title="AI Intelligence"
      subtitle="Predictive insights powered by machine learning"
    >
      <AIAnalysisCenter />
    </AdminLayout>
  );
}
