import { ReactNode } from 'react';
import { Bell, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AdminHeader({ title, subtitle, actions }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between h-full px-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="w-64 pl-9 bg-secondary/50 border-0 focus-visible:ring-1"
            />
          </div>

          {/* Actions */}
          {actions}

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          </Button>

          {/* Quick Add */}
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Booking
          </Button>
        </div>
      </div>
    </header>
  );
}
