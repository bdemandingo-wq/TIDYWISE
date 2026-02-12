import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Capacitor } from "@capacitor/core";

import { useAuth } from "@/hooks/useAuth";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, HardHat, Loader2, Fingerprint } from "lucide-react";

import { Seo } from "@/components/Seo";
import { hasStaffOrAdminRole, requestStaffPasswordReset, signInStaff } from "@/features/staff-auth/staffAuth";
import { TermsOfServiceDialog } from "@/components/legal/TermsOfServiceDialog";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

const resetSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

type ResetValues = z.infer<typeof resetSchema>;

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { 
    isAvailable: biometricAvailable, 
    hasStoredCredentials, 
    getBiometryTypeName,
    storeCredentials,
    authenticateAndGetCredentials 
  } = useBiometricAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  });

  const isSubmitting = loginForm.formState.isSubmitting;
  const isSendingReset = resetForm.formState.isSubmitting;

  const redirectUrl = useMemo(
    () => `${window.location.origin}/staff/reset-password`,
    []
  );

  // If already logged in, send staff/admin directly to portal.
  useEffect(() => {
    const run = async () => {
      if (!user) return;
      try {
        const allowed = await hasStaffOrAdminRole(user.id);
        if (allowed) navigate("/staff", { replace: true });
      } catch {
        // ignore
      }
    };

    if (!authLoading && user) run();
  }, [authLoading, user, navigate]);

  const onSubmitLogin = async (values: LoginValues) => {
    try {
      await signInStaff(values.email, values.password);
      
      // Offer to save credentials for biometric login on native platforms
      if (biometricAvailable && !hasStoredCredentials && Capacitor.isNativePlatform()) {
        const saved = await storeCredentials(values.email, values.password);
        if (saved) {
          toast.success(`${getBiometryTypeName()} enabled for quick login!`);
        }
      }
      
      toast.success("Welcome back!");
      navigate("/staff", { replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Login failed");
    }
  };

  const handleBiometricLogin = async () => {
    if (!biometricAvailable || !hasStoredCredentials) return;
    
    setBiometricLoading(true);
    try {
      const credentials = await authenticateAndGetCredentials();
      if (credentials) {
        await signInStaff(credentials.email, credentials.password);
        toast.success("Welcome back!");
        navigate("/staff", { replace: true });
      }
    } catch (err: any) {
      toast.error("Biometric login failed. Please use your password.");
    } finally {
      setBiometricLoading(false);
    }
  };

  const onSubmitReset = async (values: ResetValues) => {
    try {
      await requestStaffPasswordReset(values.email, redirectUrl);
      toast.success("If your email is invited as staff/admin, you'll receive a reset link shortly.");
      setResetOpen(false);
      resetForm.reset();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send reset email");
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Seo title="Staff Login | TidyWise" description="Staff portal login" canonicalPath="/staff/login" />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4 flex items-center justify-center">
      <Seo
        title="Staff Login | TidyWise"
        description="Sign in to the staff portal to manage jobs, availability, and earnings."
        canonicalPath="/staff/login"
      />

      <section className="w-full max-w-md">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card className="shadow-xl border-primary/10">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <HardHat className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">Staff Portal</CardTitle>
              <CardDescription className="mt-2">
                Sign in to access your jobs and schedule
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={loginForm.handleSubmit(onSubmitLogin)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="your.email@example.com"
                  {...loginForm.register("email")}
                />
                {loginForm.formState.errors.email?.message && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto text-xs text-muted-foreground hover:text-primary"
                    onClick={() => setResetOpen(true)}
                  >
                    Forgot password?
                  </Button>
                </div>

                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...loginForm.register("password")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {loginForm.formState.errors.password?.message && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In to Portal
              </Button>

              {/* Biometric Login Button - only show on native with stored credentials */}
              {biometricAvailable && hasStoredCredentials && Capacitor.isNativePlatform() && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleBiometricLogin}
                  disabled={biometricLoading}
                >
                  {biometricLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Fingerprint className="h-4 w-4" />
                  )}
                  Sign in with {getBiometryTypeName()}
                </Button>
              )}
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Need access? Contact your administrator to get invited.
            </p>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              By continuing you agree to our{" "}
              <TermsOfServiceDialog>
                <button className="underline underline-offset-4 hover:text-foreground transition-colors">Terms</button>
              </TermsOfServiceDialog>
              {" "}and acknowledge our{" "}
              <Link
                to="/privacy-policy"
                className="underline underline-offset-4 hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </section>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter the email your administrator invited you with.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={resetForm.handleSubmit(onSubmitReset)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="resetEmail">Email</Label>
              <Input
                id="resetEmail"
                type="email"
                autoComplete="email"
                placeholder="your.email@example.com"
                {...resetForm.register("email")}
              />
              {resetForm.formState.errors.email?.message && (
                <p className="text-sm text-destructive">{resetForm.formState.errors.email.message}</p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSendingReset}>
                {isSendingReset && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
