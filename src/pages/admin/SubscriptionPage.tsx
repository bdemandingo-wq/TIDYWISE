import { AdminLayout } from "@/components/admin/AdminLayout";
import { SEOHead } from '@/components/SEOHead';

export default function SubscriptionPage() {
  return (
    <AdminLayout title="Subscription" subtitle="Your TidyWise plan">
      <SEOHead title="Subscription | TidyWise" description="TidyWise subscription" noIndex />
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-center max-w-md">
          TidyWise is free to use. Existing subscribers can manage billing at{' '}
          <a href="https://www.jointidywise.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">
            www.jointidywise.com
          </a>
        </p>
      </div>
    </AdminLayout>
  );
}
