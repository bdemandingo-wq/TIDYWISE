import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { Plus, FileText, Send, Check, Trash2, Edit, Loader2, Phone, DollarSign, Star } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { handleSmsError } from '@/lib/smsErrorHandler';
import { format, addDays } from 'date-fns';
import { useCustomers, useServices } from '@/hooks/useBookings';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Quote {
  id: string;
  quote_number: number;
  customer_id: string | null;
  lead_id: string | null;
  service_id: string | null;
  address: string | null;
  subtotal: number;
  discount_percent: number | null;
  discount_amount: number | null;
  total_amount: number;
  notes: string | null;
  valid_until: string | null;
  status: string | null;
  created_at: string;
  customer?: { first_name: string; last_name: string; email: string };
  service?: { name: string };
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  sent: { label: 'Sent', variant: 'default' },
  accepted: { label: 'Accepted', variant: 'default' },
  declined: { label: 'Declined', variant: 'destructive' },
  expired: { label: 'Expired', variant: 'outline' },
};

export function QuotesTabContent() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isTestMode, maskName, maskEmail, maskAmount } = useTestMode();
  const { organization } = useOrganization();

  const { data: customers = [] } = useCustomers();
  const { data: services = [] } = useServices();

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers(*),
          service:services(*)
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
    enabled: !!organization?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Quote>) => {
      if (!organization?.id) throw new Error('No organization found');
      const { error } = await supabase.from('quotes').insert({ ...data, organization_id: organization.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote created');
      setDialogOpen(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Quote> & { id: string }) => {
      const { error } = await supabase.from('quotes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote updated');
      setDialogOpen(false);
      setEditingQuote(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const markAsAccepted = (quote: Quote) => {
    updateMutation.mutate({ id: quote.id, status: 'accepted' });
  };

  const sendQuoteReminderSms = async (quote: Quote) => {
    // Get customer phone and organization_id from the full customer object
    const { data: customer } = await supabase
      .from('customers')
      .select('phone, first_name, last_name, organization_id')
      .eq('id', quote.customer_id)
      .single();

    if (!customer?.phone) {
      toast.error('No customer phone number found');
      return;
    }

    if (!customer?.organization_id) {
      toast.error('Organization context missing');
      return;
    }

    setSendingReminder(quote.id);
    try {
      const validUntil = quote.valid_until ? format(new Date(quote.valid_until), 'MMM d, yyyy') : 'soon';
      const message = `Hi ${customer.first_name}! Just a reminder - your quote #${quote.quote_number} for $${quote.total_amount.toFixed(2)} expires on ${validUntil}. Reply YES to confirm or call us with any questions!`;

      const response = await supabase.functions.invoke('send-openphone-sms', {
        body: {
          to: customer.phone,
          message,
          organizationId: customer.organization_id,
        },
      });

      // Handle SMS-specific errors
      if (handleSmsError(response)) {
        return;
      }

      toast.success(`Reminder SMS sent to ${customer.first_name}`);
    } catch (error: any) {
      console.error('Failed to send reminder:', error);
      toast.error(error.message || 'Failed to send reminder SMS');
    } finally {
      setSendingReminder(null);
    }
  };

  const stats = {
    total: quotes.length,
    pending: quotes.filter(q => q.status === 'draft' || q.status === 'sent').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    totalValue: quotes.reduce((sum, q) => sum + (q.total_amount || 0), 0),
  };

  const [formData, setFormData] = useState({
    customer_id: '',
    service_id: '',
    address: '',
    subtotal: 0,
    discount_percent: 0,
    discount_amount: 0,
    total_amount: 0,
    notes: '',
    valid_until: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
  });

  const handleOpenDialog = (quote?: Quote) => {
    if (quote) {
      setEditingQuote(quote);
      setFormData({
        customer_id: quote.customer_id || '',
        service_id: quote.service_id || '',
        address: quote.address || '',
        subtotal: quote.subtotal || 0,
        discount_percent: quote.discount_percent || 0,
        discount_amount: quote.discount_amount || 0,
        total_amount: quote.total_amount || 0,
        notes: quote.notes || '',
        valid_until: quote.valid_until || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      });
    } else {
      setEditingQuote(null);
      setFormData({
        customer_id: '',
        service_id: '',
        address: '',
        subtotal: 0,
        discount_percent: 0,
        discount_amount: 0,
        total_amount: 0,
        notes: '',
        valid_until: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      ...formData,
      status: 'draft',
    };

    if (editingQuote) {
      updateMutation.mutate({ id: editingQuote.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-card to-secondary/30 border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Total Quotes</span>
            </div>
            <p className="text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-amber-50/30 border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-100 rounded-xl">
                <Send className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Pending</span>
            </div>
            <p className="text-3xl font-bold">{stats.pending}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-emerald-50/30 border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-100 rounded-xl">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Accepted</span>
            </div>
            <p className="text-3xl font-bold">{stats.accepted}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-blue-50/30 border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-xl">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Total Value</span>
            </div>
            <p className="text-3xl font-bold">${isTestMode ? '0.00' : stats.totalValue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" />
          Quotes
        </h3>
        <Button className="gap-2" onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4" />
          New Quote
        </Button>
      </div>

      {/* Quotes Table */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-8">
            <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No quotes yet</h3>
            <p className="text-muted-foreground mb-4">Create your first quote to send to clients</p>
            <Button className="gap-2" onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4" />
              Create Quote
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="font-semibold">Quote #</TableHead>
                <TableHead className="font-semibold">Customer</TableHead>
                <TableHead className="font-semibold">Service</TableHead>
                <TableHead className="font-semibold">Amount</TableHead>
                <TableHead className="font-semibold">Valid Until</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => {
                const statusInfo = STATUS_CONFIG[quote.status || 'draft'] || STATUS_CONFIG.draft;
                return (
                  <TableRow key={quote.id} className="hover:bg-secondary/10">
                    <TableCell className="font-mono font-bold text-primary">
                      #{quote.quote_number}
                    </TableCell>
                    <TableCell>
                      {quote.customer ? (
                        <div>
                          <p className="font-medium">
                            {maskName(`${quote.customer.first_name} ${quote.customer.last_name}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {maskEmail(quote.customer.email)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">No customer</span>
                      )}
                    </TableCell>
                    <TableCell>{quote.service?.name || '-'}</TableCell>
                    <TableCell className="font-semibold">
                      ${(isTestMode ? 0 : quote.total_amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {quote.valid_until 
                        ? format(new Date(quote.valid_until), 'MMM d, yyyy')
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant} className="capitalize">
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => sendQuoteReminderSms(quote)}
                          disabled={sendingReminder === quote.id || !quote.customer_id}
                          title="Send reminder SMS"
                        >
                          {sendingReminder === quote.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Phone className="w-4 h-4" />
                          )}
                        </Button>
                        {quote.status !== 'accepted' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-600"
                            onClick={() => markAsAccepted(quote)}
                            title="Mark as accepted"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenDialog(quote)}
                          title="Edit quote"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteMutation.mutate(quote.id)}
                          title="Delete quote"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create/Edit Quote Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingQuote ? 'Edit Quote' : 'Create New Quote'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, customer_id: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Service</Label>
              <Select
                value={formData.service_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, service_id: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Subtotal ($)</Label>
                <Input
                  type="number"
                  value={formData.subtotal}
                  onChange={(e) => {
                    const subtotal = parseFloat(e.target.value) || 0;
                    const discountAmount = formData.discount_percent > 0 
                      ? (subtotal * formData.discount_percent) / 100 
                      : formData.discount_amount;
                    setFormData(prev => ({
                      ...prev,
                      subtotal,
                      discount_amount: discountAmount,
                      total_amount: Math.max(0, subtotal - discountAmount),
                    }));
                  }}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Discount (%)</Label>
                <Input
                  type="number"
                  value={formData.discount_percent}
                  onChange={(e) => {
                    const discountPercent = parseFloat(e.target.value) || 0;
                    const discountAmount = (formData.subtotal * discountPercent) / 100;
                    setFormData(prev => ({
                      ...prev,
                      discount_percent: discountPercent,
                      discount_amount: discountAmount,
                      total_amount: Math.max(0, formData.subtotal - discountAmount),
                    }));
                  }}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Total Amount ($)</Label>
                <Input
                  type="number"
                  value={formData.total_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, total_amount: parseFloat(e.target.value) || 0 }))}
                  className="mt-1.5 font-semibold"
                />
              </div>
              <div>
                <Label>Valid Until</Label>
                <Input
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) => setFormData(prev => ({ ...prev, valid_until: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingQuote ? 'Update Quote' : 'Create Quote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
