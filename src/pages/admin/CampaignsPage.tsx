import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/hooks/useOrgId";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MessageSquare, Send, Clock, Trash2, Play, Loader2, BarChart3, Plus, Mail, MoreHorizontal, Edit, CalendarDays, TrendingUp, UserX, Zap, Star, RefreshCw,
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
import { useOptedOutCount } from '@/hooks/useOptOuts';
import {
  useBusinessSettings,
  useCampaignList,
  useOrgAutomations,
  useCampaignConversionStats,
  useCampaignTrackingStats,
} from '@/hooks/useCampaigns';

type ChannelFilter = "all" | "sms" | "email" | "opted_out";
type StatusFilter = "all" | "draft" | "scheduled" | "sent" | "active";

export default function CampaignsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId: orgId } = useOrgId();
  const isMobile = useIsMobile();

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
  const [expandedAutomation, setExpandedAutomation] = useState<string | null>(null);

  // Campaign detail dialog
  const [detailCampaignId, setDetailCampaignId] = useState<string | null>(null);

  // Campaign edit dialog
  const [editCampaign, setEditCampaign] = useState<any | null>(null);


  // Business settings
  const { data: businessSettings } = useBusinessSettings(orgId);

  const { data: campaigns = [], isLoading } = useCampaignList(orgId);

  const { data: automations = [] } = useOrgAutomations(orgId);

  const { data: conversionStats } = useCampaignConversionStats(orgId);

  const { data: optedOutCount = 0 } = useOptedOutCount(orgId);

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
  }, [campaigns, statusFilter, channelFilter]);

  // Mutations


  const runCampaign = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke("run-inactive-campaign", {
        body: { organizationId: orgId, campaignId, testMode: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-conversions"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-tracking-stats"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-runs"] });
      toast(describeCampaignDispatch(data));
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automated_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });




  const toggleAutomation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("organization_automations")
        .update({ is_enabled: enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-automations"] });
      toast({ title: "Automation updated" });
    },
  });




  const getAutomationMeta = (type: string) => {
    const map: Record<string, { label: string; description: string; icon: typeof Zap }> = {
      winback_60day: { label: "Win Back Inactive", description: "Fires after 60+ days of no booking", icon: RefreshCw },
      review_request: { label: "Post-Clean Review Request", description: "Fires 30 min after booking marked complete", icon: Star },
      appointment_reminder: { label: "Appointment Reminder", description: "Fires 24 hours before scheduled cleaning", icon: CalendarDays },
      
      rebooking_reminder: { label: "Recurring Reminder", description: "Fires 28 days after completed cleaning", icon: Clock },
      recurring_upsell: { label: "Recurring Service Upsell", description: "Fires 2 hours after completed cleaning", icon: TrendingUp },
    };
    return map[type] || { label: type.replace(/_/g, " "), description: "", icon: Zap };
  };

  const getStatusBadge = (campaign: any) => {
    if (campaign.is_active) return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">Active</Badge>;
    if (campaign.last_run_at) return <Badge variant="secondary" className="text-xs">Sent</Badge>;
    return <Badge variant="outline" className="text-xs">Draft</Badge>;
  };



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

  return (
    <AdminLayout
      title="Campaigns"
      subtitle="Manage marketing campaigns and automations"
      actions={
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Campaign</span>
        </Button>
      }
    >
<div className="portal-v2 portal-v2-scroll">
      <PlanFeatureGate feature="campaigns">
        <div className="space-y-6">
          {/* Channel Toggle */}
          <Tabs value={channelFilter} onValueChange={(v) => setChannelFilter(v as ChannelFilter)}>
            <TabsList>
              <TabsTrigger value="all">All Channels</TabsTrigger>
              <TabsTrigger value="sms" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> SMS</TabsTrigger>
              <TabsTrigger value="email" className="gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</TabsTrigger>
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
          /* Campaign Library */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Campaign Library</h2>
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <TabsList className="min-h-[44px]">
                  <TabsTrigger value="all" className="text-xs px-3 min-h-[44px]">All</TabsTrigger>
                  <TabsTrigger value="draft" className="text-xs px-3 min-h-[44px]">Draft</TabsTrigger>
                  <TabsTrigger value="active" className="text-xs px-3 min-h-[44px]">Active</TabsTrigger>
                  <TabsTrigger value="sent" className="text-xs px-3 min-h-[44px]">Sent</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {filteredCampaigns.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Send className="w-8 min-h-[44px] text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">No campaigns yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create your first campaign to start engaging customers</p>
                  <Button onClick={() => setCreateOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" /> New Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : isMobile ? (
              <div className="space-y-3">
                {filteredCampaigns.map(campaign => (
                  <Card key={campaign.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">{campaign.name}</p>
                          {getStatusBadge(campaign)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> SMS</span>
                          {campaign.days_inactive && <span>{campaign.days_inactive}d inactive</span>}
                          {campaign.last_run_at && <span>Sent {format(new Date(campaign.last_run_at), "MMM d")}</span>}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="min-h-[44px] w-8 shrink-0">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setEditCampaign(campaign);
                          }}>
                            <Edit className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => runCampaign.mutate(campaign.id)}>
                            <Play className="w-4 h-4 mr-2" /> Send Now
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteCampaign.mutate(campaign.id)}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="w-[80px]">Channel</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[70px]">Sent</TableHead>
                      <TableHead className="w-[70px]">Opened</TableHead>
                      <TableHead className="w-[80px]">Abandoned</TableHead>
                      <TableHead className="w-[70px]">Conv %</TableHead>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.map(campaign => (
                      <TableRow key={campaign.id} className="group hover:bg-muted/30">
                        <TableCell>
                          <button
                            type="button"
                            className="text-left w-full"
                            onClick={() => {
                              setEditCampaign(campaign);
                            }}
                          >
                            <p className="font-medium text-sm hover:text-primary transition-colors">{campaign.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">{campaign.body}</p>
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs gap-1">
                            <MessageSquare className="w-3 h-3" /> SMS
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(campaign)}</TableCell>
                        <TableCell>
                          {(() => {
                            const sentCount = conversionStats?.byCampaign?.[campaign.id] || 0;
                            const trackStats = campaignTrackingStats[campaign.id];
                            return <span className="text-sm font-medium">{sentCount || trackStats?.sent || 0}</span>;
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const stats = campaignTrackingStats[campaign.id];
                            return <span className="text-sm">{stats?.opened || 0}</span>;
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const stats = campaignTrackingStats[campaign.id];
                            if (!stats || stats.sent === 0) return <span className="text-muted-foreground text-sm">—</span>;
                            return (
                              <Badge variant={stats.abandoned > 0 ? "destructive" : "secondary"} className="text-xs">
                                {stats.abandoned}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const sentCount = conversionStats?.byCampaign?.[campaign.id] || 0;
                            const trackStats = campaignTrackingStats[campaign.id];
                            const total = sentCount || trackStats?.sent || 0;
                            const completed = trackStats?.completed || 0;
                            const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
                            return <span className="text-sm">{rate}%</span>;
                          })()}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {campaign.last_run_at ? format(new Date(campaign.last_run_at), "MMM d, yyyy") : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="min-h-[44px] w-8" onClick={() => setDetailCampaignId(campaign.id)} title="View tracking">
                              <BarChart3 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[44px] w-8"
                              title="Edit campaign"
                              onClick={() => {
                                setEditCampaign(campaign);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="min-h-[44px] w-8" onClick={() => runCampaign.mutate(campaign.id)} disabled={runCampaign.isPending}>
                              <Play className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="min-h-[44px] w-8 text-destructive" onClick={() => deleteCampaign.mutate(campaign.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
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

