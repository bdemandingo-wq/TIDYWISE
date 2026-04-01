import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

export default function RedirectPage() {
  const { code } = useParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndRedirect = async () => {
      if (!code) {
        setError('Invalid link');
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('short_urls')
        .select('target_url, expires_at')
        .eq('code', code)
        .maybeSingle();

      if (fetchError || !data) {
        setError('Link not found or expired');
        return;
      }

      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('This link has expired');
        return;
      }

      // Redirect to the target URL
      window.location.href = data.target_url;
    };

    fetchAndRedirect();
  }, [code]);

  if (error) {
    return (
      <>
      <SEOHead title="Redirecting... | TidyWise" description="You are being redirected." noIndex />
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-destructive mb-2">Link Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
}
