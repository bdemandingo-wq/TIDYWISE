import { ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { OfflineIndicator } from './OfflineIndicator';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import { useLocation, useNavigate } from 'react-router-dom';
import { hapticImpact } from '@/lib/haptics';

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
  const location = useLocation();
  const navigate = useNavigate();

  const crmTabOrder = useMemo(
    () => ['/dashboard', '/dashboard/customers', '/dashboard/leads', '/dashboard/messages', '/dashboard/settings'],
    []
  );

  // Swipe between primary CRM tabs (mobile only)
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeHandled = useRef(false);

  useEffect(() => {
    swipeHandled.current = false;
    swipeStart.current = null;
  }, [location.pathname]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
    swipeHandled.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    if (!swipeStart.current || swipeHandled.current) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeStart.current.x;
    const dy = t.clientY - swipeStart.current.y;

    // Require a clear horizontal swipe
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    swipeHandled.current = true;

    const currentIndex = crmTabOrder.findIndex((p) => location.pathname === p);
    if (currentIndex === -1) return;

    const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    const next = crmTabOrder[Math.max(0, Math.min(crmTabOrder.length - 1, nextIndex))];
    if (next && next !== location.pathname) {
      hapticImpact('light');
      navigate(next);
    }
  };

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
        <main
          className="p-4 md:p-6 pt-4 md:pt-6 pb-24 md:pb-6 animate-page-enter overflow-y-auto"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
        >
          {children}
        </main>
      </div>

      <MobileBottomNav />
      
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

