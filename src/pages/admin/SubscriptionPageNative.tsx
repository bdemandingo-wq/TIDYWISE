import { AdminLayout } from "@/components/admin/AdminLayout";
import { SEOHead } from '@/components/SEOHead';

export default function SubscriptionPageNative() {
  return (
    <AdminLayout title="Subscription" subtitle="Your TidyWise plan">
<div className="portal-v2 portal-v2-scroll">
      <SEOHead title="Subscription | TidyWise" description="TidyWise subscription" noIndex />
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-center max-w-md">
          Manage your TidyWise subscription by visiting{' '}
          <span className="font-medium text-foreground">jointidywise.com</span>{' '}
          in your browser.
        </p>
      </div>
    </div>
</AdminLayout>
  );
}
