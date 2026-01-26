/**
 * SIGNUP PAGE - Email/Password + Google OAuth (SIGNUP ONLY)
 * 
 * Google OAuth is ONLY for creating NEW accounts
 * If a user already exists (has a profile), Google OAuth is blocked
 * No persistent sessions - users must re-authenticate every visit
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuthNoSession, supabaseNoSession } from '@/hooks/useAuthNoSession';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TermsOfServiceDialog } from '@/components/legal/TermsOfServiceDialog';
import { SplashScreen } from '@/components/SplashScreen';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ArrowLeft, Mail, Lock, User, Phone } from 'lucide-react';
import { z } from 'zod';

// Validation schema
const signupSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  phone: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    user, 
    loading: authLoading, 
    initialCleanupDone, 
    signUp, 
    signInWithGoogle,
    checkExistingProfile,
    signOut 
  } = useAuthNoSession();
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Handle OAuth callback - check if user already exists
  const handleOAuthCallback = useCallback(async () => {
    if (!user || !initialCleanupDone) return;
    
    const isOAuthCallback = searchParams.get('oauth') === 'google';
    
    if (isOAuthCallback) {
      setGoogleLoading(true);
      
      try {
        // Check if profile already exists
        const profileExists = await checkExistingProfile(user.id);
        
        if (profileExists) {
          // User already exists - block Google sign-in
          await signOut();
          toast.error(
            'An account with this email already exists. Please log in with email and password.',
            { duration: 6000 }
          );
          navigate('/login');
          return;
        }
        
        // New user via Google - create profile
        const { error: profileError } = await supabaseNoSession
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
          });
        
        if (profileError && !profileError.message.includes('duplicate key')) {
          console.error('Error creating profile:', profileError);
        }
        
        toast.success('Account created successfully!');
        setGoogleLoading(false);
        setShowSplash(true);
      } catch (err) {
        console.error('OAuth callback error:', err);
        toast.error('An error occurred. Please try again.');
        setGoogleLoading(false);
      }
    } else if (user) {
      // Already logged in - show splash and redirect
      setShowSplash(true);
    }
  }, [user, initialCleanupDone, searchParams, checkExistingProfile, signOut, navigate]);

  useEffect(() => {
    handleOAuthCallback();
  }, [handleOAuthCallback]);

  const validateForm = (): boolean => {
    try {
      signupSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach(e => {
          const field = e.path[0] as string;
          fieldErrors[field] = e.message;
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
      const { data, error } = await signUp(
        formData.email,
        formData.password,
        { full_name: formData.fullName, phone: formData.phone }
      );
      
      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('An account with this email already exists. Please log in instead.');
        } else {
          toast.error(error.message);
        }
        setLoading(false);
        return;
      }
      
      if (data?.user) {
        // Create profile
        const { error: profileError } = await supabaseNoSession
          .from('profiles')
          .insert({
            id: data.user.id,
            email: formData.email,
            full_name: formData.fullName,
            phone: formData.phone || null,
          });
        
        if (profileError && !profileError.message.includes('duplicate key')) {
          console.error('Error creating profile:', profileError);
        }
        
        // Send welcome SMS if phone provided
        if (formData.phone) {
          supabaseNoSession.functions.invoke('send-signup-welcome-sms', {
            body: {
              to: formData.phone,
              fullName: formData.fullName,
            },
          }).catch(err => console.log('Welcome SMS failed (non-critical):', err));
        }
        
        // Notify platform admin of new signup
        supabaseNoSession.functions.invoke('notify-platform-admin-signup', {
          body: {
            email: formData.email,
            fullName: formData.fullName,
            phone: formData.phone || undefined,
            signupMethod: 'email',
          },
        }).catch(err => console.log('Admin notification failed (non-critical):', err));
        
        toast.success('Account created! Welcome aboard.');
        setLoading(false);
        setShowSplash(true);
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error.message || 'Failed to start Google signup');
        setGoogleLoading(false);
      }
      // If successful, user will be redirected to OAuth provider
    } catch (error: any) {
      toast.error(error.message || 'Failed to start Google signup');
      setGoogleLoading(false);
    }
  };

  // Handle splash screen completion - navigate to dashboard
  const handleSplashComplete = () => {
    navigate('/dashboard');
  };

  // Show splash screen after successful signup
  if (showSplash) {
    return (
      <SplashScreen 
        onComplete={handleSplashComplete} 
        minDuration={1500}
      />
    );
  }

  // Show loading spinner during initial auth check or Google OAuth
  if (authLoading || !initialCleanupDone || googleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
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
            <CardTitle className="text-2xl font-bold">Create Your Account</CardTitle>
            <CardDescription>
              Start your free trial today
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Google Sign Up Button - SIGNUP ONLY */}
            <Button 
              type="button"
              variant="outline" 
              className="w-full gap-2 mb-4"
              onClick={handleGoogleSignup}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              Continue with Google (Sign up)
            </Button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or sign up with email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => {
                    setFormData({ ...formData, fullName: e.target.value });
                    if (errors.fullName) setErrors({ ...errors, fullName: '' });
                  }}
                  className={errors.fullName ? 'border-destructive' : ''}
                  required
                  autoComplete="name"
                />
                {errors.fullName && (
                  <p className="text-xs text-destructive">{errors.fullName}</p>
                )}
              </div>

              {/* Phone (optional) */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone Number
                  <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  autoComplete="tel"
                />
                <p className="text-xs text-muted-foreground">We'll send you a welcome text!</p>
              </div>

              {/* Email */}
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
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                  className={errors.email ? 'border-destructive' : ''}
                  required
                  autoComplete="email"
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              {/* Password */}
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
                      if (errors.password) setErrors({ ...errors, password: '' });
                    }}
                    className={errors.password ? 'border-destructive' : ''}
                    required
                    minLength={6}
                    autoComplete="new-password"
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

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Confirm Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => {
                      setFormData({ ...formData, confirmPassword: e.target.value });
                      if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                    }}
                    className={errors.confirmPassword ? 'border-destructive' : ''}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                )}
              </div>

              {/* Submit button */}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
              </Button>
            </form>

            {/* Login link */}
            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link
                to="/login"
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </Link>
            </div>
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