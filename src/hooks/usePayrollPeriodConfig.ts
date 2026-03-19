import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { type PayrollPeriodConfig, DEFAULT_PAYROLL_CONFIG } from '@/lib/payrollPeriod';

export function usePayrollPeriodConfig() {
  const { organizationId } = useOrgId();

  const { data: config = DEFAULT_PAYROLL_CONFIG, isLoading } = useQuery({
    queryKey: ['payroll-period-config', organizationId],
    queryFn: async (): Promise<PayrollPeriodConfig> => {
      if (!organizationId) return DEFAULT_PAYROLL_CONFIG;
      const { data, error } = await supabase
        .from('business_settings')
        .select('payroll_frequency, payroll_start_day, payroll_custom_days')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_PAYROLL_CONFIG;
      return {
        payroll_frequency: ((data as any).payroll_frequency || 'weekly') as 'weekly' | 'biweekly',
        payroll_start_day: (data as any).payroll_start_day ?? 1,
        payroll_custom_days: (data as any).payroll_custom_days || null,
      };
    },
    enabled: !!organizationId,
  });

  return { config, isLoading };
}
