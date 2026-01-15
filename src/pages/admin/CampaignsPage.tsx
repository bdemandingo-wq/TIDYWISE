import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/hooks/useOrgId";
import { MessageSquare, Phone, Zap, Send, Users, Clock, Trash2, Play, Loader2, Sparkles, Copy, Check } from "lucide-react";
import { format } from "date-fns";

interface AITemplate {
  name: string;
  message: string;
}

const campaignTypes = [
  { value: "inactive_customer", label: "Inactive Customer Win-Back" },
  { value: "seasonal_promo", label: "Seasonal Promotion" },
  { value: "win_back", label: "Win Back Campaign" },
];

export default function CampaignsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId: orgId } = useOrgId();
  
  const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false);
  const [smsTestResult, setSmsTestResult] = useState<{ inactive: number; contactable: number } | null>(null);
  const [smsFormData, setSmsFormData] = useState({
    name: "",
    type: "inactive_customer",
    days_inactive: 30,
    message: 'Hi {first_name}! We miss you at {company_name}. It\'s been a while since your last clean. Book now and get 15% off! Reply STOP to opt out.'
  });
  const [aiTemplates, setAiTemplates] = useState<AITemplate[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Fetch business settings for company name
  const { data: businessSettings } = useQuery({
    queryKey: ["business-settings", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("business_settings")
        .select("company_name")
        .eq("organization_id", orgId)
        .single();
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch SMS campaigns
  const { data: smsCampaigns = [], isLoading } = useQuery({
    queryKey: ["sms-campaigns", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("automated_campaigns")
        .select("*")
        .eq("organization_id", orgId)
        .in("type", ["inactive_customer", "seasonal_promo", "win_back"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Generate AI templates
  const generateTemplates = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-campaign-templates", {
        body: { 
          companyName: businessSettings?.company_name || "Your Cleaning Service",
          serviceType: "cleaning"
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.templates) {
        setAiTemplates(data.templates);
        toast({ title: "Templates generated!", description: "3 high-conversion templates ready to use" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error generating templates", description: error.message, variant: "destructive" });
    },
  });

  // Create SMS campaign template
  const createSmsCampaign = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organization not found");
      const { error } = await supabase.from("automated_campaigns").insert({
        organization_id: orgId,
        name: smsFormData.name,
        type: smsFormData.type,
        days_inactive: smsFormData.days_inactive,
        subject: "SMS Campaign",
        body: smsFormData.message,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms-campaigns"] });
      setIsSmsDialogOpen(false);
      setSmsFormData({ name: "", type: "inactive_customer", days_inactive: 30, message: smsFormData.message });
      toast({ title: "SMS campaign template created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error creating campaign", description: error.message, variant: "destructive" });
    },
  });

  // Test SMS campaign (preview)
  const testSmsCampaign = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("run-inactive-campaign", {
        body: { 
          organizationId: orgId, 
          daysInactive: smsFormData.days_inactive,
          testMode: true 
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSmsTestResult({ 
        inactive: data.inactiveCount || 0, 
        contactable: data.toContactCount || 0 
      });
      toast({ title: "Preview complete", description: `Found ${data.toContactCount || 0} customers to contact` });
    },
    onError: (error: Error) => {
      toast({ title: "Error testing campaign", description: error.message, variant: "destructive" });
    },
  });

  // Run SMS campaign
  const runSmsCampaign = useMutation({
    mutationFn: async (campaignId?: string) => {
      const { data, error } = await supabase.functions.invoke("run-inactive-campaign", {
        body: { 
          organizationId: orgId, 
          daysInactive: smsFormData.days_inactive,
          message: smsFormData.message,
          campaignId,
          testMode: false 
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sms-campaigns"] });
      toast({ title: "Campaign sent!", description: `Sent ${data.sentCount || 0} SMS messages` });
      setSmsTestResult(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error running campaign", description: error.message, variant: "destructive" });
    },
  });

  // Delete campaign
  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automated_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms-campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });

  const handleUseTemplate = (template: AITemplate) => {
    setSmsFormData(prev => ({ ...prev, message: template.message }));
    toast({ title: "Template applied!", description: `"${template.name}" copied to message composer` });
  };

  const handleCopyTemplate = (template: AITemplate, index: number) => {
    navigator.clipboard.writeText(template.message);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast({ title: "Copied to clipboard!" });
  };

  if (isLoading) {
    return (
      <AdminLayout title="SMS Campaigns" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="SMS Campaigns" subtitle="Automated SMS re-engagement campaigns">
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Win Back Customers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Re-engage inactive customers with personalized SMS</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Seasonal Promos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Send holiday and seasonal promotional messages</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/20 bg-green-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500" />
                Read Receipts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Track delivery status via OpenPhone webhooks</p>
            </CardContent>
          </Card>
        </div>

        {/* AI Template Generator */}
        <Card className="border-purple-500/20 bg-gradient-to-r from-purple-500/5 to-pink-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Template Generator
            </CardTitle>
            <CardDescription>
              Generate high-conversion SMS templates powered by AI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => generateTemplates.mutate()}
              disabled={generateTemplates.isPending}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {generateTemplates.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Sparkles className="h-4 w-4 mr-2" />
              Generate High-Conversion Templates
            </Button>

            {aiTemplates.length > 0 && (
              <div className="grid gap-4 md:grid-cols-3 mt-4">
                {aiTemplates.map((template, index) => (
                  <div 
                    key={index} 
                    className="p-4 border rounded-lg bg-background hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm text-purple-600">{template.name}</h4>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 w-7 p-0"
                          onClick={() => handleCopyTemplate(template, index)}
                        >
                          {copiedIndex === index ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-3">{template.message}</p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full"
                      onClick={() => handleUseTemplate(template)}
                    >
                      Use This
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Win Back Inactive Customers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Win Back Inactive Customers
            </CardTitle>
            <CardDescription>
              Automatically send SMS to customers who haven't booked recently. 
              <span className="text-amber-600 font-medium"> Customers marked as "Opted-Out" are automatically excluded.</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Days Inactive</Label>
                <Select 
                  value={smsFormData.days_inactive.toString()} 
                  onValueChange={(v) => setSmsFormData(prev => ({ ...prev, days_inactive: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => testSmsCampaign.mutate()}
                  disabled={testSmsCampaign.isPending}
                >
                  {testSmsCampaign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Users className="h-4 w-4 mr-2" />
                  Preview List
                </Button>
                <Button 
                  onClick={() => runSmsCampaign.mutate(undefined)}
                  disabled={runSmsCampaign.isPending || !smsTestResult}
                >
                  {runSmsCampaign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Send className="h-4 w-4 mr-2" />
                  Send SMS Campaign
                </Button>
              </div>
            </div>

            {smsTestResult && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">
                  Found <strong>{smsTestResult.inactive}</strong> inactive customers, 
                  <strong> {smsTestResult.contactable}</strong> have phone numbers and will receive SMS.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Message Template</Label>
              <Textarea
                value={smsFormData.message}
                onChange={(e) => setSmsFormData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Hi {first_name}! We miss you..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Available placeholders: {"{first_name}"}, {"{last_name}"}, {"{company_name}"}
              </p>
            </div>

            <Dialog open={isSmsDialogOpen} onOpenChange={setIsSmsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Save as Campaign Template</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create SMS Campaign Template</DialogTitle>
                  <DialogDescription>Save this configuration as a reusable template</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Campaign Name</Label>
                    <Input
                      value={smsFormData.name}
                      onChange={(e) => setSmsFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., 30-Day Win Back"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Campaign Type</Label>
                    <Select 
                      value={smsFormData.type} 
                      onValueChange={(v) => setSmsFormData(prev => ({ ...prev, type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {campaignTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => createSmsCampaign.mutate()} disabled={createSmsCampaign.isPending || !smsFormData.name}>
                    {createSmsCampaign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Template
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Saved SMS Campaign Templates */}
        <Card>
          <CardHeader>
            <CardTitle>Saved Campaign Templates</CardTitle>
            <CardDescription>Your reusable SMS campaign configurations</CardDescription>
          </CardHeader>
          <CardContent>
            {smsCampaigns.length === 0 ? (
              <p className="text-muted-foreground">No campaign templates yet. Create one above!</p>
            ) : (
              <div className="space-y-3">
                {smsCampaigns.map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <p className="font-medium">{campaign.name}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {campaign.days_inactive} days inactive
                        </span>
                        <span className="capitalize">{campaign.type?.replace(/_/g, " ")}</span>
                        {campaign.last_run_at && (
                          <span>Last run: {format(new Date(campaign.last_run_at), "MMM d, yyyy")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => runSmsCampaign.mutate(campaign.id)}
                        disabled={runSmsCampaign.isPending}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Send
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => deleteCampaign.mutate(campaign.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}