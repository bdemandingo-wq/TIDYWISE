import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, Send, Clock, CheckCircle, Users, Plus, Play, Loader2, MailOpen, Trash2, Upload, UserPlus, Eye, MessageSquare, Phone, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useOrgId } from '@/hooks/useOrgId';

interface Campaign {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  days_inactive: number | null;
  is_active: boolean | null;
  last_run_at: string | null;
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const orgId = useOrgId();
  const [activeTab, setActiveTab] = useState('email');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false);
  const [isManualEmailDialogOpen, setIsManualEmailDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [previewEmails, setPreviewEmails] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState<'auto' | 'manual'>('auto');
  const [manualEmails, setManualEmails] = useState("");
  const [selectedCampaignForManual, setSelectedCampaignForManual] = useState<string | null>(null);
  const [smsTestResult, setSmsTestResult] = useState<{ inactiveCount: number; toContactCount: number } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'inactive_customer',
    subject: '',
    body: '',
    days_inactive: 30
  });
  const [smsFormData, setSmsFormData] = useState({
    name: '',
    type: 'inactive_customer',
    subject: 'SMS Campaign',
    body: 'Hi {first_name}! We miss you at {company_name}. It\'s been a while since your last clean. Book now and get 15% off! Reply STOP to opt out.',
    days_inactive: 30
  });

  // Fetch campaigns
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automated_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Fetch campaign email stats
  const { data: emailStats = [] } = useQuery({
    queryKey: ['campaign-emails'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_emails')
        .select('campaign_id, status')
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Create campaign
  const createCampaign = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('automated_campaigns').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created!');
      setIsDialogOpen(false);
      setFormData({ name: '', type: 'inactive_customer', subject: '', body: '', days_inactive: 30 });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create campaign: ${error.message}`);
    }
  });

  // Delete campaign
  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('automated_campaigns')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete campaign: ${error.message}`);
    }
  });

  // Toggle campaign active status
  const toggleCampaign = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('automated_campaigns')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    }
  });

  // Run campaign now
  const runCampaign = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('send-followup-campaign', {
        body: { campaignId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-emails'] });
      toast.success(`Campaign sent! ${data.emailsSent} emails sent.`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to run campaign: ${error.message}`);
    }
  });

  // Send to manual emails
  const sendToManualEmails = useMutation({
    mutationFn: async ({ campaignId, emails }: { campaignId: string; emails: string[] }) => {
      const { data, error } = await supabase.functions.invoke('send-followup-campaign', {
        body: { campaignId, customEmails: emails }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-emails'] });
      toast.success(`Emails sent to ${data.emailsSent} recipients!`);
      setIsManualEmailDialogOpen(false);
      setManualEmails("");
      setSelectedCampaignForManual(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to send emails: ${error.message}`);
    }
  });

  const handleSendManualEmails = () => {
    if (!selectedCampaignForManual) return;
    
    // Parse emails (comma, newline, or space separated)
    const emails = manualEmails
      .split(/[,\n\s]+/)
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));
    
    if (emails.length === 0) {
      toast.error('Please enter valid email addresses');
      return;
    }
    
    sendToManualEmails.mutate({ campaignId: selectedCampaignForManual, emails });
  };

  const handleImportList = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          // Parse CSV or text file for emails
          const emails = text
            .split(/[,\n\r]+/)
            .map(line => line.trim())
            .filter(e => e && e.includes('@'));
          setManualEmails(emails.join('\n'));
          toast.success(`Imported ${emails.length} email addresses`);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Open preview before sending
  const handleOpenPreview = async (campaign: Campaign, mode: 'auto' | 'manual', emails?: string[]) => {
    setPreviewCampaign(campaign);
    setPreviewMode(mode);
    
    if (mode === 'manual' && emails) {
      setPreviewEmails(emails);
    } else {
      // For auto mode, we'd fetch the list of qualifying customers
      // For now just show a placeholder
      setPreviewEmails(['(All qualifying customers based on campaign rules)']);
    }
    
    setIsPreviewDialogOpen(true);
  };

  const handleConfirmSend = () => {
    if (!previewCampaign) return;
    
    if (previewMode === 'manual' && selectedCampaignForManual) {
      const emails = manualEmails
        .split(/[,\n\s]+/)
        .map(e => e.trim())
        .filter(e => e && e.includes('@'));
      sendToManualEmails.mutate({ campaignId: selectedCampaignForManual, emails });
    } else {
      runCampaign.mutate(previewCampaign.id);
    }
    
    setIsPreviewDialogOpen(false);
    setPreviewCampaign(null);
  };

  // Format email body for preview (convert markdown-like syntax)
  const formatEmailBody = (body: string) => {
    return body
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/{{customer_name}}/g, '<span class="text-primary">[Customer Name]</span>')
      .replace(/{{company_name}}/g, '<span class="text-primary">[Company Name]</span>')
      .replace(/\n/g, '<br/>');
  };

  const getCampaignStats = (campaignId: string) => {
    const emails = emailStats.filter(e => e.campaign_id === campaignId);
    return {
      sent: emails.length,
      opened: emails.filter(e => e.status === 'opened').length,
      clicked: emails.filter(e => e.status === 'clicked').length
    };
  };

  const campaignTypes: Record<string, { label: string; color: string }> = {
    inactive_customer: { label: 'Inactive Customer', color: 'bg-warning/20 text-warning' },
    post_service: { label: 'Post Service', color: 'bg-success/20 text-success' },
    birthday: { label: 'Birthday', color: 'bg-pink-500/20 text-pink-500' },
    seasonal_promo: { label: 'Seasonal Promo', color: 'bg-purple-500/20 text-purple-500' },
    win_back: { label: 'Win Back', color: 'bg-orange-500/20 text-orange-500' },
    custom: { label: 'Custom', color: 'bg-info/20 text-info' }
  };

  // Create SMS campaign
  const createSmsCampaign = useMutation({
    mutationFn: async (data: typeof smsFormData) => {
      const { error } = await supabase.from('automated_campaigns').insert([{
        name: data.name,
        type: data.type,
        subject: data.subject,
        body: data.body,
        days_inactive: data.days_inactive
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('SMS Campaign created!');
      setIsSmsDialogOpen(false);
      setSmsFormData({ 
        name: '', 
        type: 'inactive_customer', 
        subject: 'SMS Campaign',
        body: 'Hi {first_name}! We miss you at {company_name}. It\'s been a while since your last clean. Book now and get 15% off! Reply STOP to opt out.',
        days_inactive: 30 
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create campaign: ${error.message}`);
    }
  });

  // Test SMS campaign (preview without sending)
  const testSmsCampaign = useMutation({
    mutationFn: async ({ campaignId, daysInactive }: { campaignId?: string; daysInactive: number }) => {
      const { data, error } = await supabase.functions.invoke('run-inactive-campaign', {
        body: { 
          organizationId: orgId, 
          campaignId, 
          daysInactive,
          testMode: true 
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSmsTestResult({
        inactiveCount: data.inactiveCount,
        toContactCount: data.toContactCount
      });
      toast.success(`Found ${data.toContactCount} customers to contact`);
    },
    onError: (error: Error) => {
      toast.error(`Test failed: ${error.message}`);
    }
  });

  // Run SMS campaign
  const runSmsCampaign = useMutation({
    mutationFn: async ({ campaignId, daysInactive }: { campaignId?: string; daysInactive: number }) => {
      const { data, error } = await supabase.functions.invoke('run-inactive-campaign', {
        body: { 
          organizationId: orgId, 
          campaignId, 
          daysInactive,
          testMode: false 
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(`SMS Campaign sent! ${data.sentCount} messages sent, ${data.failedCount} failed.`);
      setSmsTestResult(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to run campaign: ${error.message}`);
    }
  });

  if (isLoading) {
    return (
      <AdminLayout title="Email Campaigns" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Campaigns"
      subtitle="Automated SMS & Email re-engagement"
      actions={
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Campaign Name</Label>
                <Input
                  placeholder="We Miss You Campaign"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={value => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inactive_customer">Inactive Customer</SelectItem>
                    <SelectItem value="post_service">Post Service</SelectItem>
                    <SelectItem value="birthday">Birthday</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === 'inactive_customer' && (
                <div>
                  <Label>Days Inactive</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.days_inactive}
                    onChange={e => setFormData({ ...formData, days_inactive: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Send to customers who haven't booked in this many days
                  </p>
                </div>
              )}
              <div>
                <Label>Email Subject</Label>
                <Input
                  placeholder="We miss you, {{customer_name}}!"
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use {`{{customer_name}}`} and {`{{company_name}}`} as placeholders
                </p>
              </div>
              <div>
                <Label>Email Body</Label>
                <Textarea
                  rows={6}
                  placeholder="Hi {{customer_name}}..."
                  value={formData.body}
                  onChange={e => setFormData({ ...formData, body: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use **text** for bold formatting
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => createCampaign.mutate(formData)}
                disabled={!formData.name || !formData.subject || !formData.body || createCampaign.isPending}
              >
                {createCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Create Campaign
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Tabs for Email vs SMS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="email" className="gap-2">
            <Mail className="w-4 h-4" />
            Email Campaigns
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            SMS Campaigns
          </TabsTrigger>
        </TabsList>

        {/* SMS Tab Content */}
        <TabsContent value="sms" className="space-y-6">
          {/* SMS Quick Action Card */}
          <Card className="p-6 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-lg">Win Back Inactive Customers</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Send personalized SMS to customers who haven't booked recently. Great for seasonal promos and re-engagement!
                </p>
                
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <Label>Days Inactive</Label>
                    <Select
                      value={String(smsFormData.days_inactive)}
                      onValueChange={value => setSmsFormData({ ...smsFormData, days_inactive: parseInt(value) })}
                    >
                      <SelectTrigger className="w-32">
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
                  
                  <Button
                    variant="outline"
                    onClick={() => testSmsCampaign.mutate({ daysInactive: smsFormData.days_inactive })}
                    disabled={testSmsCampaign.isPending}
                    className="gap-2"
                  >
                    {testSmsCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Users className="w-4 h-4" />
                    Preview List
                  </Button>
                  
                  <Button
                    onClick={() => runSmsCampaign.mutate({ daysInactive: smsFormData.days_inactive })}
                    disabled={runSmsCampaign.isPending}
                    className="gap-2"
                  >
                    {runSmsCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Send className="w-4 h-4" />
                    Send SMS Campaign
                  </Button>
                </div>

                {smsTestResult && (
                  <div className="mt-4 p-3 bg-background rounded-lg border">
                    <p className="text-sm">
                      <span className="font-medium">{smsTestResult.inactiveCount}</span> total inactive customers found.{' '}
                      <span className="font-medium text-primary">{smsTestResult.toContactCount}</span> will receive SMS.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* SMS Message Template */}
          <Card className="p-6">
            <h4 className="font-semibold mb-4">Message Template</h4>
            <Textarea
              rows={4}
              value={smsFormData.body}
              onChange={e => setSmsFormData({ ...smsFormData, body: e.target.value })}
              placeholder="Hi {first_name}! ..."
            />
            <p className="text-xs text-muted-foreground mt-2">
              Available placeholders: {'{first_name}'}, {'{last_name}'}, {'{company_name}'}
            </p>
          </Card>

          {/* Create SMS Campaign Dialog */}
          <Dialog open={isSmsDialogOpen} onOpenChange={setIsSmsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" />
                Save as Campaign Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create SMS Campaign Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Campaign Name</Label>
                  <Input
                    placeholder="Spring Cleaning Promo"
                    value={smsFormData.name}
                    onChange={e => setSmsFormData({ ...smsFormData, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select
                    value={smsFormData.type}
                    onValueChange={value => setSmsFormData({ ...smsFormData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inactive_customer">Inactive Customer</SelectItem>
                      <SelectItem value="seasonal_promo">Seasonal Promo</SelectItem>
                      <SelectItem value="win_back">Win Back</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Days Inactive</Label>
                  <Input
                    type="number"
                    min={1}
                    value={smsFormData.days_inactive}
                    onChange={e => setSmsFormData({ ...smsFormData, days_inactive: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea
                    rows={4}
                    value={smsFormData.body}
                    onChange={e => setSmsFormData({ ...smsFormData, body: e.target.value })}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createSmsCampaign.mutate(smsFormData)}
                  disabled={!smsFormData.name || !smsFormData.body || createSmsCampaign.isPending}
                >
                  {createSmsCampaign.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Save Campaign Template
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Saved SMS Campaign Templates */}
          <div className="space-y-4">
            <h4 className="font-semibold">Saved Campaign Templates</h4>
            {campaigns.filter(c => c.type === 'inactive_customer' || c.type === 'seasonal_promo' || c.type === 'win_back').length === 0 ? (
              <Card className="p-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No SMS campaign templates saved yet</p>
              </Card>
            ) : (
              campaigns
                .filter(c => c.type === 'inactive_customer' || c.type === 'seasonal_promo' || c.type === 'win_back')
                .map(campaign => {
                  const typeInfo = campaignTypes[campaign.type] || campaignTypes.custom;
                  return (
                    <Card key={campaign.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5 text-primary" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{campaign.name}</span>
                              <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {campaign.days_inactive} days inactive • Last run: {campaign.last_run_at ? format(new Date(campaign.last_run_at), 'MMM d') : 'Never'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runSmsCampaign.mutate({ 
                              campaignId: campaign.id, 
                              daysInactive: campaign.days_inactive || 30 
                            })}
                            disabled={runSmsCampaign.isPending}
                          >
                            <Send className="w-4 h-4 mr-1" />
                            Send
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deleteCampaign.mutate(campaign.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })
            )}
          </div>
        </TabsContent>

        {/* Email Tab Content */}
        <TabsContent value="email">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Campaigns</p>
                  <p className="text-2xl font-bold">{campaigns.length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold">{campaigns.filter(c => c.is_active).length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-info/10">
                  <Send className="h-5 w-5 text-info" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Emails Sent</p>
                  <p className="text-2xl font-bold">{emailStats.length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <MailOpen className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open Rate</p>
                  <p className="text-2xl font-bold">
                    {emailStats.length > 0 
                      ? `${Math.round((emailStats.filter(e => e.status === 'opened').length / emailStats.length) * 100)}%`
                      : '0%'}
                  </p>
                </div>
              </div>
            </Card>
          </div>

      {/* Manual Email Dialog */}
      <Dialog open={isManualEmailDialogOpen} onOpenChange={setIsManualEmailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send to Custom Email List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email Addresses</Label>
              <Textarea
                rows={6}
                placeholder="Enter emails (one per line, or comma-separated)&#10;example@email.com&#10;another@email.com"
                value={manualEmails}
                onChange={e => setManualEmails(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate emails with commas, spaces, or new lines
              </p>
            </div>
            <Button variant="outline" onClick={handleImportList} className="w-full gap-2">
              <Upload className="w-4 h-4" />
              Import from CSV/TXT File
            </Button>
            <Button
              className="w-full gap-2"
              onClick={() => {
                const campaign = campaigns.find(c => c.id === selectedCampaignForManual);
                if (campaign) {
                  const emails = manualEmails
                    .split(/[,\n\s]+/)
                    .map(e => e.trim())
                    .filter(e => e && e.includes('@'));
                  if (emails.length > 0) {
                    handleOpenPreview(campaign, 'manual', emails);
                    setIsManualEmailDialogOpen(false);
                  } else {
                    toast.error('Please enter valid email addresses');
                  }
                }
              }}
              disabled={!manualEmails.trim()}
            >
              <Eye className="w-4 h-4" />
              Preview Email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Email Preview
            </DialogTitle>
          </DialogHeader>
          
          {previewCampaign && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Recipients */}
              <div className="bg-secondary/30 rounded-lg p-4">
                <Label className="text-xs text-muted-foreground">Recipients</Label>
                <div className="mt-1">
                  {previewMode === 'manual' ? (
                    <div className="flex flex-wrap gap-1">
                      {previewEmails.slice(0, 5).map((email, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {email}
                        </Badge>
                      ))}
                      {previewEmails.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{previewEmails.length - 5} more
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      All customers matching campaign criteria ({previewCampaign.type === 'inactive_customer' 
                        ? `inactive for ${previewCampaign.days_inactive}+ days` 
                        : previewCampaign.type})
                    </p>
                  )}
                </div>
              </div>

              {/* Email Preview */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-secondary/50 px-4 py-3 border-b">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Subject:</span>
                    <span className="font-medium">{previewCampaign.subject}</span>
                  </div>
                </div>
                <ScrollArea className="h-[300px]">
                  <div className="p-6">
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: formatEmailBody(previewCampaign.body) }}
                    />
                  </div>
                </ScrollArea>
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setIsPreviewDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 gap-2"
                  onClick={handleConfirmSend}
                  disabled={runCampaign.isPending || sendToManualEmails.isPending}
                >
                  {(runCampaign.isPending || sendToManualEmails.isPending) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  <Send className="w-4 h-4" />
                  Send {previewMode === 'manual' ? `to ${previewEmails.length} recipients` : 'Campaign'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Campaigns List */}
      <div className="space-y-4">
        {campaigns.length === 0 ? (
          <Card className="p-8 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground mb-4">Create your first automated email campaign</p>
            <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Campaign
            </Button>
          </Card>
        ) : (
          campaigns.map(campaign => {
            const stats = getCampaignStats(campaign.id);
            const typeInfo = campaignTypes[campaign.type] || campaignTypes.custom;
            
            return (
              <Card key={campaign.id} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{campaign.name}</h3>
                      <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                      {campaign.is_active && (
                        <Badge variant="outline" className="text-success border-success">
                          Active
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-4">
                      Subject: {campaign.subject}
                    </p>
                    
                    <div className="flex items-center gap-6 text-sm">
                      {campaign.type === 'inactive_customer' && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>After {campaign.days_inactive} days inactive</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Send className="w-4 h-4" />
                        <span>{stats.sent} sent</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MailOpen className="w-4 h-4" />
                        <span>{stats.opened} opened</span>
                      </div>
                      {campaign.last_run_at && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>Last run: {format(new Date(campaign.last_run_at), 'MMM d, h:mm a')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`active-${campaign.id}`} className="text-sm">
                        Active
                      </Label>
                      <Switch
                        id={`active-${campaign.id}`}
                        checked={campaign.is_active}
                        onCheckedChange={(checked) => toggleCampaign.mutate({ id: campaign.id, is_active: checked })}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setSelectedCampaignForManual(campaign.id);
                        setIsManualEmailDialogOpen(true);
                      }}
                    >
                      <UserPlus className="w-4 h-4" />
                      Manual
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleOpenPreview(campaign, 'auto')}
                      disabled={runCampaign.isPending}
                    >
                      <Eye className="w-4 h-4" />
                      Preview & Run
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteCampaign.mutate(campaign.id)}
                      disabled={deleteCampaign.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
