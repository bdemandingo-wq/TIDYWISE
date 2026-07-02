import { ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useClientPortal } from "@/contexts/ClientPortalContext";
import { ClientPortalSessionTrackerProvider } from "@/components/ClientPortalSessionTrackerProvider";

interface ProtectedPortalRouteProps {
  children: ReactNode;
}

export function ProtectedPortalRoute({ children }: ProtectedPortalRouteProps) {
  const { user, loading, sessionToken, signOut } = useClientPortal();

  // Pre-deploy sessions saved before the signed-token change lack sessionToken.
  // Force those users to sign in again so portal edge functions won't 401.
  useEffect(() => {
    if (!loading && user && !sessionToken) {
      toast.error('Your session expired. Please sign in again.');
      signOut();
    }
  }, [loading, user, sessionToken, signOut]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !sessionToken) {
    return <Navigate to="/portal/login?reason=session_expired" replace />;
  }

  return (
    <ClientPortalSessionTrackerProvider>
      {children}
    </ClientPortalSessionTrackerProvider>
  );
}

