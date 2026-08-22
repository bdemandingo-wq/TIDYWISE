import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SegmentedTabs, InverseHeader, StatWell, ActionChipRow } from '@/components/portal-v2';
import type { ActionChip } from '@/components/portal-v2';
import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/hooks/useOrgId";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MessageSquare, Send, Loader2, BarChart3, Plus, TrendingUp, UserX,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SEOHead } from '@/components/SEOHead';
import { ReferralDashboard } from '@/components/admin/ReferralDashboard';
import { describeCampaignDispatch, type CampaignDispatchResult } from '@/components/admin/campaigns/campaignDispatch';
import { StatCard } from '@/components/admin/campaigns/StatCard';
import { OptedOutPanel } from '@/components/admin/campaigns/OptedOutPanel';
import { CampaignTrackingDialog } from '@/components/admin/campaigns/CampaignTrackingDialog';
import { CampaignEditDialog } from '@/components/admin/campaigns/CampaignEditDialog';
import { CampaignWizard } from '@/components/admin/campaigns/CampaignWizard';
import { CampaignList } from '@/components/admin/campaigns/CampaignList';
import { useOptedOutCount } from '@/hooks/useOptOuts';
import { useReferrals } from '@/hooks/useReferrals';
import { useCampaignRuns } from '@/hooks/useCampaignRuns';
import {
  useBusinessSettings,
  useCampaignList,
  useCampaignConversionStats,
  useCampaignTrackingStats,
} from '@/hooks/useCampaigns';

/**
 * There is no channel to filter on.
 *
 * `automated_campaigns` has no `channel` column — the wizard's channel picker
 * only decides which body it saves — and both senders are SMS-only:
 * `run-inactive-campaign` reads organization_sms_settings and sends via
 * OpenPhone, and `process-campaign-queue` is the `campaign_sms` PGMQ worker.
 * So every stored campaign body is sent as SMS.
 *
 * The "SMS" and "Email" tabs were therefore unfilterable and were never wired
 * into the predicate — they rendered the identical unfiltered list. An Email tab
 * that can only ever be empty is worse than no tab, because it implies email
 * campaigns exist. Removed rather than implemented.
 */
type ChannelFilter = "all" | "opted_out";
type StatusFilter = "all" | "draft" | "scheduled" | "sent" | "active";

