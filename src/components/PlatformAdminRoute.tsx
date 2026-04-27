import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
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
  const location = useLocation();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [checkedOrgId, setCheckedOrgId] = useState<string | null>(null);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      console.log("[PlatformAdminRoute] auth loading", {
        email: user?.email ?? null,
        orgId: PLATFORM_ORG_ID,
      });
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      console.log("[PlatformAdminRoute] no authenticated user", {
        email: null,
        role: null,
        orgId: PLATFORM_ORG_ID,
        granted: false,
      });
      setAllowed(null);
      setRole(null);
      setCheckedOrgId(null);
      setCheckedUserId(null);
      return () => {
        cancelled = true;
      };
    }

    async function check() {
      console.log("[PlatformAdminRoute] checking platform admin access", {
        email: user.email ?? null,
        role: null,
        orgId: PLATFORM_ORG_ID,
        granted: null,
      });

      const { data, error } = await supabase
        .from("org_memberships")
        .select("organization_id, role")
        .eq("organization_id", PLATFORM_ORG_ID)
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn("[PlatformAdminRoute] role check failed:", error.message);
        console.log("[PlatformAdminRoute] access denied", {
          email: user.email ?? null,
          role: null,
          orgId: PLATFORM_ORG_ID,
          granted: false,
        });
        setAllowed(false);
        setRole(null);
        setCheckedOrgId(PLATFORM_ORG_ID);
        setCheckedUserId(user.id);
        return;
      }

      const nextRole = data?.role ?? null;
      const nextOrgId = data?.organization_id ?? PLATFORM_ORG_ID;
      const granted = Boolean(data);

      console.log(`[PlatformAdminRoute] access ${granted ? "granted" : "denied"}`, {
        email: user.email ?? null,
        role: nextRole,
        orgId: nextOrgId,
        granted,
      });

      setAllowed(granted);
      setRole(nextRole);
      setCheckedOrgId(nextOrgId);
      setCheckedUserId(user.id);
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.email]);

  const accessResolvedForCurrentUser = !user || checkedUserId === user.id;
  const checking = authLoading || (!!user && (!accessResolvedForCurrentUser || allowed === null));

  console.log("[PlatformAdminRoute] render", {
    email: user?.email ?? null,
    role,
    orgId: checkedOrgId ?? PLATFORM_ORG_ID,
    granted: allowed,
    authLoading,
    checking,
    accessResolvedForCurrentUser,
  });

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    console.log("[PlatformAdminRoute] redirecting to login", {
      email: null,
      role: null,
      orgId: PLATFORM_ORG_ID,
      granted: false,
    });
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowed) {
    console.log("[PlatformAdminRoute] redirecting to dashboard", {
      email: user.email ?? null,
      role,
      orgId: checkedOrgId ?? PLATFORM_ORG_ID,
      granted: false,
    });
    return <Navigate to="/dashboard" state={{ from: location }} replace />;
  }

  console.log("[PlatformAdminRoute] rendering protected content", {
    email: user.email ?? null,
    role,
    orgId: checkedOrgId ?? PLATFORM_ORG_ID,
    granted: true,
  });

  return <>{children}</>;
}
