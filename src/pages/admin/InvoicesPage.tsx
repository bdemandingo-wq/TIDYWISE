import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
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
import { Plus, FileText, Send, Check, Trash2, Edit, Loader2, Mail } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { useCustomers, useServices } from '@/hooks/useBookings';
import { useTestMode } from '@/contexts/TestModeContext';

interface Quote {
  id: string;
  quote_number: number;
  customer_id: string | null;
  lead_id: string | null;
  service_id: string | null;
  address: string | null;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  valid_until: string | null;
  status: string;
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

export default function QuotesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isTestMode, maskName, maskEmail, maskAmount } = useTestMode();

  const { data: customers = [] } = useCustomers();
  const { data: services = [] } = useServices();

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          customer:customers(*),
          service:services(*)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Quote>) => {
      const { error } = await supabase.from('quotes').insert(data);
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

  const markAsSent = (quote: Quote) => {
    updateMutation.mutate({ id: quote.id, status: 'sent' });
  };

  const markAsAccepted = (quote: Quote) => {
    updateMutation.mutate({ id: quote.id, status: 'accepted' });
  };

  const sendInvoiceEmail = async (quote: Quote) => {
    if (!quote.customer?.email) {
      toast.error('No customer email found');
      return;
    }

    setSendingInvoice(quote.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-invoice', {
        body: {
          customerName: `${quote.customer.first_name} ${quote.customer.last_name}`,
          customerEmail: quote.customer.email,
          invoiceNumber: quote.quote_number,
          serviceName: quote.service?.name || 'Cleaning Service',
          amount: quote.total_amount,
          address: quote.address,
          validUntil: quote.valid_until ? format(new Date(quote.valid_until), 'MMM d, yyyy') : undefined,
          notes: quote.notes,
        },
      });

      if (error) throw error;

      toast.success(`Invoice sent to ${quote.customer.email}`);
      updateMutation.mutate({ id: quote.id, status: 'sent' });
    } catch (error: any) {
      console.error('Failed to send invoice:', error);
      toast.error(error.message || 'Failed to send invoice');
    } finally {
      setSendingInvoice(null);
    }
  };

  const stats = {
    total: quotes.length,
    pending: quotes.filter(q => q.status === 'draft' || q.status === 'sent').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    totalValue: quotes.filter(q => q.status === 'accepted').reduce((sum, q) => sum + q.total_amount, 0),
  };

  return (
    <AdminLayout
      title="Invoices"
      subtitle={`${quotes.length} total invoices`}
      actions={
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          New Invoice
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total Quotes</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Accepted</p>
            <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold">{isTestMode ? '$XXX.XX' : `$${stats.totalValue.toFixed(2)}`}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : quotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No quotes yet
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">#{quote.quote_number}</TableCell>
                    <TableCell>
                      {quote.customer ? (
                        <div>
                          <p>{maskName(`${quote.customer.first_name} ${quote.customer.last_name}`)}</p>
                          <p className="text-sm text-muted-foreground">{maskEmail(quote.customer.email)}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{quote.service?.name || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {maskAmount(quote.total_amount)}
                      {!isTestMode && quote.discount_percent > 0 && (
                        <span className="text-sm text-green-600 ml-1">(-{quote.discount_percent}%)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_CONFIG[quote.status]?.variant}>
                        {STATUS_CONFIG[quote.status]?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {quote.valid_until ? format(new Date(quote.valid_until), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {quote.customer?.email && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600"
                            onClick={() => sendInvoiceEmail(quote)}
                            disabled={sendingInvoice === quote.id}
                            title="Send invoice email"
                          >
                            {sendingInvoice === quote.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {quote.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => markAsSent(quote)}
                            title="Mark as sent"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        {quote.status === 'sent' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600"
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
                          onClick={() => {
                            setEditingQuote(quote);
                            setDialogOpen(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            if (confirm('Delete this quote?')) {
                              deleteMutation.mutate(quote.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <QuoteDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingQuote(null);
        }}
        quote={editingQuote}
        customers={customers}
        services={services}
        onSave={(data) => {
          if (editingQuote) {
            updateMutation.mutate({ id: editingQuote.id, ...data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />
    </AdminLayout>
  );
}

function QuoteDialog({
  open,
  onOpenChange,
  quote,
  customers,
  services,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote | null;
  customers: any[];
  services: any[];
  onSave: (data: Partial<Quote>) => void;
}) {
  const [formData, setFormData] = useState({
    customer_id: quote?.customer_id || '',
    service_id: quote?.service_id || '',
    address: quote?.address || '',
    subtotal: quote?.subtotal?.toString() || '',
    discount_percent: quote?.discount_percent?.toString() || '0',
    notes: quote?.notes || '',
    valid_until: quote?.valid_until || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
  });

  const subtotal = parseFloat(formData.subtotal) || 0;
  const discountPercent = parseFloat(formData.discount_percent) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const totalAmount = subtotal - discountAmount;

  const handleSubmit = () => {
    if (!formData.subtotal) return;
    onSave({
      customer_id: formData.customer_id || null,
      service_id: formData.service_id || null,
      address: formData.address || null,
      subtotal,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      notes: formData.notes || null,
      valid_until: formData.valid_until || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{quote ? 'Edit' : 'Create'} Quote</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Customer</Label>
            <Select value={formData.customer_id} onValueChange={(v) => setFormData({ ...formData, customer_id: v })}>
              <SelectTrigger>
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
            <Select value={formData.service_id} onValueChange={(v) => setFormData({ ...formData, service_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} - ${s.price}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Address</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Subtotal *</Label>
              <Input
                type="number"
                value={formData.subtotal}
                onChange={(e) => setFormData({ ...formData, subtotal: e.target.value })}
              />
            </div>
            <div>
              <Label>Discount %</Label>
              <Input
                type="number"
                value={formData.discount_percent}
                onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
              />
            </div>
          </div>
          <div className="bg-muted p-3 rounded-lg">
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount ({discountPercent}%):</span>
                <span>-${discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold mt-2 pt-2 border-t">
              <span>Total:</span>
              <span>${totalAmount.toFixed(2)}</span>
            </div>
          </div>
          <div>
            <Label>Valid Until</Label>
            <Input
              type="date"
              value={formData.valid_until}
              onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>{quote ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}