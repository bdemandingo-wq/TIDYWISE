import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Printer, ExternalLink, FileText, CheckCircle2, Clock, AlertCircle, X, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';

interface InvoiceViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: FileText },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700', icon: Clock },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500', icon: X },
};

export function InvoiceViewDialog({ open, onOpenChange, invoice }: InvoiceViewDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);

  // Fetch business settings for branding
  const { data: businessSettings } = useQuery({
    queryKey: ['business-settings', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .eq('organization_id', organization.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  if (!invoice) return null;

  const customerName = invoice.customer 
    ? `${invoice.customer.first_name} ${invoice.customer.last_name}`
    : invoice.lead?.name || 'Unknown Customer';
  const customerEmail = invoice.customer?.email || invoice.lead?.email || '';
  const customerPhone = invoice.customer?.phone || invoice.lead?.phone || '';

  const statusConfig = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice INV-${String(invoice.invoice_number).padStart(4, '0')}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .company-name { font-size: 24px; font-weight: bold; color: #1a1a1a; }
            .invoice-title { font-size: 32px; font-weight: bold; color: #6366f1; }
            .invoice-number { color: #666; margin-top: 4px; }
            .section { margin-bottom: 24px; }
            .section-title { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
            .section-content { color: #1a1a1a; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
            table { width: 100%; border-collapse: collapse; margin: 24px 0; }
            th { background: #f3f4f6; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; }
            td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
            .text-right { text-align: right; }
            .totals { max-width: 300px; margin-left: auto; }
            .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
            .totals-row.total { font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a1a; margin-top: 8px; padding-top: 16px; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
            .status-paid { background: #dcfce7; color: #166534; }
            .status-sent { background: #dbeafe; color: #1e40af; }
            .status-draft { background: #f3f4f6; color: #374151; }
            .status-overdue { background: #fee2e2; color: #991b1b; }
            .notes { background: #f9fafb; padding: 16px; border-radius: 8px; margin-top: 24px; }
            .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center; color: #666; font-size: 14px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleSendEmail = async () => {
    if (!customerEmail) {
      toast.error('No email address found for this client');
      return;
    }

    setSending(true);
    try {
      const serviceName = invoice.invoice_items?.map((i: any) => i.description).join(', ') || 'Cleaning Service';

      const { error } = await supabase.functions.invoke('send-invoice', {
        body: {
          invoiceNumber: invoice.invoice_number,
          organizationId: organization?.id,
          customerEmail,
          customerName,
          serviceName,
          amount: invoice.total_amount,
          address: invoice.address || undefined,
          validUntil: invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : undefined,
          notes: invoice.notes || undefined,
        },
      });

      if (error) throw error;

      if (invoice.status === 'draft') {
        await supabase
          .from('invoices')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', invoice.id);
      }

      toast.success(`Invoice emailed to ${customerEmail}`);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (err: any) {
      console.error('Failed to send invoice email:', err);
      toast.error(err.message || 'Failed to send invoice email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Invoice Details</DialogTitle>
            <div className="flex gap-2">
              {['draft', 'sent', 'overdue'].includes(invoice.status) && customerEmail && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={sending}
                  className="text-blue-600"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {invoice.status === 'draft' ? 'Send Email' : 'Resend Email'}
                </Button>
              )}
              {invoice.stripe_invoice_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={invoice.stripe_invoice_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Pay Online
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Printable Invoice */}
        <div ref={printRef} className="bg-white p-8 rounded-lg border">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {businessSettings?.company_name || 'Your Company'}
              </h1>
              {businessSettings?.company_address && (
                <p className="text-muted-foreground mt-1">
                  {businessSettings.company_address}
                  {businessSettings.company_city && `, ${businessSettings.company_city}`}
                  {businessSettings.company_state && `, ${businessSettings.company_state}`}
                  {businessSettings.company_zip && ` ${businessSettings.company_zip}`}
                </p>
              )}
              {businessSettings?.company_phone && (
                <p className="text-muted-foreground">{businessSettings.company_phone}</p>
              )}
              {businessSettings?.company_email && (
                <p className="text-muted-foreground">{businessSettings.company_email}</p>
              )}
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-primary">INVOICE</h2>
              <p className="text-muted-foreground mt-1">
                INV-{String(invoice.invoice_number).padStart(4, '0')}
              </p>
              <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium mt-2 ${statusConfig.color}`}>
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
              </div>
            </div>
          </div>

          {/* Bill To & Invoice Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-xs uppercase text-muted-foreground font-medium mb-2">Bill To</h3>
              <p className="font-medium">{customerName}</p>
              <p className="text-muted-foreground">{customerEmail}</p>
              {customerPhone && <p className="text-muted-foreground">{customerPhone}</p>}
              {invoice.address && <p className="text-muted-foreground mt-2">{invoice.address}</p>}
            </div>
            <div className="text-right">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice Date:</span>
                  <span>{format(new Date(invoice.created_at), 'MMM d, yyyy')}</span>
                </div>
                {invoice.due_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due Date:</span>
                    <span>{format(new Date(invoice.due_date), 'MMM d, yyyy')}</span>
                  </div>
                )}
                {invoice.paid_at && (
                  <div className="flex justify-between text-green-600">
                    <span>Paid On:</span>
                    <span>{format(new Date(invoice.paid_at), 'MMM d, yyyy')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <table className="w-full mb-8">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 text-xs uppercase text-muted-foreground font-medium">Description</th>
                <th className="text-center py-3 text-xs uppercase text-muted-foreground font-medium w-20">Qty</th>
                <th className="text-right py-3 text-xs uppercase text-muted-foreground font-medium w-28">Unit Price</th>
                <th className="text-right py-3 text-xs uppercase text-muted-foreground font-medium w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items?.map((item: any, index: number) => (
                <tr key={item.id || index} className="border-b">
                  <td className="py-3">
                    <span className="font-medium">{item.description}</span>
                    {item.service?.name && item.service.name !== item.description && (
                      <span className="text-muted-foreground text-sm ml-2">({item.service.name})</span>
                    )}
                  </td>
                  <td className="text-center py-3">{item.quantity}</td>
                  <td className="text-right py-3">${Number(item.unit_price).toFixed(2)}</td>
                  <td className="text-right py-3 font-medium">${Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Subtotal:</span>
                <span>${Number(invoice.subtotal).toFixed(2)}</span>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between py-1 text-green-600">
                  <span>Discount ({invoice.discount_percent}%):</span>
                  <span>-${Number(invoice.discount_amount).toFixed(2)}</span>
                </div>
              )}
              {invoice.tax_amount > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Tax ({invoice.tax_percent}%):</span>
                  <span>${Number(invoice.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t-2 border-foreground font-bold text-lg">
                <span>Total:</span>
                <span>${Number(invoice.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="mt-8 p-4 bg-muted/30 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Notes</h4>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t text-center text-muted-foreground text-sm">
            <p>Thank you for your business!</p>
            {businessSettings?.company_email && (
              <p className="mt-1">Questions? Contact us at {businessSettings.company_email}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
