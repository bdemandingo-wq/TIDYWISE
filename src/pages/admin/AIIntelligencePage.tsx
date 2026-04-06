import { AdminLayout } from '@/components/admin/AdminLayout';
import { AIAnalysisCenter } from '@/components/admin/AIAnalysisCenter';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { SEOHead } from '@/components/SEOHead';

export default function AIIntelligencePage() {
  return (
    <AdminLayout
      title="AI Intelligence"
      subtitle="Predictive insights powered by machine learning"
    >
      <SEOHead title="AI Intelligence | TidyWise" description="Predictive insights powered by machine learning" noIndex />
      <SubscriptionGate feature="AI Intelligence">
        <AIAnalysisCenter />
      </SubscriptionGate>
    </AdminLayout>
  );
}
