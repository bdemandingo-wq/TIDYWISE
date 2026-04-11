import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Printer, ExternalLink, Send, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';
import {
  buildInvoiceEmailPayload,
  formatInvoiceNumber,
  getInvoiceContact,
  getInvoiceDueDate,
  getInvoiceLineItems,
  getInvoiceServiceAddressLines,
  isInvoicePaid,
} from '@/lib/invoiceUtils';
import { InvoiceDocument } from './invoice/InvoiceDocument';

interface InvoiceViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any | null;
}

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
  const invoiceNumber = formatInvoiceNumber(invoice.invoice_number);
  const dueDate = getInvoiceDueDate(invoice);
  const isPaid = isInvoicePaid(invoice);

  const companyAddressLines = [
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
            body { margin: 0; padding: 32px; background: #ffffff; color: #111827; font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
            a { color: inherit; }
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

        <div ref={printRef}>
          <InvoiceDocument
            businessName={businessSettings?.company_name || 'TidyWise Cleaning'}
            businessEmail={businessSettings?.company_email}
            businessPhone={businessSettings?.company_phone}
            businessAddressLines={companyAddressLines}
            invoiceNumber={invoiceNumber}
            invoiceDate={invoice.created_at}
            dueDate={dueDate}
            customerName={contact.name}
            customerEmail={contact.email}
            customerPhone={contact.phone}
            customerAddressLines={addressLines}
            lineItems={lineItems}
            subtotal={Number(invoice.subtotal ?? invoice.total_amount)}
            total={Number(invoice.total_amount)}
            notes={invoice.notes}
            isPaid={isPaid}
            paidAt={invoice.paid_at}
            amountPaid={isPaid ? Number(invoice.total_amount) : undefined}
            remainingBalance={isPaid ? 0 : Number(invoice.total_amount)}
            paymentUrl={!isPaid ? invoice.stripe_invoice_url : null}
          />
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Questions? Reply to this email or call {businessSettings?.company_phone || 'your office'}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
