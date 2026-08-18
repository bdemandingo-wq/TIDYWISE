import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PlatformAdminRoute } from "@/components/PlatformAdminRoute";
import { isPlatformOwner } from "@/lib/platformOwner";

/**
 * PlatformAdminRoute plus the single-account gate that Platform Analytics
 * applies to itself. Strictly narrower than either alone.
 *
 * Used by the broadcast detail page. The composer sits inside Platform
 * Analytics, which only support@ can open — but the detail page is a route,
 * and it can retry failed sends. Retrying is sending. Leaving it on
 * PlatformAdminRoute meant any owner/admin of the platform org could open a
 * send by id and re-fire it to the failed recipients, a wider door than the
 * one the composer is behind.
 *
 * PlatformAdminRoute is kept underneath rather than replaced: it is the only
 * one of the two backed by a database membership check, so dropping it to
 * "just compare an email" would trade a real check for a string compare.
 */
export function PlatformOwnerRoute({ children }: { children: ReactNode }) {
  return (
    <PlatformAdminRoute>
      <PlatformOwnerGate>{children}</PlatformOwnerGate>
    </PlatformAdminRoute>
  );
}

/**
 * Split out so it mounts only after PlatformAdminRoute has already granted —
 * which means a denial logged here is specifically "platform-org admin, but
 * not the owner account", not an ordinary tenant wandering in.
 */
function PlatformOwnerGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!isPlatformOwner(user)) {
    // userId only. Matches PlatformAdminRoute and AdminRoute: a denial is
    // worth a line, but never the email (CLAUDE.md rule 5) — and here the
    // email IS the credential being checked, so logging it would write the
    // gate's own secret into the console.
    console.warn(
      "[SECURITY] Platform admin attempted to access an owner-only platform route",
      { userId: user?.id }
    );
    return <Navigate to="/dashboard" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
