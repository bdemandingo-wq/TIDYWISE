import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WifiOff, Wifi, RefreshCw, CloudOff, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingCount, syncPendingChanges } = useOfflineSync();

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
      {pendingCount > 0 && isOnline && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={syncPendingChanges}
              disabled={isSyncing}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
              Sync {pendingCount}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{pendingCount} pending change{pendingCount > 1 ? 's' : ''} to sync</p>
          </TooltipContent>
        </Tooltip>
      )}
      
      <Badge
        variant={isOnline ? "secondary" : "destructive"}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5",
          !isOnline && "animate-pulse"
        )}
      >
        {isOnline ? (
          <>
            <Cloud className="h-3.5 w-3.5" />
            <span>Online</span>
          </>
        ) : (
          <>
            <CloudOff className="h-3.5 w-3.5" />
            <span>Offline</span>
            {pendingCount > 0 && (
              <span className="ml-1 text-xs opacity-75">({pendingCount} pending)</span>
            )}
          </>
        )}
      </Badge>
    </div>
  );
}
