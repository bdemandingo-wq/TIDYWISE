import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from './useOrgId';

export interface OnboardingItem {
  key: string;
  label: string;
  description: string;
  completed: boolean;
  link: string;
  icon: string;
}

export function useOnboardingChecklist() {
  const { organizationId } = useOrgId();

  return useQuery({
    queryKey: ['onboarding-checklist', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      // Run all checks in parallel
      const [services, staff, sms, stripe, bookings] = await Promise.all([
        supabase.from('services').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
        supabase.from('staff').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
        supabase.from('organization_sms_settings').select('openphone_api_key').eq('organization_id', organizationId).maybeSingle(),
        supabase.from('org_stripe_settings').select('stripe_account_id').eq('organization_id', organizationId).maybeSingle(),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      ]);

      const hasServices = (services.count ?? 0) > 0;
      const hasStaff = (staff.count ?? 0) > 0;
      const hasOpenPhone = !!(sms.data?.openphone_api_key);
      const hasStripe = !!(stripe.data?.stripe_account_id);
      const hasBookings = (bookings.count ?? 0) > 0;

      const items: OnboardingItem[] = [
        {
          key: 'services',
          label: 'Add your first service',
          description: 'Define the cleaning services you offer with pricing',
          completed: hasServices,
          link: '/dashboard/services',
          icon: '🧹',
        },
        {
          key: 'staff',
          label: 'Add your first staff member',
          description: 'Invite cleaners to start assigning jobs',
          completed: hasStaff,
          link: '/dashboard/staff',
          icon: '👥',
        },
        {
          key: 'openphone',
          label: 'Connect OpenPhone',
          description: 'Unlock SMS, calls, AI assistant, and daily reports',
          completed: hasOpenPhone,
          link: '/dashboard/settings',
          icon: '📱',
        },
        {
          key: 'stripe',
          label: 'Connect Stripe',
          description: 'Accept payments and set up cleaner payouts',
          completed: hasStripe,
          link: '/dashboard/payment-integration',
          icon: '💳',
        },
        {
          key: 'bookings',
          label: 'Create your first booking',
          description: 'Schedule your first cleaning job',
          completed: hasBookings,
          link: '/dashboard/bookings',
          icon: '📅',
        },
      ];

      return items;
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });
}
