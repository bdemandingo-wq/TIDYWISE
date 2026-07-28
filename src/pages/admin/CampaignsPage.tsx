import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";
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
  Link2, AlertTriangle, X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { SEOHead } from '@/components/SEOHead';
import { ReferralDashboard } from '@/components/admin/ReferralDashboard';

interface AITemplate {
  name: string;
  message: string;
}

type ChannelFilter = "all" | "sms" | "email" | "opted_out";
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

function ManualOptOutForm({ orgId, isPending, onSubmit }: {
  orgId: string | null;
  isPending: boolean;
  onSubmit: (customerId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: results = [] } = useQuery({
    queryKey: ["customer-search-optout", orgId, search],
    queryFn: async () => {
      if (!orgId || search.trim().length < 2) return [];
      const term = `%${search.trim()}%`;
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email")
        .eq("organization_id", orgId)
        .eq("marketing_status", "active")
        .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
        .limit(8);
      if (error) return [];
      return data || [];
    },
    enabled: !!orgId && search.trim().length >= 2,
  });

  return (
    <Card className="mt-4">
      <CardContent className="p-4 space-y-3">
        <div>
          <Label className="text-sm font-medium">Manually mark a contact as opted out</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Search by name, phone, or email. They will be excluded from all future campaign sends.
          </p>
        </div>
        <Input
          placeholder="Search active contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {results.length > 0 && (
          <div className="border rounded-lg divide-y">
            {results.map((c: any) => {
              const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
              return (
                <div key={c.id} className="flex items-center justify-between p-2.5 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.phone || c.email || '—'}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    disabled={isPending}
                    onClick={() => { onSubmit(c.id); setSearch(""); }}
                  >
                    <UserX className="w-3.5 h-3.5 mr-1" /> Opt out
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {search.trim().length >= 2 && results.length === 0 && (
          <p className="text-xs text-muted-foreground">No active contacts match.</p>
        )}
      </CardContent>
    </Card>
  );
}

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
    const audience = searchParams.get('audience');
    if (!audience) return;
    const days = parseInt(searchParams.get('days') || '', 10);
    setCampaignForm(prev => ({
      ...prev,
      audience: audience as any,
      ...(Number.isFinite(days) ? { days_inactive: days } : {}),
    }));
    if (searchParams.get('create') === '1') setCreateOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    excludeAlreadyReceived: false,
    excludeRecentDays: 0,
    onlyAfterDate: undefined as Date | undefined,
  });

  // AI
  const [aiTone, setAiTone] = useState("friendly");
  const [aiTemplates, setAiTemplates] = useState<AITemplate[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Automations expand
  const [expandedAutomation, setExpandedAutomation] = useState<string | null>(null);

  // Campaign detail dialog
  const [detailCampaignId, setDetailCampaignId] = useState<string | null>(null);

  // Campaign edit dialog
  const [editCampaign, setEditCampaign] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", subject: "", body: "", is_active: false });

  // Test results
  const [testResult, setTestResult] = useState<{
    inactive: number; contactable: number; excludedCount?: number; customers?: any[];
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

  // Conversion stats + per-campaign sent counts
  const { data: conversionStats } = useQuery({
    queryKey: ["campaign-conversions", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data: sends } = await supabase
        .from("campaign_sms_sends")
        .select("id, converted, campaign_type, campaign_id")
        .eq("organization_id", orgId);
      if (!sends) return { total: 0, converted: 0, rate: 0, byCampaign: {} as Record<string, number> };
      const total = sends.length;
      const converted = sends.filter(s => s.converted).length;
      const rate = total > 0 ? Math.round((converted / total) * 100) : 0;
      const byCampaign: Record<string, number> = {};
      sends.forEach(s => { if (s.campaign_id) { byCampaign[s.campaign_id] = (byCampaign[s.campaign_id] || 0) + 1; } });
      return { total, converted, rate, byCampaign };
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

  // Opted-out customer list
  const { data: optedOutList = [] } = useQuery({
    queryKey: ["opted-out-list", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email, opted_out_at, opted_out_method, opted_out_campaign_id, updated_at")
        .eq("organization_id", orgId)
        .eq("marketing_status", "opted_out")
        .order("opted_out_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Map of campaign id -> name for opt-out attribution
  const campaignNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    campaigns.forEach((c: any) => { m[c.id] = c.name; });
    return m;
  }, [campaigns]);

  const setOptOutStatus = useMutation({
    mutationFn: async ({ customerId, optedOut }: { customerId: string; optedOut: boolean }) => {
      const update: any = optedOut
        ? { marketing_status: "opted_out", opted_out_at: new Date().toISOString(), opted_out_method: "manual" }
        : { marketing_status: "active", opted_out_at: null, opted_out_method: null, opted_out_campaign_id: null };
      const { error } = await supabase.from("customers").update(update).eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["opted-out-list"] });
      queryClient.invalidateQueries({ queryKey: ["opted-out-count"] });
      toast({ title: vars.optedOut ? "Marked as opted out" : "Opted back in" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Campaign link tracking stats (aggregated per campaign)
  const { data: campaignTrackingStats = {} } = useQuery({
    queryKey: ["campaign-tracking-stats", orgId],
    queryFn: async () => {
      if (!orgId) return {};
      const { data, error } = await supabase
        .from("booking_link_tracking" as any)
        .select("campaign_id, status, link_opened_at, booking_completed_at")
        .eq("organization_id", orgId)
        .not("campaign_id", "is", null);
      if (error) return {};
      const stats: Record<string, { sent: number; opened: number; completed: number; abandoned: number }> = {};
      (data || []).forEach((row: any) => {
        if (!row.campaign_id) return;
        if (!stats[row.campaign_id]) stats[row.campaign_id] = { sent: 0, opened: 0, completed: 0, abandoned: 0 };
        stats[row.campaign_id].sent++;
        if (row.link_opened_at) stats[row.campaign_id].opened++;
        if (row.booking_completed_at) stats[row.campaign_id].completed++;
        if (row.link_opened_at && !row.booking_completed_at) stats[row.campaign_id].abandoned++;
      });
      return stats;
    },
    enabled: !!orgId,
  });

  // Detail tracking for selected campaign
  const { data: detailTracking = [] } = useQuery({
    queryKey: ["campaign-detail-tracking", detailCampaignId, orgId],
    queryFn: async () => {
      if (!detailCampaignId || !orgId) return [];
      const { data, error } = await supabase
        .from("booking_link_tracking" as any)
        .select("*")
        .eq("organization_id", orgId)
        .eq("campaign_id", detailCampaignId)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!detailCampaignId && !!orgId,
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
    onError: async (error: Error) => {
      const { handlePossibleAiCreditError } = await import('@/components/ai-credits/AiCreditLimitModal');
      const handled = await handlePossibleAiCreditError(error);
      if (!handled) toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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
      queryClient.invalidateQueries({ queryKey: ["campaign-conversions"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-tracking-stats"] });
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

  const updateCampaign = useMutation({
    mutationFn: async () => {
      if (!editCampaign) throw new Error("No campaign selected");
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase
        .from("automated_campaigns")
        .update({
          name: editForm.name,
          subject: editForm.subject,
          body: editForm.body,
          is_active: editForm.is_active,
        })
        .eq("id", editCampaign.id)
        .eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Campaign updated" });
      setEditCampaign(null);
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
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
    mutationFn: async (opts?: { silent?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("run-inactive-campaign", {
        body: {
          organizationId: orgId,
          daysInactive: campaignForm.days_inactive,
          targetAudience: campaignForm.audience,
          testMode: true,
          excludeAlreadyReceived: campaignForm.excludeAlreadyReceived,
          excludeRecentDays: campaignForm.excludeRecentDays,
          onlyAfterDate: campaignForm.onlyAfterDate?.toISOString() || null,
        },
      });
      if (error) throw error;
      return { data, silent: opts?.silent };
    },
    onSuccess: ({ data, silent }) => {
      setTestResult({
        inactive: data.inactiveCount || 0,
        contactable: data.toContactCount || 0,
        excludedCount: data.excludedCount || 0,
        customers: data.customers,
      });
      if (!silent) toast({ title: "Preview ready", description: `${data.toContactCount || 0} recipients found` });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  // Auto-refresh recipient count on step 1 when audience params change
  useEffect(() => {
    if (!createOpen || createStep !== 1 || !orgId) return;
    if (campaignForm.audience !== "inactive_clients") return;
    const t = setTimeout(() => testCampaign.mutate({ silent: true }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, createStep, orgId, campaignForm.audience, campaignForm.days_inactive, campaignForm.excludeAlreadyReceived, campaignForm.excludeRecentDays, campaignForm.onlyAfterDate]);

  const sendCampaignNow = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organization not found");

      const channel = campaignForm.channel;
      const isSMS   = channel === "sms" || channel === "both";
      const isEmail = channel === "email" || channel === "both";

      // Save the campaign record first (provides campaign_id for tracking)
      const { data: newCampaign, error: insertError } = await supabase.from("automated_campaigns").insert({
        organization_id: orgId,
        name: campaignForm.name || `Campaign ${format(new Date(), "MMM d, yyyy")}`,
        type: "custom",
        days_inactive: campaignForm.days_inactive,
        subject: isEmail ? campaignForm.emailSubject : "SMS Campaign",
        body: isEmail ? campaignForm.emailBody : campaignForm.smsBody,
        is_active: true,
      }).select("id").single();
      if (insertError) throw insertError;

      let smsSentCount = 0;
      let emailSentCount = 0;

      // SMS leg — run-inactive-campaign handles SMS only
      if (isSMS) {
        const { data: smsData, error: smsError } = await supabase.functions.invoke("run-inactive-campaign", {
          body: {
            organizationId: orgId,
            campaignId: newCampaign.id,
            daysInactive: campaignForm.days_inactive,
            message: campaignForm.smsBody,
            targetAudience: campaignForm.audience,
            testMode: false,
            excludeAlreadyReceived: campaignForm.excludeAlreadyReceived,
            excludeRecentDays: campaignForm.excludeRecentDays,
            onlyAfterDate: campaignForm.onlyAfterDate?.toISOString() || null,
          },
        });
        if (smsError) throw smsError;
        smsSentCount = smsData?.sentCount || 0;
      }

      // Email leg — send-followup-campaign handles email
      if (isEmail) {
        const { data: emailData, error: emailError } = await supabase.functions.invoke("send-followup-campaign", {
          body: {
            campaignId: newCampaign.id,
            targetAudience: campaignForm.audience,
          },
        });
        if (emailError) throw emailError;
        emailSentCount = emailData?.sentCount || 0;
      }

      return { smsSentCount, emailSentCount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-conversions"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-tracking-stats"] });
      const total = data.smsSentCount + data.emailSentCount;
      toast({ title: "Sent!", description: `${total} messages delivered` });
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
      excludeAlreadyReceived: false, excludeRecentDays: 0, onlyAfterDate: undefined,
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
        <Button className="gap-2" onClick={() => { resetForm(); setCreateOpen(true); }}>
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
            /* Opted Out List */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Opted-Out Contacts</h2>
                  <p className="text-xs text-muted-foreground">
                    These contacts replied STOP or were manually excluded — they will not receive any future campaign sends.
                  </p>
                </div>
              </div>

              {optedOutList.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <UserX className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-1">No opted-out contacts</h3>
                    <p className="text-sm text-muted-foreground">When customers reply STOP or are marked as opted out, they will appear here.</p>
                  </CardContent>
                </Card>
              ) : isMobile ? (
                <div className="space-y-3">
                  {optedOutList.map((c: any) => {
                    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
                    const campaignName = c.opted_out_campaign_id ? campaignNameMap[c.opted_out_campaign_id] : null;
                    return (
                      <Card key={c.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{name}</p>
                            <p className="text-xs text-muted-foreground">{c.phone || c.email || '—'}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="text-[10px]">
                                {c.opted_out_method === 'sms_stop' ? 'Replied STOP' : c.opted_out_method === 'manual' ? 'Manual' : (c.opted_out_method || 'Manual')}
                              </Badge>
                              {c.opted_out_at && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {format(new Date(c.opted_out_at), 'MMM d, yyyy')}
                                </Badge>
                              )}
                              {campaignName && (
                                <Badge variant="outline" className="text-[10px] gap-1">
                                  <Send className="w-2.5 h-2.5" />{campaignName}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOptOutStatus.mutate({ customerId: c.id, optedOut: false })}
                            disabled={setOptOutStatus.isPending}
                          >
                            Opt back in
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contact</TableHead>
                        <TableHead className="w-[180px]">Phone</TableHead>
                        <TableHead className="w-[140px]">Date Opted Out</TableHead>
                        <TableHead className="w-[140px]">Method</TableHead>
                        <TableHead>Triggering Campaign</TableHead>
                        <TableHead className="w-[140px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {optedOutList.map((c: any) => {
                        const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
                        const campaignName = c.opted_out_campaign_id ? campaignNameMap[c.opted_out_campaign_id] : null;
                        return (
                          <TableRow key={c.id} className="hover:bg-muted/30">
                            <TableCell>
                              <p className="font-medium text-sm">{name}</p>
                              {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                            </TableCell>
                            <TableCell><span className="text-sm">{c.phone || '—'}</span></TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {c.opted_out_at ? format(new Date(c.opted_out_at), 'MMM d, yyyy') : '—'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {c.opted_out_method === 'sms_stop' ? 'Replied STOP' : c.opted_out_method === 'manual' ? 'Manual' : (c.opted_out_method || 'Manual')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {campaignName ? (
                                <span className="text-sm">{campaignName}</span>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setOptOutStatus.mutate({ customerId: c.id, optedOut: false })}
                                disabled={setOptOutStatus.isPending}
                              >
                                Opt back in
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Manually mark a contact as opted out */}
              <ManualOptOutForm
                onSubmit={(customerId) => setOptOutStatus.mutate({ customerId, optedOut: true })}
                orgId={orgId}
                isPending={setOptOutStatus.isPending}
              />
            </div>
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
                          <Button variant="ghost" size="icon" className="min-h-[44px] w-8 shrink-0">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setEditForm({
                              name: campaign.name || "",
                              subject: campaign.subject || "",
                              body: campaign.body || "",
                              is_active: !!campaign.is_active,
                            });
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
                              setEditForm({
                                name: campaign.name || "",
                                subject: campaign.subject || "",
                                body: campaign.body || "",
                                is_active: !!campaign.is_active,
                              });
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
                                setEditForm({
                                  name: campaign.name || "",
                                  subject: campaign.subject || "",
                                  body: campaign.body || "",
                                  is_active: !!campaign.is_active,
                                });
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
                  <div className="mt-2 flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-xs">
                    <span>
                      {testCampaign.isPending
                        ? 'Counting recipients…'
                        : testResult
                          ? <>Recipients: <strong>{testResult.contactable}</strong>{(testResult.excludedCount || 0) > 0 && <span className="text-muted-foreground"> · {testResult.excludedCount} excluded</span>}</>
                          : 'Recipient count will appear here.'}
                    </span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => testCampaign.mutate(undefined)} disabled={testCampaign.isPending}>
                      Refresh
                    </Button>
                  </div>
                </div>
              )}

              {/* Exclude Filters */}
              <div className="space-y-3 rounded-lg border p-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <UserX className="w-4 h-4" />
                  Duplicate Send Filters
                </Label>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm">Exclude already received</p>
                    <p className="text-xs text-muted-foreground">Skip clients who got this exact campaign before</p>
                  </div>
                  <Switch
                    checked={campaignForm.excludeAlreadyReceived}
                    onCheckedChange={c => setCampaignForm(prev => ({ ...prev, excludeAlreadyReceived: c }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm">Skip recently contacted</p>
                  <Select
                    value={campaignForm.excludeRecentDays.toString()}
                    onValueChange={v => setCampaignForm(prev => ({ ...prev, excludeRecentDays: parseInt(v) }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No filter</SelectItem>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="60">Last 60 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Skip clients who received any campaign within this window</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm">Only new clients after</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !campaignForm.onlyAfterDate && "text-muted-foreground")}>
                        <CalendarDays className="w-4 h-4 mr-2" />
                        {campaignForm.onlyAfterDate ? format(campaignForm.onlyAfterDate, "PPP") : "No date filter"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={campaignForm.onlyAfterDate}
                        onSelect={d => setCampaignForm(prev => ({ ...prev, onlyAfterDate: d }))}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {campaignForm.onlyAfterDate && (
                    <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setCampaignForm(prev => ({ ...prev, onlyAfterDate: undefined }))}>
                      <X className="w-3 h-3 mr-1" /> Clear date filter
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">Target only clients added after this date</p>
                </div>
              </div>

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
                        <SelectTrigger className="w-[140px] min-h-[44px] text-sm"><SelectValue /></SelectTrigger>
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
                    <div className="grid gap-2 mt-3 grid-cols-1 md:grid-cols-3">
                      {aiTemplates.map((t, i) => (
                        <div key={i} className="p-3 bg-background rounded-lg border text-xs">
                          <p className="font-medium text-primary mb-1">{t.name}</p>
                          <p className="text-muted-foreground line-clamp-3 mb-2">{t.message}</p>
                          <Button size="sm" variant="outline" className="w-full min-h-[44px] text-xs" onClick={() => handleUseTemplate(t)}>
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
                    <span>Placeholders: {"{first_name}"}, {"{last_name}"}, {"{company_name}"}, {"{booking_link}"}</span>
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
                      Placeholders: {"{first_name}"}, {"{last_name}"}, {"{company_name}"}, {"{booking_link}"}
                    </p>
                  </div>
                </>
              )}

              {/* Live Preview */}
              {(campaignForm.channel === "sms" || campaignForm.channel === "both") && campaignForm.smsBody && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">SMS Preview</Label>
                  <div className="bg-muted rounded-2xl p-4 max-w-full sm:max-w-[280px]">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-bl-md px-4 py-3 text-sm whitespace-pre-wrap">
                      {campaignForm.smsBody
                        .replace(/\{first_name\}/g, "Sarah")
                        .replace(/\{last_name\}/g, "Johnson")
                        .replace(/\{company_name\}/g, businessSettings?.company_name || "Your Company")
                        .replace(/\{booking_link\}/g, "jointidywise.com/book/…?ref=abc123")
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
                {(campaignForm.excludeAlreadyReceived || campaignForm.excludeRecentDays > 0 || campaignForm.onlyAfterDate) && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {campaignForm.excludeAlreadyReceived && (
                      <Badge variant="secondary" className="text-xs">Excluding already received</Badge>
                    )}
                    {campaignForm.excludeRecentDays > 0 && (
                      <Badge variant="secondary" className="text-xs">Skip contacted in last {campaignForm.excludeRecentDays}d</Badge>
                    )}
                    {campaignForm.onlyAfterDate && (
                      <Badge variant="secondary" className="text-xs">Only after {format(campaignForm.onlyAfterDate, "MMM d, yyyy")}</Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Preview audience */}
              <Button variant="outline" className="w-full gap-2" onClick={() => testCampaign.mutate(undefined)} disabled={testCampaign.isPending}>
                {testCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Preview Recipients
              </Button>

              {testResult && (
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <p className="text-sm font-medium">
                      ✅ {testResult.contactable} clients match this audience
                    </p>
                  </div>
                  {(testResult.excludedCount || 0) > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <UserX className="w-3 h-3" /> {testResult.excludedCount} excluded by filters
                    </p>
                  )}
                  {testResult.customers && testResult.customers.length > 0 && (
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {testResult.customers.map((c: any) => {
                        const isExcluded = c.already_received || c.recently_contacted;
                        return (
                          <div key={c.id} className={cn("flex items-center justify-between text-sm p-2 rounded border", isExcluded ? "bg-muted/50 opacity-60" : "bg-background")}>
                            <span className="font-medium">{c.first_name} {c.last_name}</span>
                            <div className="flex items-center gap-2">
                              {c.already_received && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">Already received</Badge>
                              )}
                              {c.recently_contacted && !c.already_received && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">Recently contacted</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">{c.phone || c.email || "No contact"}</span>
                            </div>
                          </div>
                        );
                      })}
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

      {/* Campaign Tracking Detail Dialog */}
      <Dialog open={!!detailCampaignId} onOpenChange={(open) => { if (!open) setDetailCampaignId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Campaign Tracking
            </DialogTitle>
            <DialogDescription>
              Booking link tracking for {campaigns.find(c => c.id === detailCampaignId)?.name || "campaign"}
            </DialogDescription>
          </DialogHeader>

          {/* Stats Cards */}
          {(() => {
            const stats = detailCampaignId ? campaignTrackingStats[detailCampaignId] : null;
            const sent = stats?.sent || 0;
            const opened = stats?.opened || 0;
            const completed = stats?.completed || 0;
            const abandoned = stats?.abandoned || 0;
            const convRate = sent > 0 ? Math.round((completed / sent) * 100) : 0;
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xl font-bold">{sent}</p>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xl font-bold text-amber-600">{opened}</p>
                  <p className="text-xs text-muted-foreground">Opened</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xl font-bold text-green-600">{completed}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xl font-bold text-destructive">{abandoned}</p>
                  <p className="text-xs text-muted-foreground">Abandoned</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xl font-bold">{convRate}%</p>
                  <p className="text-xs text-muted-foreground">Conversion</p>
                </div>
              </div>
            );
          })()}

          {/* REMOVED 2026-07-28: "Re-send to N Abandoned" button.
              It computed the abandoned list (link opened, no booking) client-side
              but then called run-inactive-campaign with targetAudience
              "active_clients" and NO recipient list — so the function re-queried
              from scratch and messaged every active client in the org, while the
              toast reported the abandoned count. It also omitted
              excludeAlreadyReceived, so repeat presses re-sent to everyone.
              Deliberately deleted rather than patched: targeted re-send returns
              with the PGMQ campaign queue, which can enqueue an explicit
              recipient list. Do not reinstate this in its old form. */}

          {/* Recipients List */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recipients</h4>
            {detailTracking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No tracked links for this campaign yet. Include {"{booking_link}"} in your message to enable tracking.</p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {detailTracking.map((track: any) => (
                  <div key={track.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{track.customer_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{track.customer_phone || track.customer_email || ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {track.link_opened_at && (
                        <span className="text-xs text-muted-foreground">
                          Opened {formatDistanceToNow(new Date(track.link_opened_at), { addSuffix: true })}
                        </span>
                      )}
                      <Badge variant={
                        track.booking_completed_at ? "default" :
                        track.link_opened_at ? "destructive" : "secondary"
                      } className="text-xs">
                        {track.booking_completed_at ? "Completed" :
                         track.link_opened_at ? "Abandoned" : "Sent"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Campaign Dialog */}
      <Dialog open={!!editCampaign} onOpenChange={(open) => { if (!open) setEditCampaign(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
            <DialogDescription>Update settings and messaging for this campaign.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-campaign-name">Name</Label>
              <Input
                id="edit-campaign-name"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Campaign name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-campaign-subject">Email Subject</Label>
              <Input
                id="edit-campaign-subject"
                value={editForm.subject}
                onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Subject (email campaigns only)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-campaign-body">Message Body</Label>
              <Textarea
                id="edit-campaign-body"
                value={editForm.body}
                onChange={(e) => setEditForm(prev => ({ ...prev, body: e.target.value }))}
                rows={7}
                placeholder="Your message. Use {first_name} and {company_name} placeholders."
              />
              <p className="text-xs text-muted-foreground">
                {editForm.body.length} chars • {Math.ceil((editForm.body.length || 1) / 160)} SMS segment(s)
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive campaigns won't send automatically.</p>
              </div>
              <Switch
                checked={editForm.is_active}
                onCheckedChange={(v) => setEditForm(prev => ({ ...prev, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCampaign(null)}>Cancel</Button>
            <Button onClick={() => updateCampaign.mutate()} disabled={updateCampaign.isPending || !editForm.name.trim()}>
              {updateCampaign.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
