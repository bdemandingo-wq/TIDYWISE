import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send, Zap, Plus, Trash2, MoreHorizontal, Edit, BarChart3, Loader2, Play, MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { describeCampaignDispatch } from "@/components/admin/campaigns/campaignDispatch";
import type { CampaignTrackingStat } from "@/hooks/useCampaigns";
import { CampaignRunBadge } from "@/components/admin/campaigns/CampaignRunBadge";
import type { CampaignRun } from "@/components/admin/campaigns/campaignRunStatus";

type StatusFilter = "all" | "draft" | "scheduled" | "sent" | "active";

/**
 * The campaign library: status filter, plus the mobile card list and desktop
 * table with their row actions.
 *
 * Extracted verbatim from CampaignsPage.tsx — markup, classes, copy, badge
 * logic and the mobile/desktop split are unchanged. The run and delete
 * mutations move with it, since nothing else invoked them.
 */
export function CampaignList({
  campaigns,
  orgId,
  statusFilter,
  onStatusFilterChange,
  trackingStats,
  conversionStats,
  runs,
  orgTimezone,
  onOpenTracking,
  onEditCampaign,
  onNewCampaign,
}: {
  campaigns: Array<Record<string, any>>;
  orgId: string | null;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  trackingStats: Record<string, CampaignTrackingStat>;
  conversionStats: { byCampaign?: Record<string, number> } | null | undefined;
  runs: Record<string, CampaignRun>;
  orgTimezone: string | null;
  onOpenTracking: (campaignId: string) => void;
  onEditCampaign: (campaign: Record<string, any>) => void;
  onNewCampaign: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const filteredCampaigns = campaigns;
  const campaignTrackingStats = trackingStats;
  const setDetailCampaignId = onOpenTracking;
  const setEditCampaign = onEditCampaign;
  const setCreateOpen = (_: boolean) => onNewCampaign();
  const setStatusFilter = onStatusFilterChange;

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




  const getStatusBadge = (campaign: any) => {
    if (campaign.is_active) return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">Active</Badge>;
    if (campaign.last_run_at) return <Badge variant="secondary" className="text-xs">Sent</Badge>;
    return <Badge variant="outline" className="text-xs">Draft</Badge>;
  };



  return (
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
                          {runs[campaign.id]
                            ? <CampaignRunBadge run={runs[campaign.id]} orgTimezone={orgTimezone} />
                            : getStatusBadge(campaign)}
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
                        <TableCell>
                          {runs[campaign.id]
                            ? <CampaignRunBadge run={runs[campaign.id]} orgTimezone={orgTimezone} />
                            : getStatusBadge(campaign)}
                        </TableCell>
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
  );
}
