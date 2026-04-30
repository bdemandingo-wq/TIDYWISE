/**
 * LOGIN PAGE - Email/Password only
 */

import { useState, useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthNoSession } from '@/hooks/useAuthNoSession';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { TermsOfServiceDialog } from '@/components/legal/TermsOfServiceDialog';
import { SplashScreen } from '@/components/SplashScreen';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ArrowLeft, Mail, Lock, Apple } from 'lucide-react';
import { z } from 'zod';
import { Capacitor } from '@capacitor/core';

// Validation schema
const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Please enter your password'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();
  const { user, loading: authLoading, initialCleanupDone, signIn, signInWithApple } = useAuthNoSession();
  
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Redirect if authenticated
  useEffect(() => {
    if (authLoading || !initialCleanupDone) return;
    if (user) {
      setShowSplash(true);
    }
  }, [user, authLoading, initialCleanupDone]);

  const validateForm = (): boolean => {
    try {
      loginSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        err.errors.forEach(e => {
          if (e.path[0] === 'email') fieldErrors.email = e.message;
          if (e.path[0] === 'password') fieldErrors.password = e.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const { error } = await signIn(formData.email, formData.password);

      if (error) {
        // Generic message — never leak whether the email exists
        // or whether confirmation is pending. Both cases collapse here.
        const msg = String(error.message || '');
        const benign = msg.includes('Invalid login credentials') || msg.includes('Email not confirmed');
        toast.error(benign ? 'Invalid email or password.' : 'Could not sign you in. Please try again.');
        setLoading(false);
        return;
      }

      toast.success('Welcome back!');
      setShowSplash(true);
    } catch (error: any) {
      toast.error('Could not sign you in. Please try again.');
      setLoading(false);
    }
  };

  // Handle splash screen completion - navigate to dashboard
  const handleSplashComplete = () => {
    navigate('/dashboard');
  };

  // Show splash screen after successful login
  if (showSplash) {
    return (
      <SplashScreen 
        onComplete={handleSplashComplete} 
        minDuration={1500}
      />
    );
  }

  // Show loading spinner only during initial auth check
  if (authLoading || !initialCleanupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" style={{ touchAction: 'manipulation' }}>
      <SEOHead title="Log In to TidyWise | Cleaning Business Software" description="Sign in to TidyWise to manage cleaning jobs, schedules, invoices, payroll, and your team from one dashboard." canonical="/login" />
      <div className="flex-1 flex items-center justify-center p-4 w-full">
      <div className="w-full max-w-md">
        {/* Back to home link - only on web */}
        {!isNative && (
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        )}
        
        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center pb-4">
            <h1 className="text-2xl font-bold leading-none tracking-tight">Sign in to your TidyWise account</h1>
            <CardDescription>
              Sign in to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  className={errors.email ? 'border-destructive' : ''}
                  required
                  autoComplete="email"
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      if (errors.password) setErrors({ ...errors, password: undefined });
                    }}
                    className={errors.password ? 'border-destructive' : ''}
                    required
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
                <div className="text-right">
                  <Link
                    to="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {/* Submit button */}
              <Button type="submit" className="w-full" disabled={loading} style={{ touchAction: 'manipulation' }}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  const { error } = await signInWithApple();
                  if (error) {
                    toast.error(error.message || 'Apple sign in failed');
                    setLoading(false);
                  }
                }}
              >
                <Apple className="mr-2 h-4 w-4" />
                Sign in with Apple
              </Button>

            </form>

            {/* Sign up link - HIDDEN on native (App Store Guideline 3.1.1) */}
            {!isNative && (
              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link
                  to="/signup"
                  className="text-primary hover:underline font-medium"
                >
                  Create account
                </Link>
              </div>
            )}

            {/* Staff & Client Portal links - HIDDEN on native */}
            {!isNative && (
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <Link
                  to="/staff/login"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  Staff Portal Login
                </Link>
                <Link
                  to="/portal/login"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  Client Portal Login
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legal links */}
        <div className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our{' '}
          <TermsOfServiceDialog>
            <button type="button" className="underline underline-offset-4 hover:text-foreground transition-colors">
              Terms
            </button>
          </TermsOfServiceDialog>
          {' '}and acknowledge our{' '}
          <Link
            to="/privacy-policy"
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </div>
      </div>

      <section aria-labelledby="login-info-heading" className="bg-muted/30 border-t border-border py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 id="login-info-heading" className="text-2xl font-bold text-foreground">
            Welcome back to your TidyWise dashboard
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Sign in above to pick up right where you left off — review today's jobs,
            dispatch your team, send invoices, and stay on top of every booking. The
            TidyWise dashboard gives cleaning business owners a complete real-time view
            of operations from any device.
          </p>

          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3">
              After you sign in, you'll be able to
            </h3>
            <ul className="space-y-2 text-muted-foreground list-disc pl-5">
              <li>View your live job board with cleaner locations, ETAs, and status updates</li>
              <li>Send branded quotes, invoices, and payment receipts in seconds</li>
              <li>Manage clients, contracts, and recurring jobs with a built-in CRM</li>
              <li>Track revenue, expenses, payroll, tips, and deposits at a glance</li>
              <li>Trigger automated SMS and email reminders to reduce no-shows</li>
              <li>Open the staff portal, client portal, and admin tools in one click</li>
            </ul>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            TidyWise was built specifically for the cleaning industry — residential maid
            services, commercial janitorial, post-construction cleanup, Airbnb turnover,
            and multi-location franchises all run their day-to-day on the platform. Unlike
            generic field-service tools, every workflow is tuned for the unique needs of
            cleaning operators: square-footage pricing, walkthrough notes, supply tracking,
            recurring contracts, before/after photos, and tip routing to the right cleaner.
          </p>

          <p className="text-muted-foreground leading-relaxed">
            Forgot your password? Use the reset option above to receive a secure email
            link. If you're a cleaner or office team member, sign in through the Staff
            Portal instead. Clients booking a recurring service should use the Client
            Portal. Need help? Our support team is one chat away inside the dashboard once
            you sign in.
          </p>

          <p className="text-muted-foreground leading-relaxed">
            New to TidyWise? Create a free account in under a minute — no credit card
            required and you can cancel anytime. Import your existing client list,
            configure services and pricing, set up online booking, and take your first
            job the same day you sign up.
          </p>
        </div>
      </section>
    </div>
  );
}