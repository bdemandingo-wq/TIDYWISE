import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { z } from 'zod';

const schema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      // Determine the correct redirect URL based on environment.
      // Production: always use jointidywise.com (regardless of which domain
      // the user submitted from) so the email link is consistent.
      // Preview (*.lovable.app): use the current preview origin.
      // Local dev: use window.location.origin.
      const origin = window.location.origin;
      let redirectBase: string;
      if (origin.includes('lovable.app') || origin.includes('lovable.dev')) {
        redirectBase = origin;
      } else if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        redirectBase = origin;
      } else {
        // Production / custom domain — hardcode canonical production URL.
        redirectBase = 'https://www.jointidywise.com';
      }
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBase}/reset-password`,
      });
      // Always treat as success to avoid leaking account existence.
      if (resetError) {
        // Log but don't surface to the user.
        console.error('Password reset request failed:', resetError);
      }
      setSent(true);
      toast.success('If an account exists for that email, a reset link is on its way.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEOHead
        title="Reset Password | TidyWise"
        description="Reset your TidyWise account password."
        canonical="/forgot-password"
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
            <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
            <CardDescription>
              {sent
                ? "Check your inbox for a reset link."
                : "Enter your email and we'll send you a link to reset your password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  If an account exists for <span className="font-medium text-foreground">{email}</span>,
                  you'll receive an email with a reset link shortly.
                </p>
                <Button asChild className="w-full">
                  <Link to="/login">Return to login</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(undefined);
                    }}
                    className={error ? 'border-destructive' : ''}
                    required
                    autoComplete="email"
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
