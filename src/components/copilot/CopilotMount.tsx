import { useLocation } from 'react-router-dom';
import { CopilotBubble } from './CopilotBubble';
import { CopilotPanel } from './CopilotPanel';

// Conditional bubble + panel renderer. Lives as a sibling of <Routes>
// inside the CopilotProvider so the provider's state survives every
// route change, but the visible UI only mounts on admin routes (where
// the bubble is wanted).
//
// The provider was previously mounted inside AdminLayout, which gets
// re-instantiated per route — so the conversation cleared on every nav.
// Hoisting the provider above Routes fixes that; this component just
// gates whether the UI is visible.
export function CopilotMount() {
  const { pathname } = useLocation();
  const isAdminSurface = pathname.startsWith('/dashboard');
  if (!isAdminSurface) return null;
  return (
    <>
      <CopilotBubble />
      <CopilotPanel />
    </>
  );
}
