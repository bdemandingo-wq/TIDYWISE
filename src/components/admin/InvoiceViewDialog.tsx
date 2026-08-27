import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Printer, ExternalLink, Send, Loader2, ChevronLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mustAffectRows } from '@/lib/mustAffectRows';
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
import { useInvoiceBusinessInfo } from '@/hooks/useInvoiceBusinessInfo';
import { QueryError } from '@/components/QueryError';

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

  // Name chain matches send-invoice exactly, so the preview, the print
  // output and the emailed invoice all agree — and none of them can fall
  // back to the platform's brand.
  const businessInfo = useInvoiceBusinessInfo();

  if (!invoice) return null;
  if (businessInfo.error) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent><QueryError subject="business info for invoice" /></DialogContent>
      </Dialog>
    );
  }

  const contact = getInvoiceContact(invoice);
  const lineItems = getInvoiceLineItems(invoice);
  const addressLines = getInvoiceServiceAddressLines(invoice);
  const invoiceNumber = formatInvoiceNumber(invoice.invoice_number);
  const dueDate = getInvoiceDueDate(invoice);
  const isPaid = isInvoicePaid(invoice);


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
        // The email has already gone out. If this write is silently dropped the
        // invoice stays 'draft', looks unsent, and reports wrong in Finance.
        await mustAffectRows(
          supabase
            .from('invoices')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', invoice.id),
          `Invoice was emailed to ${contact.email} but could not be marked as sent. Refresh and check its status before re-sending.`,
          { table: 'invoices' },
        );
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
            <div className="flex items-center gap-1">
              <DialogClose asChild>
                <button className="md:hidden h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted -ml-1 mr-1 shrink-0">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </DialogClose>
              <DialogTitle>Invoice Details</DialogTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              {['draft', 'sent', 'overdue'].includes(invoice.status) && contact.email && (
                <Button variant="outline" size="sm" onClick={handleSendEmail} disabled={sending}>
                  {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {invoice.status === 'draft' ? 'Send Email' : 'Resend Email'}
                </Button>
              )}
              {invoice.stripe_invoice_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    // #12: the owner viewing this isn't the payer — they need
                    // to hand the payment link to the customer, not open it.
                    const url = invoice.stripe_invoice_url!;
                    try {
                      if (navigator.share) {
                        await navigator.share({ title: 'Invoice payment link', url });
                      } else {
                        await navigator.clipboard.writeText(url);
                        toast.success('Payment link copied — share it with your customer.');
                      }
                    } catch {
                      /* user cancelled share sheet */
                    }
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Share Link
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
            businessName={businessInfo.businessName}
            businessEmail={businessInfo.businessEmail}
            businessPhone={businessInfo.businessPhone}
            businessAddressLines={businessInfo.businessAddressLines}
            logoUrl={businessInfo.logoUrl}
            primaryColor={businessInfo.primaryColor}
            headerLayout={businessInfo.headerLayout}
            footerMessage={businessInfo.footerMessage}
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
            Questions? Reply to this email or contact {businessInfo.businessEmail || 'us'}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
