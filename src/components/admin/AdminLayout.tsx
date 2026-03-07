import { ReactNode, Suspense, lazy, useState } from 'react';
import AdminHelpChat from './AdminHelpChat';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
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
      {/* Hide sidebar completely on native */}
      {!isNative && (
        <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      )}

      <div className={cn(
        "transition-all duration-300 min-h-screen",
        isNative
          ? "w-full"
          : cn("pl-0 md:pl-16", sidebarOpen && "md:pl-64")
      )}>
        {/* Hide AdminHeader on native; show inline title instead */}
        {isNative ? (
          <div className="px-4 pt-4 pt-[calc(env(safe-area-inset-top)+16px)]">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        ) : (
          <AdminHeader title={title} subtitle={subtitle} actions={actions} />
        )}

        <main
          className={cn(
            "animate-page-enter overflow-y-auto",
            isNative
              ? "px-4 pt-4 pb-28"
              : "p-2 md:p-4 pt-2 md:pt-4 pb-24 md:pb-4"
          )}
        >
          {children}
        </main>
      </div>

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
