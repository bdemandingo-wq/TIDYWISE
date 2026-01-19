import { useState, useEffect } from 'react';
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
import { 
  Plus, FileText, Send, Trash2, Edit, Loader2, Eye, Copy, X, 
  DollarSign, Clock, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { InvoiceViewDialog } from '@/components/admin/InvoiceViewDialog';
import { InvoiceFormDialog } from '@/components/admin/InvoiceFormDialog';

interface Invoice {
  id: string;
  invoice_number: number;
  organization_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  discount_percent: number;
  discount_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  stripe_invoice_id: string | null;
  stripe_invoice_url: string | null;
  due_date: string | null;
  paid_at: string | null;
  sent_at: string | null;
  notes: string | null;
  address: string | null;
  created_at: string;
  customer?: { first_name: string; last_name: string; email: string; phone: string | null };
  lead?: { name: string; email: string; phone: string | null };
  invoice_items?: InvoiceItem[];
}

interface InvoiceItem {
  id: string;
  invoice_id: string;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
  service?: { name: string };
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof FileText }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: FileText },
  sent: { label: 'Sent', variant: 'default', icon: Clock },
  paid: { label: 'Paid', variant: 'default', icon: CheckCircle2 },
  overdue: { label: 'Overdue', variant: 'destructive', icon: AlertCircle },
  cancelled: { label: 'Cancelled', variant: 'outline', icon: X },
};

export default function InvoicesPage() {
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isTestMode, maskName, maskEmail, maskAmount } = useTestMode();
  const { organization } = useOrganization();

  // Fetch invoices with items
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customer:customers(first_name, last_name, email, phone),
          lead:leads(name, email, phone),
          invoice_items(*, service:services(name))
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!organization?.id,
  });

  // Fetch customers for the form
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', organization.id)
        .in('customer_status', ['active', 'new'])
        .order('first_name');
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Fetch leads for the form
  const { data: leads = [] } = useQuery({
    queryKey: ['leads', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organization.id)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Fetch services for line items
  const { data: services = [] } = useQuery({
    queryKey: ['services', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Fetch tax settings
  const { data: pricingSettings } = useQuery({
    queryKey: ['pricing-settings', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await supabase
        .from('organization_pricing_settings')
        .select('sales_tax_percent')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const defaultTaxPercent = pricingSettings?.sales_tax_percent ?? 0;

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice cancelled');
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Send invoice
  const sendInvoice = async (invoice: Invoice) => {
    const customerEmail = invoice.customer?.email || invoice.lead?.email;
    const customerName = invoice.customer 
      ? `${invoice.customer.first_name} ${invoice.customer.last_name}`
      : invoice.lead?.name;
    const customerPhone = invoice.customer?.phone || invoice.lead?.phone;

    if (!customerEmail && !customerPhone) {
      toast.error('No contact information found for this customer');
      return;
    }

    setSendingInvoice(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-invoice', {
        body: {
          invoiceId: invoice.id,
          organizationId: organization?.id,
          customerEmail,
          customerName,
          customerPhone,
          items: invoice.invoice_items?.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unit_price,
          })) || [],
          totalAmount: invoice.total_amount,
          taxAmount: invoice.tax_amount,
          dueDate: invoice.due_date,
          notes: invoice.notes,
        },
      });

      if (error) throw error;

      toast.success(`Invoice sent to ${customerEmail || customerPhone}`);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (error: any) {
      console.error('Failed to send invoice:', error);
      toast.error(error.message || 'Failed to send invoice');
    } finally {
      setSendingInvoice(null);
    }
  };

  // Duplicate invoice
  const duplicateInvoice = (invoice: Invoice) => {
    setEditingInvoice({
      ...invoice,
      id: '', // Clear ID to create new
      invoice_number: 0,
      status: 'draft',
      stripe_invoice_id: null,
      stripe_invoice_url: null,
      sent_at: null,
      paid_at: null,
      due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    });
    setFormDialogOpen(true);
  };

  const stats = {
    total: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    totalPaid: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total_amount, 0),
    totalOutstanding: invoices.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((sum, i) => sum + i.total_amount, 0),
  };

  const getCustomerDisplay = (invoice: Invoice) => {
    if (invoice.customer) {
      return {
        name: `${invoice.customer.first_name} ${invoice.customer.last_name}`,
        email: invoice.customer.email,
      };
    }
    if (invoice.lead) {
      return {
        name: invoice.lead.name,
        email: invoice.lead.email,
      };
    }
    return { name: '-', email: '' };
  };

  return (
    <AdminLayout
      title="Invoices"
      subtitle={`${invoices.length} total invoices`}
      actions={
        <Button className="gap-2" onClick={() => {
          setEditingInvoice(null);
          setFormDialogOpen(true);
        }}>
          <Plus className="w-4 h-4" />
          New Invoice
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-muted-foreground">Draft</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.draft}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Sent</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.sent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Paid</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{stats.paid}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Total Paid</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {isTestMode ? '$XXX' : `$${stats.totalPaid.toFixed(2)}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Outstanding</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-600">
              {isTestMode ? '$XXX' : `$${stats.totalOutstanding.toFixed(2)}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading invoices...
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No invoices yet. Create your first invoice to get started.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => {
                  const customer = getCustomerDisplay(invoice);
                  const statusConfig = STATUS_CONFIG[invoice.status];
                  const StatusIcon = statusConfig.icon;
                  
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        INV-{String(invoice.invoice_number).padStart(4, '0')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{maskName(customer.name)}</p>
                          <p className="text-sm text-muted-foreground">{maskEmail(customer.email)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {maskAmount(invoice.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={statusConfig.variant}
                          className={`gap-1 ${invoice.status === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setViewingInvoice(invoice);
                              setViewDialogOpen(true);
                            }}
                            title="View invoice"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {invoice.status === 'draft' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-blue-600"
                                onClick={() => sendInvoice(invoice)}
                                disabled={sendingInvoice === invoice.id}
                                title="Send invoice"
                              >
                                {sendingInvoice === invoice.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditingInvoice(invoice);
                                  setFormDialogOpen(true);
                                }}
                                title="Edit invoice"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => duplicateInvoice(invoice)}
                            title="Duplicate invoice"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          {['draft', 'sent'].includes(invoice.status) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (confirm('Cancel this invoice?')) {
                                  cancelMutation.mutate(invoice.id);
                                }
                              }}
                              title="Cancel invoice"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                          {invoice.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (confirm('Delete this invoice permanently?')) {
                                  deleteMutation.mutate(invoice.id);
                                }
                              }}
                              title="Delete invoice"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invoice Form Dialog */}
      <InvoiceFormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) setEditingInvoice(null);
        }}
        invoice={editingInvoice}
        customers={customers}
        leads={leads}
        services={services}
        defaultTaxPercent={defaultTaxPercent}
        organizationId={organization?.id || ''}
      />

      {/* Invoice View Dialog */}
      <InvoiceViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        invoice={viewingInvoice}
      />
    </AdminLayout>
  );
}
