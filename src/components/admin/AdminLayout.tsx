import { ReactNode, Suspense, lazy, useState } from 'react';
import AdminHelpChat from './AdminHelpChat';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { NativeAdminHeader } from './NativeAdminHeader';
import { OfflineIndicator } from './OfflineIndicator';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import { useLocation } from 'react-router-dom';
import { usePlatform } from '@/hooks/usePlatform';
import { useBrandingColors } from '@/hooks/useBrandingColors';

// Performance: only load subscription UI when it's actually needed (opened).
// Only load on web - native apps don't show payment dialogs (App Store compliance)
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
  const { canShowPaymentFlows, isNative } = usePlatform();
  const location = useLocation();
  
  // Apply org branding colors to entire CRM theme
  useBrandingColors();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Show sidebar on web only — native uses NativeAdminHeader drawer */}
      {!isNative && (
        <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      )}

      <div className={cn(
        "transition-all duration-300 min-h-screen",
        isNative ? "pl-0" : "pl-0 md:pl-16",
        !isNative && sidebarOpen && "md:pl-64"
      )}>
        {isNative ? (
          <NativeAdminHeader title={title} subtitle={subtitle} actions={actions} />
        ) : (
          <AdminHeader title={title} subtitle={subtitle} actions={actions} />
        )}

        <main
          className={cn(
            "animate-page-enter overflow-y-auto",
            "p-2 md:p-4 pt-2 md:pt-4 pb-24 md:pb-4"
          )}
        >
          {children}
        </main>
      </div>

      {/* Bottom nav on both web mobile and native */}
      <MobileBottomNav />
      
      {/* Only show subscription dialog on web - native apps direct to website */}
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
      {!isNative && <AdminHelpChat />}
    </div>
  );
}
