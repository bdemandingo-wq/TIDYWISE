import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AiCreditStatus {
  used_today: number;
  daily_limit: number;
  purchased_balance: number;
  resets_at: string;
  plan_tier: "trial" | "basic" | "pro" | "custom";
}

/**
 * Reads the org's AI credit status: how many free actions used today,
 * how many are left in the daily allowance, and how many purchased
 * credits remain. Resets are UTC-based.
 */
export function useAiCreditStatus(organizationId: string | null | undefined) {
  return useQuery<AiCreditStatus | null>({
    queryKey: ["ai-credit-status", organizationId],
    enabled: !!organizationId,
    // Item 8: keep the "credits left today" chip fresh — every AI call invalidates this key.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase.rpc("get_ai_credit_status", {
        _org_id: organizationId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as AiCreditStatus | null;
    },
  });
}
