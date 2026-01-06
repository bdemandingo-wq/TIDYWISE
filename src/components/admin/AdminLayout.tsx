import { ReactNode, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { SubscriptionDialog } from './SubscriptionDialog';
import { OfflineIndicator } from './OfflineIndicator';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

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
    <div className="min-h-screen bg-background">
      <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className={cn(
        "transition-all duration-300",
        "pl-0 md:pl-16",
        sidebarOpen && "md:pl-64"
      )}>
        <AdminHeader title={title} subtitle={subtitle} actions={actions} />
        <main className="p-4 md:p-6 pt-20 md:pt-6 animate-page-enter">
          {children}
        </main>
      </div>
      
      <SubscriptionDialog 
        open={showSubscriptionDialog}
        onOpenChange={setShowSubscriptionDialog}
        onSubscriptionActive={checkSubscription}
      />
      
      <OfflineIndicator />
    </div>
  );
}
