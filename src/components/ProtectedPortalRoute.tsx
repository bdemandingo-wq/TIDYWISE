import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useClientPortal } from "@/contexts/ClientPortalContext";
import { ClientPortalSessionTrackerProvider } from "@/components/ClientPortalSessionTrackerProvider";

interface ProtectedPortalRouteProps {
  children: ReactNode;
}

export function ProtectedPortalRoute({ children }: ProtectedPortalRouteProps) {
  const { user, loading } = useClientPortal();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <ClientPortalSessionTrackerProvider>
      {children}
    </ClientPortalSessionTrackerProvider>
  );
}
