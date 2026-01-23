import { ReactNode, Suspense, lazy, useState } from 'react';
import { Search, Plus, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/admin/ThemeToggle';
import { useTestMode } from '@/contexts/TestModeContext';
import { Badge } from '@/components/ui/badge';
import { AdminNotificationBell } from '@/components/admin/AdminNotificationBell';

// Performance: the booking dialog is a heavy multi-step flow; only load it when opened.
const AddBookingDialog = lazy(() =>
  import('@/components/admin/AddBookingDialog').then((m) => ({ default: m.AddBookingDialog }))
);

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AdminHeader({ title, actions }: AdminHeaderProps) {
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const { isTestMode, toggleTestMode } = useTestMode();

  return (
    <>
      {/*
        iOS (especially in native) can place content under the status bar/notch.
        If interactive elements sit under it, taps can fail.
        We respect the safe-area inset here and keep the visual height consistent.
      */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between h-14 md:h-16 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-foreground leading-tight">{title}</h1>
            </div>
            {isTestMode && (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700">
                Demo Mode
              </Badge>
            )}
          </div>

          {/*
            Mobile: header actions can overflow on smaller screens.
            Make this horizontally scrollable so users can swipe to reach actions like “New Booking”.
          */}
          <div className="flex-1 min-w-0 flex justify-end">
            <div className="flex items-center gap-2 md:gap-4 overflow-x-auto whitespace-nowrap max-w-full pl-2">
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

              {/* Notification Bell */}
              <AdminNotificationBell />

              {/* Test Mode Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTestMode}
                title={isTestMode ? 'Disable Demo Mode' : 'Enable Demo Mode'}
                className={isTestMode ? 'text-yellow-600' : ''}
              >
                {isTestMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Quick Add */}
              <Button size="sm" className="gap-2" onClick={() => setBookingDialogOpen(true)}>
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Booking</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <Suspense fallback={null}>
        {bookingDialogOpen ? (
          <AddBookingDialog
            open={bookingDialogOpen}
            onOpenChange={setBookingDialogOpen}
          />
        ) : null}
      </Suspense>
    </>
  );
}
