import { ReactNode, useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AdminLayout({ children, title, subtitle, actions }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className={cn(
        "transition-all duration-300",
        "pl-0 md:pl-16",
        sidebarOpen && "md:pl-64"
      )}>
        <AdminHeader title={title} subtitle={subtitle} actions={actions} />
        <main className="p-4 md:p-6 pt-20 md:pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
