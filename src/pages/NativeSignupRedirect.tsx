/**
 * Native Signup Redirect - iOS App Store Compliant
 * 
 * On native apps, we don't allow in-app signup.
 * This component redirects to login with a message about signing up on the website.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '@/hooks/usePlatform';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

export default function NativeSignupRedirect() {
  const navigate = useNavigate();
  const { signupUrl } = usePlatform();

  useEffect(() => {
    // Open the website signup in browser
    window.open(signupUrl, '_blank');
    // Navigate to login
    navigate('/login', { replace: true });
  }, [navigate, signupUrl]);

  return (
    <>
      <SEOHead
        title="Sign Up | TidyWise"
        description="Opening the TidyWise signup page on the web — create your free cleaning business CRM account in minutes."
        noIndex
      />
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
        <h1 className="sr-only">Sign up for TidyWise on the web</h1>
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Opening signup page in your browser...</p>
      </div>
    </>
  );
}
