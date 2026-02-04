import { useClientPortalSessionTracker } from '@/hooks/useClientPortalSessionTracker';

export function ClientPortalSessionTrackerProvider({ children }: { children: React.ReactNode }) {
  useClientPortalSessionTracker();
  return <>{children}</>;
}
