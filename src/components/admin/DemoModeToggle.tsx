import { FlaskConical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { toast } from 'sonner';

interface DemoModeToggleProps {
  isOpen: boolean;
  isMobile?: boolean;
}

export function DemoModeToggle({ isOpen, isMobile = false }: DemoModeToggleProps) {
  const { settings, loading, toggleDemoMode } = useOrganizationSettings();
  const isDemoMode = settings?.demo_mode_enabled ?? false;

  const handleToggle = async () => {
    const success = await toggleDemoMode();
    if (success) {
      toast.success(isDemoMode ? 'Demo mode disabled' : 'Demo mode enabled');
    } else {
      toast.error('Failed to toggle demo mode');
    }
  };

  if (loading) {
    return (
      <div className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg",
        !isOpen && !isMobile && "justify-center px-2"
      )}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
        isDemoMode 
          ? "bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
        !isOpen && !isMobile && "justify-center px-2"
      )}
      title={!isOpen && !isMobile ? (isDemoMode ? 'Demo Mode Active' : 'Enable Demo Mode') : undefined}
    >
      <FlaskConical className={cn("w-5 h-5 flex-shrink-0", isDemoMode && "text-yellow-600")} />
      {(isOpen || isMobile) && (
        <span className="text-sm">
          {isDemoMode ? 'Demo Mode ON' : 'Demo Mode'}
        </span>
      )}
    </button>
  );
}
