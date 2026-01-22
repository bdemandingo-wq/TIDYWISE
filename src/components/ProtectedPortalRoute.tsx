import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedPortalRouteProps {
  children: ReactNode;
}

/**
 * Ensures the user is authenticated AND linked to a customer record (customers.user_id = auth.uid()).
 * If not linked, forces the invite-based portal auth flow.
 */
export function ProtectedPortalRoute({ children }: ProtectedPortalRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [hasCustomerLink, setHasCustomerLink] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!user) {
        setChecking(false);
        setHasCustomerLink(false);
        return;
      }

      setChecking(true);
      const { data, error } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setHasCustomerLink(!error && !!data);
      setChecking(false);
    }

    if (!authLoading) run();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/portal/auth" state={{ from: location.pathname }} replace />;
  }

  if (!hasCustomerLink) {
    return <Navigate to="/portal/auth" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
