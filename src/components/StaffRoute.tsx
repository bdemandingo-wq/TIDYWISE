import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

interface StaffRouteProps {
  children: ReactNode;
}

export function StaffRoute({ children }: StaffRouteProps) {
  const { user, loading } = useAuth();
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    const checkStaffRole = async () => {
      if (!user) {
        setCheckingRole(false);
        return;
      }

      // Check if user has staff role
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['staff', 'admin']);

      setIsStaff(data && data.length > 0);
      setCheckingRole(false);
    };

    if (!loading) {
      checkStaffRole();
    }
  }, [user, loading]);

  if (loading || checkingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/staff/login" replace />;
  }

  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}