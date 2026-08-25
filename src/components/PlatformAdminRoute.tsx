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
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setAllowed(null);
      setRole(null);
      setCheckedUserId(null);
      return () => {
        cancelled = true;
      };
    }

    // `user` is guarded above, but the narrowing does not reach into this
    // nested async function — it could in principle run after a re-render. The
    // capture makes the guarantee explicit rather than asserted.
    const currentUser = user;

    async function check() {
      const { data, error } = await supabase
        .from("org_memberships")
        .select("organization_id, role")
        .eq("organization_id", PLATFORM_ORG_ID)
        .eq("user_id", currentUser.id)
        .in("role", ["owner", "admin"])
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        // Kept: without this a failed role check is indistinguishable from a
        // legitimate denial — the user is bounced to /dashboard either way.
        // Carries error.message only, no identity (CLAUDE.md rule 5).
        console.warn("[PlatformAdminRoute] role check failed:", error.message);
        setAllowed(false);
        setRole(null);
        setCheckedUserId(currentUser.id);
        return;
      }

      const nextRole = data?.role ?? null;
      const granted = Boolean(data);

      setAllowed(granted);
      setRole(nextRole);
      setCheckedUserId(currentUser.id);
    }

    void check();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reacts only to auth loading state and user identity, not the full user object
  }, [authLoading, user?.id, user?.email]);

  const accessResolvedForCurrentUser = !user || checkedUserId === user.id;
  const checking = authLoading || (!!user && (!accessResolvedForCurrentUser || allowed === null));

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowed) {
    // Matches AdminRoute.tsx:189 — a denied platform-admin attempt is worth a
    // line, but userId + role only. Never the email, and only on denial.
    console.warn(
      "[SECURITY] Non-platform-admin attempted to access platform route",
      { userId: user?.id, role }
    );
    return <Navigate to="/dashboard" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
