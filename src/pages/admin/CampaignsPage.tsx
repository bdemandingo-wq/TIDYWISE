import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SubscriptionGate } from "@/components/admin/SubscriptionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/hooks/useOrgId";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MessageSquare, Phone, Send, Users, Clock, Trash2, Play, Loader2,
  Sparkles, Copy, Check, BarChart3, AlertCircle, Plus, Mail,
  MoreHorizontal, Edit, CalendarDays, TrendingUp, TrendingDown,
  UserX, Zap, Star, RefreshCw, ChevronDown, ChevronUp, Eye,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AITemplate {
  name: string;
  message: string;
}

type ChannelFilter = "all" | "sms" | "email";
type StatusFilter = "all" | "draft" | "scheduled" | "sent" | "active";
type AudienceType = "active_clients" | "inactive_clients" | "leads" | "all_customers";

const audienceOptions = [
  { value: "active_clients", label: "Active Clients" },
  { value: "inactive_clients", label: "Inactive Clients" },
  { value: "leads", label: "Leads" },
  { value: "all_customers", label: "All Customers" },
];

const toneOptions = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "urgent", label: "Urgent" },
  { value: "seasonal", label: "Seasonal" },
];

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
  const [createStep, setCreateStep] = useState(1);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    channel: "sms" as "sms" | "email" | "both",
    audience: "active_clients" as AudienceType,
    schedule: "now" as "now" | "later",
    scheduledDate: undefined as Date | undefined,
    scheduledTime: "09:00",
    smsBody: 'Hi {first_name}! This is {company_name}. We wanted to reach out — we\'d love to have you back! Reply STOP to opt out.',
    emailSubject: "",
    emailBody: "",
    days_inactive: 30,
  });

  // AI
  const [aiTone, setAiTone] = useState("friendly");
  const [aiTemplates, setAiTemplates] = useState<AITemplate[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Automations expand
  const [expandedAutomation, setExpandedAutomation] = useState<string | null>(null);

  // Test results
  const [testResult, setTestResult] = useState<{
    inactive: number; contactable: number; customers?: any[];
  } | null>(null);

  // Business settings
  const { data: businessSettings } = useQuery({
    queryKey: ["business-settings", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from("business_settings").select("company_name").eq("organization_id", orgId).single();
      return data;
    },
    enabled: !!orgId,
  });

  // Campaigns
  const { data: campaigns = [], isLoading } = useQuery({
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

  // Automations
  const { data: automations = [] } = useQuery({
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

  // Conversion stats
  const { data: conversionStats } = useQuery({
    queryKey: ["campaign-conversions", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data: sends } = await supabase
        .from("campaign_sms_sends")
        .select("id, converted, campaign_type")
        .eq("organization_id", orgId);
      if (!sends) return { total: 0, converted: 0, rate: 0 };
      const total = sends.length;
      const converted = sends.filter(s => s.converted).length;
      const rate = total > 0 ? Math.round((converted / total) * 100) : 0;
      return { total, converted, rate };
    },
    enabled: !!orgId,
  });

  // Opted-out count
  const { data: optedOutCount = 0 } = useQuery({
    queryKey: ["opted-out-count", orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count, error } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("marketing_status", "opted_out");
      if (error) return 0;
      return count || 0;
    },
    enabled: !!orgId,
  });

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
  const generateTemplates = useMutation({
    mutationFn: async () => {
      setAiTemplates([]);
      const { data, error } = await supabase.functions.invoke("generate-campaign-templates", {
        body: {
          companyName: businessSettings?.company_name || "Your Cleaning Service",
          serviceType: "cleaning",
          audience: campaignForm.audience,
          tone: aiTone,
          timestamp: Date.now(),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.templates?.length > 0) {
        setAiTemplates(data.templates);
        toast({ title: "Templates generated!", description: "Pick one to use in your campaign" });
      } else {
        toast({ title: "Error", description: "No templates generated. Try again.", variant: "destructive" });
      }
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase.from("automated_campaigns").insert({
        organization_id: orgId,
        name: campaignForm.name,
        type: "custom",
        days_inactive: campaignForm.days_inactive,
        subject: campaignForm.channel === "email" || campaignForm.channel === "both"
          ? campaignForm.emailSubject : "SMS Campaign",
        body: campaignForm.channel === "sms" ? campaignForm.smsBody : campaignForm.emailBody,
        is_active: campaignForm.schedule === "now",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setCreateOpen(false);
      resetForm();
      toast({ title: "Campaign created!" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

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
      toast({ title: "Campaign sent!", description: `Sent ${data.sentCount || 0} messages` });
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

  const testCampaign = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("run-inactive-campaign", {
        body: {
          organizationId: orgId,
          daysInactive: campaignForm.days_inactive,
          targetAudience: campaignForm.audience,
          testMode: true,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setTestResult({ inactive: data.inactiveCount || 0, contactable: data.toContactCount || 0, customers: data.customers });
      toast({ title: "Preview ready", description: `${data.toContactCount || 0} recipients found` });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const sendCampaignNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("run-inactive-campaign", {
        body: {
          organizationId: orgId,
          daysInactive: campaignForm.days_inactive,
          message: campaignForm.smsBody,
          targetAudience: campaignForm.audience,
          testMode: false,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Sent!", description: `${data.sentCount || 0} messages delivered` });
      setCreateOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setCampaignForm({
      name: "", channel: "sms", audience: "active_clients", schedule: "now",
      scheduledDate: undefined, scheduledTime: "09:00",
      smsBody: 'Hi {first_name}! This is {company_name}. We wanted to reach out — we\'d love to have you back! Reply STOP to opt out.',
      emailSubject: "", emailBody: "", days_inactive: 30,
    });
    setCreateStep(1);
    setAiTemplates([]);
    setTestResult(null);
  };

  const handleUseTemplate = (template: AITemplate) => {
    setCampaignForm(prev => ({ ...prev, smsBody: template.message, emailBody: template.message }));
    toast({ title: "Template applied!" });
  };

  const getAutomationMeta = (type: string) => {
    const map: Record<string, { label: string; description: string; icon: typeof Zap }> = {
      winback_60day: { label: "Win Back Inactive", description: "Fires after 60+ days of no booking", icon: RefreshCw },
      review_request: { label: "Post-Clean Review Request", description: "Fires 30 min after booking marked complete", icon: Star },
      appointment_reminder: { label: "Appointment Reminder", description: "Fires 24 hours before scheduled cleaning", icon: CalendarDays },
      missed_call_textback: { label: "Missed Call Text-Back", description: "Auto-reply when a call is missed", icon: Phone },
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

  const charCount = campaignForm.smsBody.length;
  const segments = Math.ceil(charCount / 160) || 1;

  if (isLoading) {
    return (
      <AdminLayout title="Campaigns" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Campaigns"
      subtitle="Manage marketing campaigns and automations"
      actions={
        <Button className="gap-2" onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Campaign</span>
        </Button>
      }
    >
      <SubscriptionGate feature="Campaigns">
        <div className="space-y-6">
          {/* Channel Toggle */}
          <Tabs value={channelFilter} onValueChange={(v) => setChannelFilter(v as ChannelFilter)}>
            <TabsList>
              <TabsTrigger value="all">All Channels</TabsTrigger>
              <TabsTrigger value="sms" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> SMS</TabsTrigger>
              <TabsTrigger value="email" className="gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</TabsTrigger>
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

          {/* Campaign Library */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Campaign Library</h2>
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs px-3 h-7">All</TabsTrigger>
                  <TabsTrigger value="draft" className="text-xs px-3 h-7">Draft</TabsTrigger>
                  <TabsTrigger value="active" className="text-xs px-3 h-7">Active</TabsTrigger>
                  <TabsTrigger value="sent" className="text-xs px-3 h-7">Sent</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {filteredCampaigns.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Send className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">No campaigns yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create your first campaign to start engaging customers</p>
                  <Button onClick={() => { resetForm(); setCreateOpen(true); }} className="gap-2">
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
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="w-[80px]">Channel</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[120px]">Audience</TableHead>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.map(campaign => (
                      <TableRow key={campaign.id} className="group hover:bg-muted/30">
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{campaign.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">{campaign.body}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs gap-1">
                            <MessageSquare className="w-3 h-3" /> SMS
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(campaign)}</TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">{campaign.type?.replace(/_/g, " ")}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {campaign.last_run_at ? format(new Date(campaign.last_run_at), "MMM d, yyyy") : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => runCampaign.mutate(campaign.id)} disabled={runCampaign.isPending}>
                              <Play className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteCampaign.mutate(campaign.id)}>
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

          {/* Automation Triggers */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Automation Triggers</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {automations.map(auto => {
                const meta = getAutomationMeta(auto.automation_type);
                const Icon = meta.icon;
                const isExpanded = expandedAutomation === auto.id;
                return (
                  <Card key={auto.id} className={cn("transition-colors", auto.is_enabled ? "border-primary/20" : "opacity-70")}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", auto.is_enabled ? "bg-primary/10" : "bg-muted")}>
                            <Icon className={cn("w-4.5 h-4.5", auto.is_enabled ? "text-primary" : "text-muted-foreground")} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{meta.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{meta.description || auto.description}</p>
                          </div>
                        </div>
                        <Switch
                          checked={auto.is_enabled}
                          onCheckedChange={(enabled) => toggleAutomation.mutate({ id: auto.id, enabled })}
                        />
                      </div>
                      {isMobile && (
                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground mt-3 hover:text-foreground transition-colors"
                          onClick={() => setExpandedAutomation(isExpanded ? null : auto.id)}
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? "Less" : "Details"}
                        </button>
                      )}
                      {(isExpanded || !isMobile) && (
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t text-xs text-muted-foreground">
                          <span>Status: {auto.is_enabled ? "Active" : "Manual Only"}</span>
                          <span>Updated: {format(new Date(auto.updated_at), "MMM d")}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </SubscriptionGate>

      {/* Create Campaign Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {createStep === 1 ? "Campaign Setup" : createStep === 2 ? "Message Builder" : "Review & Send"}
            </DialogTitle>
            <DialogDescription>
              Step {createStep} of 3
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex gap-1 mb-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors", s <= createStep ? "bg-primary" : "bg-muted")} />
            ))}
          </div>

          {createStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input
                  value={campaignForm.name}
                  onChange={e => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Spring Cleaning Promo"
                />
              </div>

              <div className="space-y-2">
                <Label>Channel</Label>
                <div className="flex gap-2">
                  {(["sms", "email", "both"] as const).map(ch => (
                    <Button
                      key={ch}
                      variant={campaignForm.channel === ch ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5 flex-1"
                      onClick={() => setCampaignForm(prev => ({ ...prev, channel: ch }))}
                    >
                      {ch === "sms" ? <MessageSquare className="w-3.5 h-3.5" /> : ch === "email" ? <Mail className="w-3.5 h-3.5" /> : <><MessageSquare className="w-3.5 h-3.5" /><Mail className="w-3.5 h-3.5" /></>}
                      {ch === "both" ? "Both" : ch.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Select value={campaignForm.audience} onValueChange={v => setCampaignForm(prev => ({ ...prev, audience: v as AudienceType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {audienceOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {campaignForm.audience === "inactive_clients" && (
                <div className="space-y-2">
                  <Label>Days Inactive</Label>
                  <Select value={campaignForm.days_inactive.toString()} onValueChange={v => setCampaignForm(prev => ({ ...prev, days_inactive: parseInt(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Schedule</Label>
                <div className="flex gap-2">
                  <Button
                    variant={campaignForm.schedule === "now" ? "default" : "outline"}
                    size="sm" className="flex-1"
                    onClick={() => setCampaignForm(prev => ({ ...prev, schedule: "now" }))}
                  >
                    Send Now
                  </Button>
                  <Button
                    variant={campaignForm.schedule === "later" ? "default" : "outline"}
                    size="sm" className="flex-1"
                    onClick={() => setCampaignForm(prev => ({ ...prev, schedule: "later" }))}
                  >
                    Schedule for Later
                  </Button>
                </div>
                {campaignForm.schedule === "later" && (
                  <div className="flex gap-2 mt-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !campaignForm.scheduledDate && "text-muted-foreground")}>
                          <CalendarDays className="w-4 h-4 mr-2" />
                          {campaignForm.scheduledDate ? format(campaignForm.scheduledDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={campaignForm.scheduledDate}
                          onSelect={d => setCampaignForm(prev => ({ ...prev, scheduledDate: d }))}
                          disabled={d => d < new Date()}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={campaignForm.scheduledTime}
                      onChange={e => setCampaignForm(prev => ({ ...prev, scheduledTime: e.target.value }))}
                      className="w-[130px]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-4">
              {/* AI Helper */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">AI Template Generator</span>
                  </div>
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tone</Label>
                      <Select value={aiTone} onValueChange={setAiTone}>
                        <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {toneOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" onClick={() => generateTemplates.mutate()} disabled={generateTemplates.isPending} className="gap-1.5">
                      {generateTemplates.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Generate
                    </Button>
                  </div>
                  {aiTemplates.length > 0 && (
                    <div className="grid gap-2 mt-3 md:grid-cols-3">
                      {aiTemplates.map((t, i) => (
                        <div key={i} className="p-3 bg-background rounded-lg border text-xs">
                          <p className="font-medium text-primary mb-1">{t.name}</p>
                          <p className="text-muted-foreground line-clamp-3 mb-2">{t.message}</p>
                          <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => handleUseTemplate(t)}>
                            Use This
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {(campaignForm.channel === "sms" || campaignForm.channel === "both") && (
                <div className="space-y-2">
                  <Label>SMS Message</Label>
                  <Textarea
                    value={campaignForm.smsBody}
                    onChange={e => setCampaignForm(prev => ({ ...prev, smsBody: e.target.value }))}
                    placeholder="Hi {first_name}! ..."
                    rows={4}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Placeholders: {"{first_name}"}, {"{last_name}"}, {"{company_name}"}, {"{booking_date}"}, {"{service_type}"}</span>
                    <span className={cn(charCount > 160 ? "text-amber-600" : "")}>{charCount} chars · {segments} segment{segments > 1 ? "s" : ""}</span>
                  </div>
                </div>
              )}

              {(campaignForm.channel === "email" || campaignForm.channel === "both") && (
                <>
                  <div className="space-y-2">
                    <Label>Email Subject</Label>
                    <Input
                      value={campaignForm.emailSubject}
                      onChange={e => setCampaignForm(prev => ({ ...prev, emailSubject: e.target.value }))}
                      placeholder="Your next cleaning is waiting!"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Body</Label>
                    <Textarea
                      value={campaignForm.emailBody}
                      onChange={e => setCampaignForm(prev => ({ ...prev, emailBody: e.target.value }))}
                      placeholder="Hi {first_name},\n\nWe'd love to have you back..."
                      rows={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      Placeholders: {"{first_name}"}, {"{last_name}"}, {"{company_name}"}, {"{booking_date}"}, {"{service_type}"}
                    </p>
                  </div>
                </>
              )}

              {/* Live Preview */}
              {(campaignForm.channel === "sms" || campaignForm.channel === "both") && campaignForm.smsBody && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">SMS Preview</Label>
                  <div className="bg-muted rounded-2xl p-4 max-w-[280px]">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-bl-md px-4 py-3 text-sm">
                      {campaignForm.smsBody
                        .replace(/\{first_name\}/g, "Sarah")
                        .replace(/\{last_name\}/g, "Johnson")
                        .replace(/\{company_name\}/g, businessSettings?.company_name || "Your Company")
                        .replace(/\{booking_date\}/g, "Jan 15")
                        .replace(/\{service_type\}/g, "Deep Clean")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {createStep === 3 && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm">Campaign Summary</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Name</p>
                    <p className="font-medium">{campaignForm.name || "Untitled"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Channel</p>
                    <p className="font-medium capitalize">{campaignForm.channel}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Audience</p>
                    <p className="font-medium capitalize">{campaignForm.audience.replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Schedule</p>
                    <p className="font-medium">
                      {campaignForm.schedule === "now" ? "Send Immediately" : campaignForm.scheduledDate ? format(campaignForm.scheduledDate, "PPP") + " at " + campaignForm.scheduledTime : "Not set"}
                    </p>
                  </div>
                </div>
                {optedOutCount > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <UserX className="w-3 h-3" /> {optedOutCount} opted-out contacts will be excluded
                  </p>
                )}
              </div>

              {/* Preview audience */}
              <Button variant="outline" className="w-full gap-2" onClick={() => testCampaign.mutate()} disabled={testCampaign.isPending}>
                {testCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Preview Recipients
              </Button>

              {testResult && (
                <div className="bg-muted rounded-lg p-4">
                  <p className="text-sm font-medium mb-2">
                    Found <strong>{testResult.contactable}</strong> recipients to contact
                  </p>
                  {testResult.customers && testResult.customers.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {testResult.customers.map((c: any, i: number) => (
                        <div key={c.id} className="flex items-center justify-between text-sm p-2 bg-background rounded border">
                          <span className="font-medium">{c.first_name} {c.last_name}</span>
                          <span className="text-xs text-muted-foreground">{c.phone || c.email || "No contact"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message preview */}
              {(campaignForm.channel === "sms" || campaignForm.channel === "both") && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Message Preview</p>
                  <div className="bg-muted rounded-lg p-3 text-sm">{campaignForm.smsBody}</div>
                </div>
              )}
              {(campaignForm.channel === "email" || campaignForm.channel === "both") && campaignForm.emailSubject && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Email: {campaignForm.emailSubject}</p>
                  <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap">{campaignForm.emailBody}</div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {createStep > 1 && (
              <Button variant="outline" onClick={() => setCreateStep(s => s - 1)}>Back</Button>
            )}
            <div className="flex-1" />
            {createStep < 3 ? (
              <Button onClick={() => setCreateStep(s => s + 1)} disabled={createStep === 1 && !campaignForm.name}>
                Continue
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { createCampaign.mutate(); }} disabled={createCampaign.isPending}>
                  {createCampaign.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save as Draft
                </Button>
                <Button onClick={() => sendCampaignNow.mutate()} disabled={sendCampaignNow.isPending}>
                  {sendCampaignNow.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Send className="w-4 h-4 mr-2" />
                  Send Campaign
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, trend }: {
  icon: typeof Send;
  label: string;
  value: string | number;
  trend?: "up" | "down";
}) {
  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-xl md:text-2xl font-bold">{value}</p>
          {trend === "up" && <TrendingUp className="w-4 h-4 text-emerald-500" />}
          {trend === "down" && <TrendingDown className="w-4 h-4 text-destructive" />}
        </div>
      </CardContent>
    </Card>
  );
}
