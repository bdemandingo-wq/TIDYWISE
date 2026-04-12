/**
 * SIGNUP PAGE - Email/Password only
 */

import { useState, useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthNoSession, supabaseNoSession } from '@/hooks/useAuthNoSession';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const { 
    user, 
    loading: authLoading, 
    initialCleanupDone, 
    signUp, 
    signOut 
  } = useAuthNoSession();

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Redirect if already authenticated
  useEffect(() => {
    if (authLoading || !initialCleanupDone) return;
    if (user) {
      setShowSplash(true);
    }
  }, [user, authLoading, initialCleanupDone]);

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

    if (!tosAccepted) {
      toast.error('You must agree to the Terms of Service and refund policy to continue.');
      return;
    }
    
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

        // Log TOS acceptance
        try {
          const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
          const ipData = ipRes ? await ipRes.json().catch(() => ({})) : {};
          await supabaseNoSession.from('tos_acceptances').insert({
            user_id: data.user.id,
            email: formData.email,
            ip_address: ipData?.ip || null,
            tos_version: '2025-02-01',
          });
        } catch (tosErr) {
          console.error('TOS acceptance logging failed (non-critical):', tosErr);
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

        // Fire-and-forget welcome email via Make webhook
        fetch("https://hook.us2.make.com/zsyiy664w5qhstih2w2e4dqvcpljrzml", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.email,
            full_name: formData.fullName,
            phone: formData.phone || "",
            signup_method: "email",
            signed_up_at: new Date().toISOString(),
          }),
        }).catch(() => {});
        setLoading(false);
        setShowSplash(true);
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred. Please try again.');
      setLoading(false);
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

  // Show loading spinner during initial auth check
  if (authLoading || !initialCleanupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEOHead title="Start Free Trial | TidyWise – Cleaning Business Software" description="Sign up for TidyWise free trial. Get online booking, scheduling, CRM, and automated invoicing for your cleaning business. No credit card required." canonical="/signup" />
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

              {/* TOS & Refund Policy Checkbox */}
              <div className="flex items-start gap-3 pt-2">
                <Checkbox
                  id="tos"
                  checked={tosAccepted}
                  onCheckedChange={(checked) => setTosAccepted(checked === true)}
                  className="mt-0.5"
                />
                <label htmlFor="tos" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  I agree to the TidyWise{' '}
                  <TermsOfServiceDialog>
                    <button type="button" className="underline underline-offset-2 hover:text-foreground transition-colors">
                      Terms of Service
                    </button>
                  </TermsOfServiceDialog>
                  . All payments are non-refundable. Subscriptions can be cancelled anytime but no refunds are issued for time already paid.
                </label>
              </div>

              {/* Submit button */}
              <Button type="submit" className="w-full" disabled={loading || !tosAccepted}>
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