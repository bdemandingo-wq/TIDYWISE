/**
 * LOGOUT PAGE
 * 
 * Clears all auth state and redirects to login
 * This is a dedicated route for clean logout handling
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthNoSession } from '@/hooks/useAuthNoSession';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

export default function LogoutPage() {
  const navigate = useNavigate();
  const { signOut } = useAuthNoSession();

  useEffect(() => {
    const handleLogout = async () => {
      try {
        await signOut();
        
        // Clear any residual storage keys
        const authKeys = Object.keys(localStorage).filter(key => 
          key.startsWith('sb-') || key.includes('supabase')
        );
        authKeys.forEach(key => localStorage.removeItem(key));
        
        const sessionKeys = Object.keys(sessionStorage).filter(key => 
          key.startsWith('sb-') || key.includes('supabase')
        );
        sessionKeys.forEach(key => sessionStorage.removeItem(key));
        
      } catch (err) {
        console.error('Logout error:', err);
      } finally {
        // Always redirect to login
        navigate('/login', { replace: true });
      }
    };

    handleLogout();
  }, [signOut, navigate]);

  return (
    <SEOHead title="Logging Out | TidyWise" description="You are being logged out." noIndex />
      <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Signing out...</p>
      </div>
    </div>
  );
}
