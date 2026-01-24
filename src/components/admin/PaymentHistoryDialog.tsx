import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { useOrganization } from '@/contexts/OrganizationContext';

interface PaymentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
}

interface PaymentRecord {
  id: string;
  booking_number: number;
  scheduled_at: string;
  total_amount: number;
  payment_status: string;
  service_name: string | null;
}

export function PaymentHistoryDialog({ 
  open, 
  onOpenChange, 
  customerId, 
  customerName 
}: PaymentHistoryDialogProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ paid: 0, pending: 0, total: 0 });
  const { organization } = useOrganization();

  useEffect(() => {
    if (open && customerId && organization?.id) {
      fetchPaymentHistory();
    }
  }, [open, customerId, organization?.id]);

  const fetchPaymentHistory = async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_number,
          scheduled_at,
          total_amount,
          payment_status,
          service:services(name)
        `)
        .eq('customer_id', customerId)
        .eq('organization_id', organization.id)
        .order('scheduled_at', { ascending: false });

      if (error) throw error;

      const records = (data || []).map(b => ({
        id: b.id,
        booking_number: b.booking_number,
        scheduled_at: b.scheduled_at,
        total_amount: b.total_amount,
        payment_status: b.payment_status,
        service_name: b.service?.name || null,
      }));

      setPayments(records);

      // Calculate totals
      const paid = records.filter(p => p.payment_status === 'paid').reduce((sum, p) => sum + p.total_amount, 0);
      const pending = records.filter(p => p.payment_status !== 'paid' && p.payment_status !== 'refunded').reduce((sum, p) => sum + p.total_amount, 0);
      setTotals({ paid, pending, total: paid + pending });
    } catch (error) {
      console.error('Error fetching payment history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-emerald-100 text-emerald-700">Paid</Badge>;
      case 'refunded':
        return <Badge className="bg-slate-100 text-slate-600">Refunded</Badge>;
      case 'partial':
        return <Badge className="bg-amber-100 text-amber-700">Partial</Badge>;
      default:
        return <Badge className="bg-rose-100 text-rose-700">Unpaid</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Payment History - {customerName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-emerald-700">Total Paid</span>
                </div>
                <p className="text-2xl font-bold text-emerald-700">${totals.paid.toFixed(2)}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-amber-700">Pending</span>
                </div>
                <p className="text-2xl font-bold text-amber-700">${totals.pending.toFixed(2)}</p>
              </div>
              <div className="bg-primary/10 rounded-xl p-4 border border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-sm text-primary">Total Bookings</span>
                </div>
                <p className="text-2xl font-bold text-primary">{payments.length}</p>
              </div>
            </div>

            {/* Payment List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {payments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No payment records found
                </div>
              ) : (
                payments.map((payment) => (
                  <div 
                    key={payment.id}
                    className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">#{payment.booking_number}</span>
                      </div>
                      <div>
                        <p className="font-medium">{payment.service_name || 'Service'}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(payment.scheduled_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getPaymentBadge(payment.payment_status)}
                      <span className="font-bold text-lg">${payment.total_amount.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