export default function CampaignsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId: orgId } = useOrgId();
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<'all' | 'opted_out' | 'referrals'>('all');

  // Filters
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Campaign creation
  const [createOpen, setCreateOpen] = useState(false);

  // Deep link from Smart Suggestions: /dashboard/campaigns?audience=...&days=...&create=1
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automations expand

  // Campaign detail dialog
  const [detailCampaignId, setDetailCampaignId] = useState<string | null>(null);

  // Campaign edit dialog
  const [editCampaign, setEditCampaign] = useState<any | null>(null);


  // Business settings
  const { data: businessSettings } = useBusinessSettings(orgId);
  const { data: campaignRuns = {} } = useCampaignRuns(orgId);
  const orgTimezone = businessSettings?.timezone ?? null;

  const { data: campaigns = [], isLoading } = useCampaignList(orgId);


  const { data: conversionStats } = useCampaignConversionStats(orgId);

  const { data: optedOutCount = 0 } = useOptedOutCount(orgId);
  const referralsQ = useReferrals();

  // Map of campaign id -> name for opt-out attribution
  const campaignNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    campaigns.forEach((c: any) => { m[c.id] = c.name; });
    return m;
  }, [campaigns]);


  const { data: campaignTrackingStats = {} } = useCampaignTrackingStats(orgId);


  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (statusFilter !== "all") {
        if (statusFilter === "active" && !c.is_active) return false;
        if (statusFilter === "sent" && c.is_active) return false;
        if (statusFilter === "draft" && c.is_active) return false;
      }
      return true;
    });
    // channelFilter is deliberately absent: it selects a VIEW (the opted-out
    // panel), not a subset of campaigns, so it must not be a dependency here.
  }, [campaigns, statusFilter]);

  // Mutations




  if (isLoading) {
    return (
      <AdminLayout title="Campaigns" subtitle="Loading...">
<div className="portal-v2 portal-v2-scroll">
      <SEOHead title="Campaigns | TidyWise" description="Create and manage marketing campaigns" noIndex />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 min-h-[44px] animate-spin text-primary" />
        </div>
      </div>
</AdminLayout>
    );
  }

  /* ── Mobile arm ──────────────────────────────────────────────────────
     Desktop untouched below. The phone renders CampaignsMobileBody — the same
     component its -v2 route shows — with this page's own toolbar
     actions as chips. Handlers stay here; only rendering moves. */
  const mobileActions: ActionChip[] = [
    { id: 'new', label: 'New Campaign', icon: <Plus className="h-3.5 w-3.5" />, onClick: () => setCreateOpen(true) },
  ];

  if (isMobile) {
    const sentCount = campaigns.filter(c => c.last_run_at).length;
    const activeCount = campaigns.filter(c => c.is_active).length;
    const referralsCount = referralsQ.data?.counts.total ?? 0;

    return (
      <AdminLayout title="Campaigns" subtitle="Manage marketing campaigns and automations">
        <div className="portal-v2 portal-v2-scroll">
          {/* 9c: dark hero with "Campaigns sent" headline + active / opted
              out / referrals wells, mirrored below the app chrome. */}
          <InverseHeader
            eyebrow="Marketing"
            business="Campaigns"
            revenueLabel="Campaigns sent"
            revenue={String(sentCount)}
            wells={
              <>
                <StatWell value={String(activeCount)} caption="active" />
                <StatWell value={String(optedOutCount)} caption="opted out" />
                <StatWell value={String(referralsCount)} caption="referrals" />
              </>
            }
          />

          <ActionChipRow actions={mobileActions} label="Campaign actions" />

          {/* 9c puts Campaigns / Opted Out / Referrals in the hero, and the
              parity guard flagged that the phone had no tabs at all. These are
              the page's OWN channelFilter values plus the Referral Program the
              desktop renders below the list — all three reachable, none
              decorative. */}
          <div className="px-4 pb-2 pt-3">
            <SegmentedTabs
              tabs={[
                { id: 'all', label: 'Campaigns' },
                { id: 'opted_out', label: `Opted Out${optedOutCount > 0 ? ` ${optedOutCount}` : ''}` },
                { id: 'referrals', label: 'Referrals' },
              ]}
              value={mobileView}
              onChange={id => {
                setMobileView(id as typeof mobileView);
                /* Referrals is a separate panel, not a channel — leave the
                   page's own filter alone when switching to it. */
                if (id !== 'referrals') setChannelFilter(id as ChannelFilter);
              }}
              label="Campaigns view"
            />
          </div>

          <div className="px-4 pb-6">
            {mobileView === 'referrals' ? (
              <ReferralDashboard />
            ) : mobileView === 'opted_out' ? (
              <OptedOutPanel orgId={orgId} campaignNameMap={campaignNameMap} />
            ) : (
              <CampaignList
                campaigns={filteredCampaigns}
                orgId={orgId}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                trackingStats={campaignTrackingStats}
                conversionStats={conversionStats}
                runs={campaignRuns}
                orgTimezone={orgTimezone}
                onOpenTracking={setDetailCampaignId}
                onEditCampaign={setEditCampaign}
                onNewCampaign={() => setCreateOpen(true)}
              />
            )}
          </div>
        </div>

        {/* 9d/9e: the same three-step wizard the desktop mounts below its
            `if (isMobile) return` — which meant "+ New" here opened nothing.
            Mounted here too so the phone's own button works. */}
        <CampaignWizard
          open={createOpen}
          onOpenChange={setCreateOpen}
          orgId={orgId}
          businessSettings={businessSettings}
          optedOutCount={optedOutCount}
        />

        <CampaignTrackingDialog
          campaignId={detailCampaignId}
          campaignName={campaigns.find(c => c.id === detailCampaignId)?.name || ""}
          orgId={orgId}
          trackingStats={campaignTrackingStats}
          run={detailCampaignId ? campaignRuns[detailCampaignId] : null}
          orgTimezone={orgTimezone}
          onClose={() => setDetailCampaignId(null)}
        />

        <CampaignEditDialog
          campaign={editCampaign}
          orgId={orgId}
          onClose={() => setEditCampaign(null)}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Campaigns"
      subtitle="Manage marketing campaigns and automations"
      actions={
        /* The label is hidden below sm, so without aria-label the primary
           action on this page is announced as just "button" — and it is the
           only way to create a campaign. */
        <Button className="gap-2" aria-label="New Campaign" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Campaign</span>
        </Button>
      }
    >
<div className="portal-v2 portal-v2-scroll">
      <PlanFeatureGate feature="campaigns">
        <div className="space-y-6">
          {/* Campaigns vs the opted-out roster. Not a channel toggle — see
              ChannelFilter above for why the SMS/Email tabs were removed. */}
          <Tabs value={channelFilter} onValueChange={(v) => setChannelFilter(v as ChannelFilter)}>
            <TabsList>
              <TabsTrigger value="all">Campaigns</TabsTrigger>
              <TabsTrigger value="opted_out" className="gap-1.5">
                <UserX className="w-3.5 h-3.5" /> Opted Out
                {optedOutCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{optedOutCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard icon={Send} label="Campaigns Sent" value={campaigns.filter(c => c.last_run_at).length} />
            <StatCard icon={MessageSquare} label="Messages Delivered" value={conversionStats?.total || 0} />
            <StatCard icon={BarChart3} label="Conversion Rate" value={`${conversionStats?.rate || 0}%`} trend={conversionStats && conversionStats.rate > 5 ? "up" : undefined} />
            <StatCard icon={TrendingUp} label="Converted" value={conversionStats?.converted || 0} trend={conversionStats && conversionStats.converted > 0 ? "up" : undefined} />
            <StatCard icon={UserX} label="Opted Out" value={optedOutCount} />
          </div>

          {channelFilter === "opted_out" ? (
            <OptedOutPanel orgId={orgId} campaignNameMap={campaignNameMap} />
          ) : (
            <CampaignList
              campaigns={filteredCampaigns}
              orgId={orgId}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              trackingStats={campaignTrackingStats}
              conversionStats={conversionStats}
              runs={campaignRuns}
              orgTimezone={orgTimezone}
              onOpenTracking={setDetailCampaignId}
              onEditCampaign={setEditCampaign}
              onNewCampaign={() => setCreateOpen(true)}
            />
          )}
        </div>
      </PlanFeatureGate>

      {/* Referral Dashboard */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Referral Program</h2>
        <ReferralDashboard />
      </div>

      <CampaignWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        businessSettings={businessSettings}
        optedOutCount={optedOutCount}
      />

      <CampaignTrackingDialog
        campaignId={detailCampaignId}
        campaignName={campaigns.find(c => c.id === detailCampaignId)?.name || ""}
        orgId={orgId}
        trackingStats={campaignTrackingStats}
        run={detailCampaignId ? campaignRuns[detailCampaignId] : null}
        orgTimezone={orgTimezone}
        onClose={() => setDetailCampaignId(null)}
      />

      <CampaignEditDialog
        campaign={editCampaign}
        orgId={orgId}
        onClose={() => setEditCampaign(null)}
      />
    </div>
</AdminLayout>
  );
}

