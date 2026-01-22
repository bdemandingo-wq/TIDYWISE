import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PortalInvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";

  useEffect(() => {
    if (token) sessionStorage.setItem("portal_invite_token", token);
    if (email) sessionStorage.setItem("portal_invite_email", email);
  }, [token, email]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Customer Portal Invite</CardTitle>
            <CardDescription>
              {email ? (
                <>Continue as <span className="font-medium text-foreground">{email}</span>.</>
              ) : (
                <>Continue to sign in or create your portal account.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!token ? (
              <p className="text-sm text-destructive">
                This invite link is missing a token. Please request a new invite from the business.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                You’ll be asked to sign in (or create an account) to access your booking history, invoices, and loyalty.
              </p>
            )}

            <Button asChild className="w-full" disabled={!token}>
              <Link to="/portal/auth">Continue</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
