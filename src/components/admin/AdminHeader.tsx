import { ReactNode, Suspense, lazy, useState } from 'react';
import { Search, Plus, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between h-10 md:h-14 px-2 md:px-4">
          <div className="flex items-center gap-2">
            <div className="w-12 md:hidden" aria-hidden="true" />
            <div>
              <h1 className="text-sm md:text-xl font-semibold text-foreground leading-tight">{title}</h1>
            </div>
            {isTestMode && (
              <Badge
                variant="outline"
                className="bg-accent/10 text-foreground border-accent/30"
              >
                Demo Mode
              </Badge>
            )}
          </div>

          <div
            className="flex-1 min-w-0 overflow-x-auto pl-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Header actions"
          >
            <div className="flex w-max min-w-full items-center justify-end gap-2 md:gap-4 whitespace-nowrap">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="w-60 pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
                />
              </div>

              {actions}

              <AdminNotificationBell />

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTestMode}
                title={isTestMode ? 'Disable Demo Mode' : 'Enable Demo Mode'}
                className={cn("min-w-[44px] min-h-[44px]", isTestMode ? 'text-accent' : '')}
              >
                {isTestMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </Button>

              <ThemeToggle />

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
