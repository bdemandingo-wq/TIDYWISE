import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, DollarSign, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Seo } from '@/components/Seo';

interface DepositDetails {
  id: string;
  status: string;
  amount: number;
  customerName: string;
  bookingNumber: number;
  scheduledAt: string;
  serviceName: string;
  companyName: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

export default function DepositPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get('status');

  const [depositDetails, setDepositDetails] = useState<DepositDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchDeposit = async () => {
      try {
        // If returning from Stripe success, confirm payment first
        if (paymentStatus === 'success') {
          await supabase.functions.invoke('confirm-deposit-payment', {
            body: { token },
          });
        }

        const { data, error } = await supabase.functions.invoke('get-deposit-details', {
          body: { token },
        });
        if (error) throw error;
        if (data?.success) {
          setDepositDetails(data.deposit);
        } else {
          setError(data?.error || 'Deposit request not found');
        }
      } catch (err) {
        setError('Unable to load deposit details');
      } finally {
        setLoading(false);
      }
    };
    fetchDeposit();
  }, [token, paymentStatus]);

  const handlePayDeposit = async () => {
    if (!token) return;

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-deposit', {
        body: { token },
      });
      if (error) throw error;
      if (data?.success && data?.url) {
        window.location.href = data.url;
      } else {
        setError(data?.error || 'Failed to process deposit');
      }
    } catch (err) {
      setError('Failed to process deposit');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Success state after payment
  if (paymentStatus === 'success' || depositDetails?.status === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <Seo title="Deposit Paid!" description="Your deposit has been received." />
        <Card className="w-full max-w-md text-center shadow-xl border-blue-200">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-emerald-800">Deposit Received! ✓</h2>
            <p className="text-emerald-700">
              Your deposit{depositDetails?.amount ? ` of $${Number(depositDetails.amount).toFixed(2)}` : ''} has been processed successfully.
            </p>
            <p className="text-sm text-emerald-600">
              {depositDetails?.companyName} — Booking #{depositDetails?.bookingNumber}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !depositDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <Seo title="Deposit" description="Pay your deposit." />
        <Card className="w-full max-w-md text-center shadow-xl">
          <CardContent className="pt-8 pb-8 space-y-4">
            <p className="text-muted-foreground">{error || 'This deposit link is no longer valid.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <Seo title={`Pay Deposit - ${depositDetails.companyName}`} description="Pay your service deposit." />
      <Card className="w-full max-w-md shadow-xl border-blue-200/50">
        <CardHeader className="text-center pb-2">
          {depositDetails.logoUrl && (
            <img
              src={depositDetails.logoUrl}
              alt={depositDetails.companyName}
              className="h-12 mx-auto mb-3 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="w-14 h-14 mx-auto rounded-full bg-blue-100 flex items-center justify-center mb-2">
            <CreditCard className="w-7 h-7 text-blue-600" />
          </div>
          <CardTitle className="text-xl">Pay Deposit</CardTitle>
          <CardDescription>
            {depositDetails.companyName} is requesting a deposit for your upcoming service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Service info */}
          <div className="bg-blue-50/80 rounded-lg p-3 text-center">
            <p className="text-sm text-blue-700 font-medium">
              {depositDetails.serviceName} • Booking #{depositDetails.bookingNumber}
            </p>
            {depositDetails.scheduledAt && (
              <p className="text-xs text-blue-600 mt-1">
                Scheduled: {new Date(depositDetails.scheduledAt).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                })}
              </p>
            )}
          </div>

          {/* Deposit amount */}
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-1">Deposit Amount</p>
            <p className="text-4xl font-bold text-foreground">
              ${Number(depositDetails.amount).toFixed(2)}
            </p>
          </div>

          {/* Pay button */}
          <Button
            className="w-full h-12 text-lg font-semibold bg-blue-600 hover:bg-blue-700"
            disabled={processing}
            onClick={handlePayDeposit}
          >
            {processing ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <DollarSign className="w-5 h-5 mr-2" />
            )}
            Pay ${Number(depositDetails.amount).toFixed(2)} Deposit
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Secure payment powered by Stripe
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
