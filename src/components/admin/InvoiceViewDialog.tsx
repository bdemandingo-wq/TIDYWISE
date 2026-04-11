import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import {
  buildInvoiceEmailPayload,
  formatInvoiceNumber,
  getInvoiceContact,
  getInvoiceLineItems,
  getInvoiceServiceAddressLines,
} from '@/lib/invoiceUtils';

interface InvoiceViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof FileText }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground', icon: FileText },
  sent: { label: 'Sent', className: 'bg-secondary text-foreground', icon: Clock },
  paid: { label: 'Paid', className: 'bg-primary/10 text-primary', icon: CheckCircle2 },
  overdue: { label: 'Overdue', className: 'bg-destructive/10 text-destructive', icon: AlertCircle },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground', icon: X },
};

const ACCENT = '#0ea5e9';
const SLATE = '#0f172a';
const MUTED = '#475569';
const BORDER = '#e2e8f0';

export function InvoiceViewDialog({ open, onOpenChange, invoice }: InvoiceViewDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);

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

  const contact = getInvoiceContact(invoice);
  const lineItems = getInvoiceLineItems(invoice);
  const addressLines = getInvoiceServiceAddressLines(invoice);
  const statusConfig = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;
  const invoiceNumber = formatInvoiceNumber(invoice.invoice_number);

  const companyAddressLine = [
    businessSettings?.company_address,
    [businessSettings?.company_city, businessSettings?.company_state, businessSettings?.company_zip].filter(Boolean).join(', '),
  ].filter(Boolean);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${invoiceNumber}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 32px; background: #ffffff; color: ${SLATE}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: ${MUTED}; padding: 12px 0; border-bottom: 1px solid ${BORDER}; }
            td { padding: 14px 0; border-bottom: 1px solid ${BORDER}; vertical-align: top; }
            .text-right { text-align: right; }
          </style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleSendEmail = async () => {
    if (!contact.email) {
      toast.error('No email address found for this client');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-invoice', {
        body: buildInvoiceEmailPayload(invoice, organization?.id || ''),
      });

      if (error) throw error;

      if (invoice.status === 'draft') {
        await supabase
          .from('invoices')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', invoice.id);
      }

      toast.success(`Invoice emailed to ${contact.email}`);
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle>Invoice Details</DialogTitle>
            <div className="flex flex-wrap gap-2">
              {['draft', 'sent', 'overdue'].includes(invoice.status) && contact.email && (
                <Button variant="outline" size="sm" onClick={handleSendEmail} disabled={sending}>
                  {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
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

        <div ref={printRef} className="rounded-xl border bg-card p-4 md:p-8" style={{ backgroundColor: '#ffffff', color: SLATE }}>
          <div className="flex flex-col gap-6 border-b pb-6 md:flex-row md:items-start md:justify-between" style={{ borderColor: BORDER }}>
            <div className="space-y-2">
              <div className="text-2xl font-bold tracking-tight">{businessSettings?.company_name || 'TidyWise'}</div>
              {companyAddressLine.map((line: string) => (
                <div key={line} className="text-sm" style={{ color: MUTED }}>{line}</div>
              ))}
              <div className="text-sm" style={{ color: MUTED }}>
                {[businessSettings?.company_phone, businessSettings?.company_email].filter(Boolean).join(' · ')}
              </div>
            </div>

            <div className="space-y-2 md:text-right">
              <div className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>Invoice</div>
              <div className="text-3xl font-bold tracking-tight">{invoiceNumber}</div>
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${statusConfig.className}`}>
                <StatusIcon className="h-4 w-4" />
                {statusConfig.label}
              </div>
            </div>
          </div>

          <div className="grid gap-6 py-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>Bill To</div>
              <div className="font-semibold">{contact.name}</div>
              {contact.email && <div className="text-sm" style={{ color: MUTED }}>{contact.email}</div>}
              {contact.phone && <div className="text-sm" style={{ color: MUTED }}>{contact.phone}</div>}
              {addressLines.length > 0 && (
                <div className="pt-2 text-sm whitespace-pre-line" style={{ color: MUTED }}>
                  {addressLines.join('\n')}
                </div>
              )}
            </div>

            <div className="space-y-2 md:text-right">
              <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>Invoice Date</div>
              <div className="font-medium">{format(new Date(invoice.created_at), 'MMM d, yyyy')}</div>
              {invoice.due_date && (
                <>
                  <div className="pt-3 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>Due Date</div>
                  <div className="font-medium">{format(new Date(invoice.due_date), 'MMM d, yyyy')}</div>
                </>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Unit Price</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <tr key={`${item.description}-${index}`}>
                    <td>
                      <div className="font-medium">{item.description}</div>
                    </td>
                    <td className="text-right">{item.quantity}</td>
                    <td className="text-right">${item.unitPrice.toFixed(2)}</td>
                    <td className="text-right">${item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end py-6">
            <div className="w-full max-w-sm space-y-3 rounded-xl border p-4" style={{ borderColor: BORDER }}>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: MUTED }}>Subtotal</span>
                <span>${Number(invoice.subtotal ?? invoice.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold">
                <span style={{ color: ACCENT }}>Total</span>
                <span style={{ color: ACCENT }}>${Number(invoice.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="rounded-xl border p-4" style={{ borderColor: BORDER }}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>Notes</div>
              <div className="text-sm whitespace-pre-line" style={{ color: MUTED }}>{invoice.notes}</div>
            </div>
          )}

          <div className="mt-6 border-t pt-6 text-sm text-center" style={{ borderColor: BORDER, color: MUTED }}>
            Questions? Reply to this email or call {businessSettings?.company_phone || 'your office'}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
