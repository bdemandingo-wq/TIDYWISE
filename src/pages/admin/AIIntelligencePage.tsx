import { AdminLayout } from '@/components/admin/AdminLayout';
import { AIIntelligenceDashboard } from '@/components/admin/AIIntelligenceDashboard';
import { Brain } from 'lucide-react';

export default function AIIntelligencePage() {
  return (
    <AdminLayout
      title="AI Intelligence"
      subtitle="Predictive insights powered by machine learning"
    >
      <AIIntelligenceDashboard />
    </AdminLayout>
  );
}
