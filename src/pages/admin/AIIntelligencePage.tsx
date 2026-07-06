import { AdminLayout } from '@/components/admin/AdminLayout';
import { AIAnalysisCenter } from '@/components/admin/AIAnalysisCenter';
import { PlanFeatureGate } from '@/components/admin/PlanFeatureGate';
import { SEOHead } from '@/components/SEOHead';
import { AiCreditsMeter } from '@/components/ai-credits/AiCreditsMeter';

export default function AIIntelligencePage() {
  return (
    <AdminLayout
      title="AI Intelligence"
      subtitle="Predictive insights powered by machine learning"
    >
      <SEOHead title="AI Intelligence | TidyWise" description="Predictive insights powered by machine learning" noIndex />
      <PlanFeatureGate feature="ai_intelligence">
        <div className="flex justify-end mb-3">
          <AiCreditsMeter />
        </div>
        <AIAnalysisCenter />
      </PlanFeatureGate>
    </AdminLayout>
  );
}
