import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { z } from 'zod';

const schema = z
  .object({
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

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validRecovery, setValidRecovery] = useState<boolean | null>(null);
  const [linkErrorReason, setLinkErrorReason] = useState<'consumed' | 'expired' | 'generic' | null>(null);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  useEffect(() => {
    // Supabase redirects with either:
    //   - #access_token=...&type=recovery   (success)
    //   - #error=access_denied&error_code=otp_expired&error_description=...   (token already
    //     consumed, almost always by an email security scanner / link preview pre-fetching
    //     the single-use link before the human clicks it)
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const hashError = params.get('error');
    const hashErrorCode = params.get('error_code');
    const isRecoveryHash = params.get('type') === 'recovery' || hash.includes('type=recovery');

    if (hashError) {
      // Distinguish "consumed by scanner / expired" from generic failure so we can
      // show the user an accurate message.
      if (hashErrorCode === 'otp_expired' || hashError === 'access_denied') {
        setLinkErrorReason('consumed');
      } else {
        setLinkErrorReason('generic');
      }
      setValidRecovery(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setValidRecovery(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session || isRecoveryHash) {
        setValidRecovery(true);
      } else {
        setValidRecovery(false);
        setLinkErrorReason((prev) => prev ?? 'generic');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      const fieldErrors: { password?: string; confirm?: string } = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0] === 'password') fieldErrors.password = err.message;
        if (err.path[0] === 'confirm') fieldErrors.confirm = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message || 'Could not update password');
        setLoading(false);
        return;
      }
      toast.success('Password updated. Please sign in.');
      // Sign out and force a fresh login so we don't leave a stale session.
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error('Unexpected error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEOHead
        title="Set new password | TidyWise"
        description="Set a new password for your TidyWise account."
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
            <CardTitle className="text-2xl font-bold">Set a new password</CardTitle>
            <CardDescription>
              Use at least 8 characters with a mix of letters and numbers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validRecovery === null ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : validRecovery === false ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  This reset link is invalid or has expired. Request a new one.
                </p>
                <Button asChild className="w-full">
                  <Link to="/forgot-password">Request a new reset link</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
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
                      {showPwd ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
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
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
