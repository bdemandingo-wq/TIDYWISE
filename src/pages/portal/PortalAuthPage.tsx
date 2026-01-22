import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { validateEmail, validatePassword } from "@/lib/validation";
import { safeEdgeFunctionCall } from "@/lib/safeAction";

export default function PortalAuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const inviteToken = useMemo(() => sessionStorage.getItem("portal_invite_token") ?? "", []);
  const inviteEmail = useMemo(() => sessionStorage.getItem("portal_invite_email") ?? "", []);
  const from = (location.state as any)?.from || "/portal";

  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    // If user is already signed in, try to redeem (if needed) and go to portal
    let cancelled = false;
    async function run() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) navigate(from, { replace: true });
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, from]);

  async function redeemInviteIfPresent() {
    if (!inviteToken) return { success: true as const };
    const res = await safeEdgeFunctionCall<{ success: boolean }>(
      "redeem-customer-portal-invite",
      { inviteToken },
      { successMessage: "Invite accepted!", showSuccessToast: false }
    );
    if (!res.success) return res;
    return res;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailErr = validateEmail(email);
    if (emailErr) return;
    const passErr = validatePassword(password);
    if (passErr) return;

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/portal`,
          },
        });
        if (error) throw error;
      }

      const redeem = await redeemInviteIfPresent();
      if (!redeem.success) return;

      // Clear token after successful redeem to prevent reuse in browser
      sessionStorage.removeItem("portal_invite_token");
      sessionStorage.removeItem("portal_invite_email");

      navigate(from, { replace: true });
    } catch (err: any) {
      // safeAction already toasts on redeem; auth errors are thrown here
      // Keep minimal: rely on supabase error message
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>{isLogin ? "Sign in" : "Create portal account"}</CardTitle>
            <CardDescription>
              {inviteToken
                ? "Use the invited email to access your portal."
                : "You need an invite link from the business to access the portal."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLogin ? "Sign in" : "Create account"}
              </Button>

              <Button
                type="button"
                variant="link"
                className="w-full"
                onClick={() => setIsLogin((v) => !v)}
              >
                {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
