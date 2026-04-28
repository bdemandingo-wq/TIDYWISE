import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, Mail } from 'lucide-react';
import { z } from 'zod';

const CODE_LENGTH = 8;

const passwordSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(new RegExp(`^\\d{${CODE_LENGTH}}$`), `Code must be ${CODE_LENGTH} digits`),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Za-z]/, 'Password must include a letter')
      .regex(/[0-9]/, 'Password must include a number'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });

const RESEND_COOLDOWN_SECONDS = 30;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Email comes from /forgot-password navigation state, or ?email= query param
  // as a fallback (e.g. user pasted/refreshed). If neither is present, we send
  // them back to /forgot-password.
  const emailFromState = (location.state as { email?: string } | null)?.email;
  const emailFromQuery = searchParams.get('email') ?? undefined;
  const email = (emailFromState || emailFromQuery || '').trim();

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; password?: string; confirm?: string }>({});
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Redirect to /forgot-password if we have no email at all.
  useEffect(() => {
    if (!email) {
      navigate('/forgot-password', { replace: true });
    }
  }, [email, navigate]);

  // Autofocus the code input on mount.
  useEffect(() => {
    codeInputRef.current?.focus();
  }, []);

  // Resend cooldown timer.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse({ code, password, confirm });
    if (!parsed.success) {
      const fieldErrors: { code?: string; password?: string; confirm?: string } = {};
      parsed.error.errors.forEach((err) => {
        const key = err.path[0] as 'code' | 'password' | 'confirm';
        if (!fieldErrors[key]) fieldErrors[key] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      // Step 1: verify the OTP. type:'email' covers the OTP sent by signInWithOtp
      // (which is what /forgot-password calls). This creates a real session.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: parsed.data.code,
        type: 'email',
      });

      if (verifyError) {
        const msg = verifyError.message?.toLowerCase() ?? '';
        if (msg.includes('expired')) {
          setErrors({ code: 'This code has expired. Request a new one.' });
        } else if (msg.includes('invalid') || msg.includes('token')) {
          setErrors({ code: 'Invalid code. Please check and try again.' });
        } else {
          setErrors({ code: verifyError.message || 'Could not verify code.' });
        }
        setLoading(false);
        return;
      }

      // Step 2: with the new session, update the password.
      const { error: updateError } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });

      if (updateError) {
        const msg = updateError.message?.toLowerCase() ?? '';
        if (msg.includes('weak') || msg.includes('pwned') || msg.includes('breach')) {
          setErrors({ password: 'This password is too weak or has been seen in a data breach. Choose another.' });
        } else {
          setErrors({ password: updateError.message || 'Could not update password.' });
        }
        setLoading(false);
        return;
      }

      toast.success('Password updated. Please sign in with your new password.');
      // Force a clean session — don't leave the user logged in via the OTP session.
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Reset password unexpected error:', err);
      toast.error('Unexpected error. Please try again.');
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending || !email) return;
    setResending(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (otpError) {
        console.error('Resend OTP failed:', otpError);
      }
      toast.success('A new code has been sent if the account exists.');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return null; // redirect effect will fire
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEOHead
        title="Set new password | TidyWise"
        description="Enter your code and set a new password for your TidyWise account."
        canonical="/reset-password"
        noIndex
      />
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-bold">Enter your code</CardTitle>
            <CardDescription className="space-y-1">
              <span className="block">
                 We sent a reset code to{' '}
                <span className="font-medium text-foreground inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {email}
                </span>
              </span>
              <span className="block text-xs">
                Enter it below along with your new password.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  Reset code
                </Label>
                <Input
                  id="code"
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  placeholder="12345678"
                  value={code}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
                    setCode(next);
                    if (errors.code) setErrors({ ...errors, code: undefined });
                  }}
                  className={`tracking-widest text-center text-lg font-medium ${errors.code ? 'border-destructive' : ''}`}
                  maxLength={CODE_LENGTH}
                  required
                />
                {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors({ ...errors, password: undefined });
                    }}
                    className={errors.password ? 'border-destructive' : ''}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPwd((s) => !s)}
                    tabIndex={-1}
                  >
                    {showPwd ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm" className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Confirm password
                </Label>
                <Input
                  id="confirm"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (errors.confirm) setErrors({ ...errors, confirm: undefined });
                  }}
                  className={errors.confirm ? 'border-destructive' : ''}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || resending}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resending
                    ? 'Sending…'
                    : resendCooldown > 0
                      ? `Resend code in ${resendCooldown}s`
                      : "Didn't get a code? Resend"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
