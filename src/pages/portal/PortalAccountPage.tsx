import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { safeAction } from "@/lib/safeAction";

export default function PortalAccountPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("customers")
        .select("first_name, last_name, email, phone")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setProfile(data ?? null);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    const res = await safeAction(() => supabase.auth.signOut(), {
      source: "PortalSignOut",
      successMessage: "Signed out",
      errorMessagePrefix: "Sign out failed",
    });
    if (res.success) navigate("/portal/auth", { replace: true });
  };

  return (
    <PortalLayout title="Account">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!profile ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-muted-foreground">Name</div>
                <div className="font-medium">{profile.first_name} {profile.last_name}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Email</div>
                <div className="font-medium">{profile.email}</div>
              </div>
              {profile.phone ? (
                <div>
                  <div className="text-muted-foreground">Phone</div>
                  <div className="font-medium">{profile.phone}</div>
                </div>
              ) : null}
            </div>
          )}

          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </PortalLayout>
  );
}
