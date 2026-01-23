import { ReactNode, Suspense, lazy, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { OfflineIndicator } from './OfflineIndicator';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// Performance: only load subscription UI when it's actually needed (opened).
const SubscriptionDialog = lazy(() =>
  import('./SubscriptionDialog').then((m) => ({ default: m.SubscriptionDialog }))
);

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AdminLayout({ children, title, subtitle, actions }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { showSubscriptionDialog, setShowSubscriptionDialog, checkSubscription } = useAuth();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className={cn(
        "transition-all duration-300 min-h-screen",
        "pl-0 md:pl-16",
        sidebarOpen && "md:pl-64"
      )}>
        <AdminHeader title={title} subtitle={subtitle} actions={actions} />
        {/*
          AdminHeader is sticky (not overlay), so we don't need the large top padding.
          Keeping this compact avoids the “huge header” feel on mobile across all admin pages.
        */}
        <main className="p-4 md:p-6 pt-4 md:pt-6 pb-24 md:pb-6 animate-page-enter overflow-y-auto">
          {children}
        </main>
      </div>
      
      <Suspense fallback={null}>
        {showSubscriptionDialog ? (
          <SubscriptionDialog
            open={showSubscriptionDialog}
            onOpenChange={setShowSubscriptionDialog}
            onSubscriptionActive={checkSubscription}
          />
        ) : null}
      </Suspense>
      
      <OfflineIndicator />
    </div>
  );
}
