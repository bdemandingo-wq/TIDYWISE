import { ReactNode, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { OfflineIndicator } from './OfflineIndicator';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import { cn } from '@/lib/utils';
import { matchPath, useLocation } from 'react-router-dom';
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
  const isInsideConversation = Boolean(
    matchPath('/dashboard/messages/:conversationId', location.pathname)
  );
  const hideHeader = isMobileView && (
    location.pathname.includes('/messages') ||
    location.pathname.includes('/scheduler') ||
    location.pathname.includes('/calendar')
  ) || isInsideConversation;

  // The Tidy co-pilot bubble + panel are NOT mounted here. They live in
  // App.tsx so the CopilotProvider survives route changes — otherwise every
  // navigation would remount the provider and clear the conversation.
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className={cn(
        "transition-all duration-300 min-h-screen w-full max-w-full overflow-x-hidden",
        "pl-0 md:pl-16",
        sidebarOpen && "md:pl-64"
      )}>
        {!hideHeader && <AdminHeader title={title} subtitle={subtitle} actions={actions} />}

        <main
          className={cn(
            "animate-page-enter flex-1 w-full max-w-full overflow-x-hidden",
            "px-3 py-3 md:p-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-4"
          )}
        >
          {children}
        </main>
      </div>

      <OfflineIndicator />

      <MobileBottomNav />
    </div>
  );
}
