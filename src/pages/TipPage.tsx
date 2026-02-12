import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Heart, CheckCircle, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Seo } from '@/components/Seo';

interface TipDetails {
  id: string;
  status: string;
  amount: number | null;
  customerName: string;
  bookingNumber: number;
  scheduledAt: string;
  serviceName: string;
  companyName: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

const PRESET_AMOUNTS = [5, 10, 20];

export default function TipPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get('status');

  const [tipDetails, setTipDetails] = useState<TipDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    
    const fetchTip = async () => {
      try {
        // If returning from Stripe success, confirm payment first
        if (paymentStatus === 'success') {
          await supabase.functions.invoke('confirm-tip-payment', {
            body: { token },
          });
        }

        const { data, error } = await supabase.functions.invoke('get-tip-details', {
          body: { token },
        });
        if (error) throw error;
        if (data?.success) {
          setTipDetails(data.tip);
        } else {
          setError(data?.error || 'Tip not found');
        }
      } catch (err) {
        setError('Unable to load tip details');
      } finally {
        setLoading(false);
      }
    };
    fetchTip();
  }, [token, paymentStatus]);

  const finalAmount = selectedAmount || (customAmount ? parseFloat(customAmount) : 0);

  const handleSubmitTip = async () => {
    if (!finalAmount || finalAmount <= 0 || !token) return;

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-tip', {
        body: { token, amount: finalAmount },
      });
      if (error) throw error;
      if (data?.success && data?.url) {
        window.location.href = data.url;
      } else {
        setError(data?.error || 'Failed to process tip');
      }
    } catch (err) {
      setError('Failed to process tip');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Success state after payment
  if (paymentStatus === 'success' || tipDetails?.status === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <Seo title="Thank You for Your Tip!" description="Your tip has been received." />
        <Card className="w-full max-w-md text-center shadow-xl border-emerald-200">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-emerald-800">Thank You! 🎉</h2>
            <p className="text-emerald-700">
              Your generous tip{tipDetails?.amount ? ` of $${Number(tipDetails.amount).toFixed(2)}` : ''} has been received.
            </p>
            <p className="text-sm text-emerald-600">
              {tipDetails?.companyName} appreciates your kindness!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !tipDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <Seo title="Tip" description="Leave a tip for your cleaner." />
        <Card className="w-full max-w-md text-center shadow-xl">
          <CardContent className="pt-8 pb-8 space-y-4">
            <p className="text-muted-foreground">{error || 'This tip link is no longer valid.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
      <Seo title={`Leave a Tip - ${tipDetails.companyName}`} description="Thank your cleaner with a tip." />
      <Card className="w-full max-w-md shadow-xl border-emerald-200/50">
        <CardHeader className="text-center pb-2">
          {tipDetails.logoUrl && (
            <img src={tipDetails.logoUrl} alt={tipDetails.companyName} className="h-12 mx-auto mb-3 object-contain" />
          )}
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-2">
            <Heart className="w-7 h-7 text-emerald-600" />
          </div>
          <CardTitle className="text-xl">Leave a Tip</CardTitle>
          <CardDescription>
            Thank your cleaner from {tipDetails.companyName}!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Service info */}
          <div className="bg-emerald-50/80 rounded-lg p-3 text-center">
            <p className="text-sm text-emerald-700 font-medium">
              {tipDetails.serviceName} • Booking #{tipDetails.bookingNumber}
            </p>
          </div>

          {/* Preset amounts */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3 text-center">Choose an amount</p>
            <div className="grid grid-cols-3 gap-3">
              {PRESET_AMOUNTS.map((amt) => (
                <Button
                  key={amt}
                  variant={selectedAmount === amt ? 'default' : 'outline'}
                  className={`h-14 text-lg font-bold ${
                    selectedAmount === amt 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                      : 'border-emerald-200 hover:bg-emerald-50 text-emerald-700'
                  }`}
                  onClick={() => {
                    setSelectedAmount(amt);
                    setCustomAmount('');
                  }}
                >
                  ${amt}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <p className="text-sm text-muted-foreground text-center mb-2">Or enter a custom amount</p>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder="0.00"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setSelectedAmount(null);
                }}
                className="pl-8 h-12 text-lg text-center"
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            className="w-full h-12 text-lg font-semibold bg-emerald-600 hover:bg-emerald-700"
            disabled={!finalAmount || finalAmount <= 0 || processing}
            onClick={handleSubmitTip}
          >
            {processing ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Heart className="w-5 h-5 mr-2" />
            )}
            {finalAmount > 0 ? `Send $${finalAmount.toFixed(2)} Tip` : 'Select an amount'}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Secure payment powered by Stripe
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
