import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  FileText, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Send, 
  RefreshCw,
  User,
  DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';
import { useBookingForm } from '../BookingFormContext';

export function PaymentStep() {
  const {
    notes,
    setNotes,
    cleanerWage,
    setCleanerWage,
    cleanerWageType,
    setCleanerWageType,
    cleanerOverrideHours,
    setCleanerOverrideHours,
    cardInfo,
    setCardInfo,
    loadingCard,
    loadCardInfo,
    customerEmail,
    customerName,
    selectedService,
    totalAmount,
  } = useBookingForm();

  const [sendingLink, setSendingLink] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);

  const handleSendCardLink = async () => {
    if (!customerEmail || !customerName) {
      toast.error('Please enter customer email and name first');
      return;
    }

    setSendingLink(true);
    try {
      const { error } = await supabase.functions.invoke('send-card-collection-link', {
        body: { email: customerEmail, customerName }
      });
      if (error) throw error;
      toast.success('Card collection link sent to customer');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send card link');
    } finally {
      setSendingLink(false);
    }
  };

  const handleCardSaved = (info: { last4: string; brand: string; paymentMethodId: string }) => {
    setCardInfo({
      hasCard: true,
      last4: info.last4,
      brand: info.brand,
    });
    toast.success(`Card saved: ${info.brand} ending in ${info.last4}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-rose-500/20 to-rose-600/10">
          <CreditCard className="h-6 w-6 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Payment & Notes</h3>
          <p className="text-sm text-muted-foreground">Manage payment method and add notes</p>
        </div>
      </div>

      {/* Notes Section */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Special Instructions</Label>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special instructions, access codes, pet info, areas to focus on..."
            rows={4}
            className="bg-secondary/30 border-border/50 resize-none"
          />
        </CardContent>
      </Card>

      {/* Cleaner Payment Section */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Cleaner Payment (Optional)</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Payment Type</Label>
              <Select value={cleanerWageType} onValueChange={setCleanerWageType}>
                <SelectTrigger className="mt-2 h-11 bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="hourly">Hourly Rate</SelectItem>
                  <SelectItem value="flat">Flat Rate</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                {cleanerWageType === 'hourly' ? 'Hourly Rate ($)' : 
                 cleanerWageType === 'flat' ? 'Flat Amount ($)' : 'Percentage (%)'}
              </Label>
              <Input
                type="number"
                value={cleanerWage}
                onChange={(e) => setCleanerWage(e.target.value)}
                placeholder="0.00"
                className="mt-2 h-11 bg-secondary/30 border-border/50"
              />
            </div>
          </div>
          
          {cleanerWageType === 'hourly' && (
            <div className="mt-4">
              <Label className="text-xs text-muted-foreground">Override Hours</Label>
              <Input
                type="number"
                value={cleanerOverrideHours}
                onChange={(e) => setCleanerOverrideHours(e.target.value)}
                placeholder="Default: 5.0 hrs"
                className="mt-2 h-11 bg-secondary/30 border-border/50"
              />
            </div>
          )}

          {cleanerWage && (
            <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Estimated Cleaner Pay</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                ${(() => {
                  const wage = parseFloat(cleanerWage);
                  if (isNaN(wage)) return '0.00';
                  if (cleanerWageType === 'flat') return wage.toFixed(2);
                  if (cleanerWageType === 'percentage') return ((totalAmount * wage) / 100).toFixed(2);
                  const hours = parseFloat(cleanerOverrideHours) || ((selectedService?.duration || 60) / 60);
                  return (wage * hours).toFixed(2);
                })()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Card Section */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Customer Payment Method</Label>
          </div>
          
          {loadingCard ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : cardInfo?.hasCard ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium capitalize text-emerald-800 dark:text-emerald-200">
                      {cardInfo.brand} •••• {cardInfo.last4}
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Expires {cardInfo.expMonth}/{cardInfo.expYear}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadCardInfo(customerEmail)}
                    className="h-9 w-9 p-0"
                    title="Refresh card"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCardInfo({ hasCard: false })}
                    className="text-xs"
                  >
                    Add New Card
                  </Button>
                </div>
              </div>
            </div>
          ) : customerEmail ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">No card on file for this customer</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-medium">Add Card Now</p>
                <StripeCardForm
                  email={customerEmail}
                  customerName={customerName}
                  onCardSaved={handleCardSaved}
                  onError={(error) => setChargeError(error)}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full h-11"
                onClick={handleSendCardLink}
                disabled={sendingLink}
              >
                {sendingLink ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Link to Customer
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
                <User className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Select a customer to manage payment
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
