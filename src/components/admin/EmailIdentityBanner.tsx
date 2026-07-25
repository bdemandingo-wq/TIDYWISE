import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';

const DISMISS_KEY = 'tw_email_identity_banner_dismissed';

export function EmailIdentityBanner() {
  const { organization, isOwner, isAdmin } = useOrganization();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1',
  );

  const { data: configured } = useQuery({
    queryKey: ['email-identity-configured', organization?.id],
    enabled: !!organization?.id && (isOwner || isAdmin),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Non-secret columns only — RLS revokes the API-key/password columns.
      const { data, error } = await supabase
        .from('organization_email_settings')
        .select('from_name, from_email')
        .eq('organization_id', organization!.id)
        .maybeSingle();
      if (error) return true; // fail closed: never nag on a read error
      return !!data && !!data.from_name?.trim() && !!data.from_email?.trim();
    },
  });

  if (!(isOwner || isAdmin)) return null;
  if (dismissed) return null;
  if (configured !== false) return null; // configured / loading / unknown → hide

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          Your customers aren’t receiving emails
        </p>
        <p className="text-sm text-amber-800/90 dark:text-amber-100/80">
          You haven’t set up a sender email yet, so booking confirmations, invoices, and receipts aren’t being delivered.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-2 h-8">
          <Link to="/dashboard/settings?tab=emails">Set up email</Link>
        </Button>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 rounded p-1 text-amber-700/70 hover:bg-amber-500/10 hover:text-amber-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
