import { useLocation } from 'react-router-dom';
import { CopilotBubble } from './CopilotBubble';
import { CopilotPanel } from './CopilotPanel';
import { useCopilotEnabled } from '@/hooks/useCopilotEnabled';

// Conditional bubble + panel renderer. Lives as a sibling of <Routes>
// inside the CopilotProvider so the provider's state survives every
// route change, but the visible UI only mounts on admin routes (where
// the bubble is wanted) AND only when the org-level toggle is on.
export function CopilotMount() {
  const { pathname } = useLocation();
  const enabled = useCopilotEnabled();
  const isAdminSurface = pathname.startsWith('/dashboard');
  if (!isAdminSurface) return null;
  // While loading (`null`) we hide the bubble — flips on within ~100ms once
  // the flag resolves. Toggle off → render nothing.
  if (enabled !== true) return null;
  return (
    <>
      <CopilotBubble />
      <CopilotPanel />
    </>
  );
}
