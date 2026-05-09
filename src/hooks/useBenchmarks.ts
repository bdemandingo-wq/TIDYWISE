import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ServiceBucket =
  | 'standard'
  | 'deep'
  | 'move_in_out'
  | 'airbnb'
  | 'recurring'
  | 'post_construction'
  | 'other';

export type CohortType = 'local' | 'regional' | 'national';

export interface MyMetric {
  service_bucket: ServiceBucket;
  bookings_count: number | null;
  avg_price: number | null;
  cancel_rate: number | null;
  noshow_rate: number | null;
  repeat_rate: number | null;
  review_rate: number | null;
  avg_rating: number | null;
  recurring_share: number | null;
}

export interface PeerSnapshot {
  service_bucket: ServiceBucket;
  org_count: number;
  avg_price: number | null;
  median_price: number | null;
  p25_price: number | null;
  p75_price: number | null;
  cancel_rate: number | null;
  noshow_rate: number | null;
  repeat_rate: number | null;
  review_rate: number | null;
  avg_rating: number | null;
  recurring_share: number | null;
  bookings_per_org: number | null;
}

export interface BenchmarksResponse {
  opted_in: boolean;
  period_start?: string;
  cohort_keys?: { local: string; regional: string; national: string };
  my_metrics?: MyMetric[];
  peers?: Record<CohortType, PeerSnapshot[]>;
}

export function useBenchmarks(organizationId: string | null) {
  return useQuery<BenchmarksResponse | null>({
    queryKey: ['benchmarks', organizationId],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await (supabase.rpc as any)('get_org_benchmarks', {
        p_org_id: organizationId,
        p_cohort: 'auto',
      });
      if (error) throw error;
      return data as BenchmarksResponse;
    },
  });
}
