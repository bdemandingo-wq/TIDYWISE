import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

const PLATFORM_ORG_ID = "e95b92d0-7099-408e-a773-e4407b34f8b4";

interface PlatformAdminRouteProps {
  children: ReactNode;
}

/**
 * Restricts a route to platform admins only — owner/admin members of the
 * TidyWise platform organization. Used for marketing-side tooling like the
 * blog editor at /admin/blog. Distinct from AdminRoute (per-tenant admin).
 */
export function PlatformAdminRoute({ children }: PlatformAdminRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user) {
        if (!cancelled) {
          setAllowed(false);
          setChecking(false);
        }
        return;
      }
      const { data, error } = await supabase
        .from("org_memberships")
        .select("role")
        .eq("organization_id", PLATFORM_ORG_ID)
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      if (!cancelled) {
        if (error) {
          console.warn("[PlatformAdminRoute] role check failed:", error.message);
        }
        setAllowed(!!data);
        setChecking(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
