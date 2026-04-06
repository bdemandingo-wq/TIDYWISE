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
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';
import { useInvoiceBranding, getFontFamily } from '@/hooks/useInvoiceBranding';

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
  const { branding } = useInvoiceBranding();

  // Fetch business settings for company info
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

  const primaryColor = branding.primary_color || '#3b82f6';
  const accentColor = branding.accent_color || '#e5e7eb';
  const fontFamily = getFontFamily(branding.font_style);
  const headerLayout = branding.header_layout || 'left';
  const footerMessage = branding.footer_message || 'Thank you for your business!';

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
            body { font-family: ${fontFamily}; padding: 40px; max-width: 800px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .company-name { font-size: 24px; font-weight: bold; color: #1a1a1a; }
            .invoice-title { font-size: 32px; font-weight: bold; color: ${primaryColor}; }
            .invoice-number { color: #666; margin-top: 4px; }
            .section { margin-bottom: 24px; }
            .section-title { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; }
            .section-content { color: #1a1a1a; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
            table { width: 100%; border-collapse: collapse; margin: 24px 0; }
            th { background: ${accentColor}30; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid ${accentColor}; }
            td { padding: 12px; border-bottom: 1px solid ${accentColor}40; }
            .text-right { text-align: right; }
            .totals { max-width: 300px; margin-left: auto; }
            .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
            .totals-row.total { font-size: 18px; font-weight: bold; border-top: 2px solid ${primaryColor}; margin-top: 8px; padding-top: 16px; color: ${primaryColor}; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
            .status-paid { background: #dcfce7; color: #166534; }
            .status-sent { background: #dbeafe; color: #1e40af; }
            .status-draft { background: #f3f4f6; color: #374151; }
            .status-overdue { background: #fee2e2; color: #991b1b; }
            .notes { background: #f9fafb; padding: 16px; border-radius: 8px; margin-top: 24px; }
            .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid ${accentColor}40; text-align: center; color: #666; font-size: 14px; }
            .logo { max-height: 48px; max-width: 160px; object-fit: contain; }
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

  // Logo element
  const logoImg = branding.logo_url ? (
    <img src={branding.logo_url} alt="Logo" className="h-12 w-auto max-w-[160px] object-contain" />
  ) : null;

  // Company info block
  const companyInfo = (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        {businessSettings?.company_name || 'Your Company'}
      </h1>
      {businessSettings?.company_address && (
        <p className="text-gray-500 mt-1">
          {businessSettings.company_address}
          {businessSettings.company_city && `, ${businessSettings.company_city}`}
          {businessSettings.company_state && `, ${businessSettings.company_state}`}
          {businessSettings.company_zip && ` ${businessSettings.company_zip}`}
        </p>
      )}
      {businessSettings?.company_phone && (
        <p className="text-gray-500">{businessSettings.company_phone}</p>
      )}
      {businessSettings?.company_email && (
        <p className="text-gray-500">{businessSettings.company_email}</p>
      )}
    </div>
  );

  const invoiceTitle = (
    <div className={headerLayout === 'left' ? 'text-right' : headerLayout === 'right' ? 'text-left' : ''}>
      <h2 className="text-3xl font-bold" style={{ color: primaryColor }}>INVOICE</h2>
      <p className="text-gray-500 mt-1">
        INV-{String(invoice.invoice_number).padStart(4, '0')}
      </p>
      <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium mt-2 ${statusConfig.color}`}>
        <StatusIcon className="w-3 h-3" />
        {statusConfig.label}
      </div>
    </div>
  );

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
        <div ref={printRef} className="bg-white p-8 rounded-lg border border-gray-200 text-gray-900" style={{ fontFamily }}>
          {/* Header with branding layout */}
          <div className="mb-8">
            {headerLayout === 'center' ? (
              <div className="text-center space-y-2">
                {logoImg && <div className="flex justify-center">{logoImg}</div>}
                {companyInfo}
                <div>
                  <h2 className="text-3xl font-bold" style={{ color: primaryColor }}>INVOICE</h2>
                  <p className="text-gray-500 mt-1">INV-{String(invoice.invoice_number).padStart(4, '0')}</p>
                  <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium mt-2 ${statusConfig.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusConfig.label}
                  </div>
                </div>
              </div>
            ) : headerLayout === 'right' ? (
              <div className="flex justify-between items-start">
                {invoiceTitle}
                <div className="text-right">
                  {logoImg && <div className="flex justify-end mb-2">{logoImg}</div>}
                  {companyInfo}
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-start">
                <div>
                  {logoImg && <div className="mb-2">{logoImg}</div>}
                  {companyInfo}
                </div>
                {invoiceTitle}
              </div>
            )}
          </div>

          {/* Bill To & Invoice Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-xs uppercase text-gray-500 font-medium mb-2">Bill To</h3>
              <p className="font-medium text-gray-900">{customerName}</p>
              <p className="text-gray-500">{customerEmail}</p>
              {customerPhone && <p className="text-gray-500">{customerPhone}</p>}
              {invoice.address && <p className="text-gray-500 mt-2">{invoice.address}</p>}
            </div>
            <div className="text-right">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice Date:</span>
                  <span className="text-gray-900">{format(new Date(invoice.created_at), 'MMM d, yyyy')}</span>
                </div>
                {invoice.due_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Due Date:</span>
                    <span className="text-gray-900">{format(new Date(invoice.due_date), 'MMM d, yyyy')}</span>
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
              <tr style={{ backgroundColor: accentColor + '30', borderBottom: `2px solid ${accentColor}` }}>
                <th className="text-left py-3 px-2 text-xs uppercase text-gray-600 font-medium">Description</th>
                <th className="text-center py-3 px-2 text-xs uppercase text-gray-600 font-medium w-20">Qty</th>
                <th className="text-right py-3 px-2 text-xs uppercase text-gray-600 font-medium w-28">Unit Price</th>
                <th className="text-right py-3 px-2 text-xs uppercase text-gray-600 font-medium w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items?.map((item: any, index: number) => (
                <tr key={item.id || index} style={{ borderBottom: `1px solid ${accentColor}40` }}>
                  <td className="py-3 px-2">
                    <span className="font-medium text-gray-900">{item.description}</span>
                    {item.service?.name && item.service.name !== item.description && (
                      <span className="text-gray-500 text-sm ml-2">({item.service.name})</span>
                    )}
                  </td>
                  <td className="text-center py-3 px-2 text-gray-900">{item.quantity}</td>
                  <td className="text-right py-3 px-2 text-gray-900">${Number(item.unit_price).toFixed(2)}</td>
                  <td className="text-right py-3 px-2 font-medium text-gray-900">${Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Subtotal:</span>
                <span className="text-gray-900">${Number(invoice.subtotal).toFixed(2)}</span>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between py-1 text-green-600">
                  <span>Discount ({invoice.discount_percent}%):</span>
                  <span>-${Number(invoice.discount_amount).toFixed(2)}</span>
                </div>
              )}
              {invoice.tax_amount > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Tax ({invoice.tax_percent}%):</span>
                  <span className="text-gray-900">${Number(invoice.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div
                className="flex justify-between py-2 font-bold text-lg"
                style={{ borderTop: `2px solid ${primaryColor}`, color: primaryColor }}
              >
                <span>Total:</span>
                <span>${Number(invoice.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium mb-2 text-gray-900">Notes</h4>
              <p className="text-gray-500 text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 text-center text-gray-500 text-sm" style={{ borderTop: `1px solid ${accentColor}40` }}>
            <p>{footerMessage}</p>
            {businessSettings?.company_email && (
              <p className="mt-1">Questions? Contact us at {businessSettings.company_email}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
