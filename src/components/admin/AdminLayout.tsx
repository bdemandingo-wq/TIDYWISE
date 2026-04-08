import { ReactNode, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { OfflineIndicator } from './OfflineIndicator';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';
import { useBrandingColors } from '@/hooks/useBrandingColors';
import { useIsMobile } from '@/hooks/use-mobile';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AdminLayout({ children, title, subtitle, actions }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  
  // Apply org branding colors to entire CRM theme
  useBrandingColors();

  // Hide the top header bar on mobile for immersive tabs (Messages, Scheduler)
  const isMobileView = useIsMobile();
  const hideHeader = isMobileView && (
    location.pathname.includes('/messages') ||
    location.pathname.includes('/scheduler') ||
    location.pathname.includes('/calendar')
  );

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className={cn(
        "transition-all duration-300 min-h-screen",
        "pl-0 md:pl-16",
        sidebarOpen && "md:pl-64"
      )}>
        {!hideHeader && <AdminHeader title={title} subtitle={subtitle} actions={actions} />}

        <main
          className={cn(
            "animate-page-enter overflow-y-auto flex-1",
            "p-1.5 md:p-4 pt-1.5 md:pt-4 pb-[calc(3rem+env(safe-area-inset-bottom))] md:pb-4"
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
      
      <MobileBottomNav />
    </div>
  );
}
