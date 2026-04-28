import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  email: z.string().trim().email('Please enter a valid email address').max(255),
});

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
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
      // Send an email OTP code (not a magic link). This avoids email-scanner
      // pre-fetch consuming a single-use recovery link.
      // shouldCreateUser:false ensures we never silently create accounts here.
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: { shouldCreateUser: false },
      });

      // Always treat as success to avoid leaking whether an account exists.
      if (otpError) {
        console.error('OTP send failed:', otpError);
      }

      toast.success('If an account exists for that email, a reset code is on its way.');
      navigate('/reset-password', {
        state: { email: parsed.data.email },
      });
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
              Enter your email and we'll send you a reset code to change your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                Send reset code
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
