import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Mail, Phone, UserPlus, MoreHorizontal, Trash2, Edit, Download, Filter, TrendingDown, ArrowRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTestMode } from '@/contexts/TestModeContext';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  service_interest: string | null;
  message: string | null;
  notes: string | null;
  source: string;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500' },
  contacted: { label: 'Contacted', color: 'bg-yellow-500' },
  qualified: { label: 'Qualified', color: 'bg-purple-500' },
  converted: { label: 'Converted', color: 'bg-green-500' },
  lost: { label: 'Lost', color: 'bg-gray-500' },
};

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'other', label: 'Other' },
];

export default function LeadsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showFunnel, setShowFunnel] = useState(false);
  const queryClient = useQueryClient();
  const { isTestMode, maskName, maskEmail, maskPhone } = useTestMode();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone?: string; address?: string; city?: string; state?: string; zip_code?: string; service_interest?: string; message?: string; notes?: string; source: string; status: string }) => {
      const { error } = await supabase.from('leads').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead created');
      setDialogOpen(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Lead> & { id: string }) => {
      const { error } = await supabase.from('leads').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead updated');
      setDialogOpen(false);
      setEditingLead(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const convertToCustomer = async (lead: Lead) => {
    const nameParts = lead.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const { error: customerError } = await supabase.from('customers').insert({
      first_name: firstName,
      last_name: lastName,
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zip_code: lead.zip_code,
    });

    if (customerError) {
      toast.error('Failed to create customer');
      return;
    }

    await supabase.from('leads').update({ status: 'converted' }).eq('id', lead.id);
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    toast.success('Lead converted to customer');
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter;
      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [leads, searchTerm, statusFilter, sourceFilter]);

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    qualified: leads.filter(l => l.status === 'qualified').length,
    converted: leads.filter(l => l.status === 'converted').length,
    lost: leads.filter(l => l.status === 'lost').length,
  };

  const funnelData = useMemo(() => {
    const stages = ['new', 'contacted', 'qualified', 'converted'];
    const counts = stages.map(s => leads.filter(l => l.status === s).length);
    const maxCount = Math.max(...counts, 1);
    
    return stages.map((stage, i) => ({
      stage,
      label: STATUS_CONFIG[stage].label,
      count: counts[i],
      percentage: maxCount > 0 ? Math.round((counts[i] / maxCount) * 100) : 0,
      conversionRate: i > 0 && counts[i - 1] > 0 
        ? Math.round((counts[i] / counts[i - 1]) * 100) 
        : 100,
    }));
  }, [leads]);

  const sourceBreakdown = useMemo(() => {
    const sources: Record<string, { total: number; converted: number }> = {};
    leads.forEach(lead => {
      if (!sources[lead.source]) {
        sources[lead.source] = { total: 0, converted: 0 };
      }
      sources[lead.source].total++;
      if (lead.status === 'converted') {
        sources[lead.source].converted++;
      }
    });
    return Object.entries(sources).map(([source, data]) => ({
      source,
      ...data,
      rate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [leads]);

  const exportLeadsExcel = () => {
    const headers = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Service Interest', 'Source', 'Status', 'Notes', 'Message', 'Created'];
    const rows = filteredLeads.map(lead => [
      lead.name,
      lead.email,
      lead.phone || '',
      lead.address || '',
      lead.city || '',
      lead.state || '',
      lead.zip_code || '',
      lead.service_interest || '',
      lead.source,
      lead.status,
      lead.notes || '',
      lead.message || '',
      format(new Date(lead.created_at), 'yyyy-MM-dd'),
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Leads exported successfully');
  };

  return (
    <AdminLayout
      title="Leads"
      subtitle={`${leads.length} total leads`}
      actions={
        <div className="flex gap-2">
          <Button 
            variant={showFunnel ? "default" : "outline"} 
            className="gap-2" 
            onClick={() => setShowFunnel(!showFunnel)}
          >
            <TrendingDown className="w-4 h-4" />
            Funnel Report
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportLeadsExcel}>
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Lead
          </Button>
        </div>
      }
    >
      {/* Lead Funnel Report */}
      {showFunnel && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Conversion Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {funnelData.map((stage, i) => (
                  <div key={stage.stage} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{stage.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {stage.count} leads
                        {i > 0 && (
                          <span className="ml-2 text-xs">
                            ({stage.conversionRate}% from {funnelData[i-1].label})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-8 bg-muted rounded-md overflow-hidden">
                      <div 
                        className={`h-full ${STATUS_CONFIG[stage.stage].color} transition-all duration-500`}
                        style={{ width: `${stage.percentage}%` }}
                      />
                    </div>
                    {i < funnelData.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Overall Conversion Rate</span>
                  <span className="text-lg font-bold text-green-600">
                    {stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-muted-foreground">Lost Leads</span>
                  <span className="text-sm text-destructive">{stats.lost}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leads by Source</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sourceBreakdown.map((item) => (
                  <div key={item.source} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="font-medium capitalize">{item.source}</span>
                      <div className="text-sm text-muted-foreground">
                        {item.total} leads · {item.converted} converted
                      </div>
                    </div>
                    <Badge variant={item.rate >= 50 ? "default" : item.rate >= 25 ? "secondary" : "outline"}>
                      {item.rate}% rate
                    </Badge>
                  </div>
                ))}
                {sourceBreakdown.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No lead data yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">New</p>
            <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Contacted</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.contacted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Qualified</p>
            <p className="text-2xl font-bold text-purple-600">{stats.qualified}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Converted</p>
            <p className="text-2xl font-bold text-green-600">{stats.converted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Lost</p>
            <p className="text-2xl font-bold text-muted-foreground">{stats.lost}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4">
        <Input
          placeholder="Search leads..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(statusFilter !== 'all' || sourceFilter !== 'all') && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => { setStatusFilter('all'); setSourceFilter('all'); }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No leads found
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{maskName(lead.name)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="w-3 h-3" /> {maskEmail(lead.email)}
                        </div>
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" /> {maskPhone(lead.phone)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{lead.service_interest || '-'}</TableCell>
                    <TableCell className="capitalize">{lead.source}</TableCell>
                    <TableCell>
                      <Select
                        value={lead.status}
                        onValueChange={(status) => updateMutation.mutate({ id: lead.id, status })}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <Badge className={STATUS_CONFIG[lead.status]?.color}>
                            {STATUS_CONFIG[lead.status]?.label}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {lead.notes ? (
                        <span className="text-sm text-muted-foreground line-clamp-2" title={lead.notes}>
                          {lead.notes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm italic">No notes</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(lead.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => {
                              setEditingLead(lead);
                              setDialogOpen(true);
                            }}
                          >
                            <Edit className="w-4 h-4" /> Edit
                          </DropdownMenuItem>
                          {lead.status !== 'converted' && (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => convertToCustomer(lead)}
                            >
                              <UserPlus className="w-4 h-4" /> Convert to Customer
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="gap-2 text-destructive"
                            onClick={() => {
                              if (confirm('Delete this lead?')) {
                                deleteMutation.mutate(lead.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <LeadDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingLead(null);
        }}
        lead={editingLead}
        onSave={(data) => {
          if (editingLead) {
            updateMutation.mutate({ id: editingLead.id, ...data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />
    </AdminLayout>
  );
}

function LeadDialog({
  open,
  onOpenChange,
  lead,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onSave: (data: { name: string; email: string; phone?: string; address?: string; city?: string; state?: string; zip_code?: string; service_interest?: string; message?: string; notes?: string; source: string; status: string }) => void;
}) {
  const [formData, setFormData] = useState({
    name: lead?.name || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
    address: lead?.address || '',
    city: lead?.city || '',
    state: lead?.state || '',
    zip_code: lead?.zip_code || '',
    service_interest: lead?.service_interest || '',
    message: lead?.message || '',
    notes: lead?.notes || '',
    source: lead?.source || 'website',
    status: lead?.status || 'new',
  });

  const handleSubmit = () => {
    if (!formData.name || !formData.email) return;
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? 'Edit' : 'Add'} Lead</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
          <div>
            <Label>State</Label>
            <Input
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
          </div>
          <div>
            <Label>Service Interest</Label>
            <Input
              value={formData.service_interest}
              onChange={(e) => setFormData({ ...formData, service_interest: e.target.value })}
            />
          </div>
          <div>
            <Label>Source</Label>
            <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Message</Label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              rows={2}
              placeholder="Initial inquiry message..."
            />
          </div>
          <div className="col-span-2">
            <Label>Call Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="How did the call go? Satisfaction, review status, recurring interest..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>{lead ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}