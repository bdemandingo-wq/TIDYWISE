/**
 * LOGIN PAGE - Email/Password ONLY
 * 
 * NO Google OAuth on this page - Google is for signup only
 * No persistent sessions - users must re-authenticate every visit
 */

import { useState, useEffect } from 'react';
import { Seo } from '@/components/Seo';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthNoSession } from '@/hooks/useAuthNoSession';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TermsOfServiceDialog } from '@/components/legal/TermsOfServiceDialog';
import { SplashScreen } from '@/components/SplashScreen';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ArrowLeft, Mail, Lock } from 'lucide-react';
import { z } from 'zod';
import { usePlatform } from '@/hooks/usePlatform';


// Native-aware signup link component for App Store compliance
function NativeAwareSignupLink() {
  // On all platforms (including native): use in-app signup link
  // Per App Store Guideline 4.0: users must be able to sign up in-app
  return (
    <div className="mt-6 text-center text-sm">
      <span className="text-muted-foreground">Don't have an account? </span>
      <Link
        to="/signup"
        className="text-primary hover:underline font-medium"
      >
        Create account
      </Link>
    </div>
  );
}

// Validation schema
const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, initialCleanupDone, signIn } = useAuthNoSession();
  
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
      // Show splash screen when already authenticated, then navigate
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
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      const { error } = await signIn(formData.email, formData.password);
      
      if (error) {
        // Friendly error messages
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Invalid email or password. Please try again.');
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('Please verify your email before logging in.');
        } else {
          toast.error(error.message);
        }
        setLoading(false);
        return;
      }
      
      toast.success('Welcome back!');
      // Show splash screen after successful login
      setShowSplash(true);
    } catch (error: any) {
      toast.error(error.message || 'An error occurred. Please try again.');
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Seo title="Log In | TidyWise - Cleaning Business Software" description="Log in to your TidyWise account to manage bookings, staff, and grow your cleaning business." canonicalPath="/login" noIndex />
      <div className="w-full max-w-md">
        {/* Back to home link */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
        
        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
            <CardDescription>
              Sign in with your email and password
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
                    minLength={6}
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
              </div>

              {/* Submit button */}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>

            </form>

            {/* Sign up link - on native, direct to website */}
            <NativeAwareSignupLink />
          </CardContent>
        </Card>

        {/* Legal links */}
        <div className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our{' '}
          <TermsOfServiceDialog>
            <button className="underline underline-offset-4 hover:text-foreground transition-colors">
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
  );
}