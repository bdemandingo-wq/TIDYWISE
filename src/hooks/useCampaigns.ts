import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Read-only data layer for the Campaigns page.
 *
 * Extracted verbatim from CampaignsPage.tsx — query keys, selects, filters,
 * ordering and error handling are unchanged, so cached data carries over.
 *
 * Only queries live here. The page's mutations each read component state
 * (wizard form, edit form, selected row), so they travel with the component
 * that owns that state rather than being hoisted into a shared hook.
 */

export function useBusinessSettings(orgId: string | null) {
  return useQuery({
    queryKey: ["business-settings", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      // timezone drives how scheduled sends are shown and written. An owner
      // scheduling from a different zone must not silently send at the wrong
      // hour, so the org's zone wins over the browser's.
      const { data } = await supabase
        .from("business_settings")
        .select("company_name, timezone")
        .eq("organization_id", orgId)
        .single();
      return data;
    },
    enabled: !!orgId,
  });
}

export function useCampaignList(orgId: string | null) {
  return useQuery({
    queryKey: ["campaigns", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("automated_campaigns")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });
}

export function useOrgAutomations(orgId: string | null) {
  return useQuery({
    queryKey: ["org-automations", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("organization_automations")
        .select("*")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });
}

/**
 * Conversion stats + per-campaign sent counts.
 *
 * campaign_sms_sends holds one row per MESSAGE (send history is retained for
 * compliance evidence), so a customer messaged twice by the same campaign has
 * two rows. Reach figures must therefore count DISTINCT customers, otherwise
 * re-sends inflate the audience and double-count a single conversion.
 *
 * The Sets used to do that are collapsed to counts before returning — the
 * result of this query is persisted to the offline cache, and a Set does not
 * survive the JSON round-trip.
 */
export function useCampaignConversionStats(orgId: string | null) {
  return useQuery({
    queryKey: ["campaign-conversions", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data: sends } = await supabase
        .from("campaign_sms_sends")
        .select("id, customer_id, converted, campaign_type, campaign_id")
        .eq("organization_id", orgId);
      if (!sends) return { total: 0, converted: 0, rate: 0, byCampaign: {} as Record<string, number> };

      const reached = new Set<string>();
      const convertedPeople = new Set<string>();
      const perCampaign: Record<string, Set<string>> = {};
      sends.forEach((s) => {
        // Rows with no customer_id (e.g. ad-hoc referral sends) still count
        // once each — key them by row id so they are never merged together.
        const personKey = s.customer_id || `row:${s.id}`;
        reached.add(personKey);
        if (s.converted) convertedPeople.add(personKey);
        if (s.campaign_id) {
          (perCampaign[s.campaign_id] ||= new Set<string>()).add(personKey);
        }
      });

      const total = reached.size;
      const converted = convertedPeople.size;
      const rate = total > 0 ? Math.round((converted / total) * 100) : 0;
      const byCampaign: Record<string, number> = {};
      Object.entries(perCampaign).forEach(([cid, people]) => {
        byCampaign[cid] = people.size;
      });
      return { total, converted, rate, byCampaign };
    },
    enabled: !!orgId,
  });
}

export interface CampaignTrackingStat {
  sent: number;
  opened: number;
  completed: number;
  abandoned: number;
}

export function useCampaignTrackingStats(orgId: string | null) {
  return useQuery({
    queryKey: ["campaign-tracking-stats", orgId],
    queryFn: async () => {
      if (!orgId) return {};
      const { data, error } = await supabase
        .from("booking_link_tracking" as never)
        .select("campaign_id, status, link_opened_at, booking_completed_at")
        .eq("organization_id", orgId)
        .not("campaign_id", "is", null);
      if (error) return {};
      const stats: Record<string, CampaignTrackingStat> = {};
      ((data || []) as Array<Record<string, unknown>>).forEach((row) => {
        const campaignId = row.campaign_id as string | null;
        if (!campaignId) return;
        if (!stats[campaignId]) stats[campaignId] = { sent: 0, opened: 0, completed: 0, abandoned: 0 };
        stats[campaignId].sent++;
        if (row.link_opened_at) stats[campaignId].opened++;
        if (row.booking_completed_at) stats[campaignId].completed++;
        if (row.link_opened_at && !row.booking_completed_at) stats[campaignId].abandoned++;
      });
      return stats;
    },
    enabled: !!orgId,
  });
}

export function useCampaignDetailTracking(campaignId: string | null, orgId: string | null) {
  return useQuery({
    queryKey: ["campaign-detail-tracking", campaignId, orgId],
    queryFn: async () => {
      const empty: Array<Record<string, unknown>> = [];
      if (!campaignId || !orgId) return empty;
      const { data, error } = await supabase
        .from("booking_link_tracking" as never)
        .select("*")
        .eq("organization_id", orgId)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) return empty;
      return (data || []) as Array<Record<string, unknown>>;
    },
    enabled: !!campaignId && !!orgId,
  });
}
