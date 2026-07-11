import { ReactNode, useEffect, useState } from 'react';
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
  const isMobileView = useIsMobile();

  // Edge-swipe to open the sidebar on touch devices. React synthetic touch
  // handlers on the wrapper miss touches that land on fixed-positioned
  // children (header, bottom nav, sheet overlays), so we attach native
  // document-level listeners. On mobile we dispatch a global event so the
  // AdminSidebar Sheet (which owns its own open state) actually opens.
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let fromEdge = false;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      fromEdge = t.clientX <= 28;
      tracking = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > 60) return;
      if (isMobileView) {
        if (fromEdge && dx > 50) {
          window.dispatchEvent(new CustomEvent('tw:open-mobile-sidebar'));
        } else if (dx < -60 && startX <= 288) {
          window.dispatchEvent(new CustomEvent('tw:close-mobile-sidebar'));
        }
        return;
      }
      // Desktop swipe (rare, but preserved)
      if (fromEdge && dx > 60 && !sidebarOpen) setSidebarOpen(true);
      else if (dx < -60 && sidebarOpen && startX <= 288) setSidebarOpen(false);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [isMobileView, sidebarOpen]);
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
