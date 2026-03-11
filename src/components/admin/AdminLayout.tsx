import { ReactNode, Suspense, lazy, useState } from 'react';
import AdminHelpChat from './AdminHelpChat';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { OfflineIndicator } from './OfflineIndicator';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';
import { usePlatform } from '@/hooks/usePlatform';
import { useBrandingColors } from '@/hooks/useBrandingColors';

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
  const { canShowPaymentFlows } = usePlatform();
  const location = useLocation();
  
  // Apply org branding colors to entire CRM theme
  useBrandingColors();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className={cn(
        "transition-all duration-300 min-h-screen",
        "pl-0 md:pl-16",
        sidebarOpen && "md:pl-64"
      )}>
        <AdminHeader title={title} subtitle={subtitle} actions={actions} />

        <main
          className={cn(
            "animate-page-enter overflow-y-auto",
            "p-1.5 md:p-4 pt-1.5 md:pt-4 pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-4"
          )}
        >
          {children}
        </main>
      </div>

      {/* Only show subscription dialog when payment flows are allowed */}
      {canShowPaymentFlows && (
        <Suspense fallback={null}>
          {showSubscriptionDialog ? (
            <SubscriptionDialog
              open={showSubscriptionDialog}
              onOpenChange={setShowSubscriptionDialog}
              onSubscriptionActive={checkSubscription}
            />
          ) : null}
        </Suspense>
      )}
      
      <OfflineIndicator />
      <AdminHelpChat />
      <MobileBottomNav />
    </div>
  );
}
