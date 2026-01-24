import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard, 
  FileText, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  User,
  DollarSign,
  Phone,
  Tag,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invokeSmsFunction } from '@/lib/smsErrorHandler';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';
import { useOrgId } from '@/hooks/useOrgId';
import { useBookingForm } from '../BookingFormContext';
import { useDiscounts } from '@/hooks/useDiscounts';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';

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
    customerTab,
    selectedCustomer,
    newCustomer,
    calculatedPrice,
    finalPrice,
    appliedDiscount,
    setAppliedDiscount,
    isTeamMode,
    selectedTeamMembers,
    teamMemberPay,
    staff,
  } = useBookingForm();

  const { organizationId } = useOrgId();
  const { validateCoupon, calculateDiscountAmount } = useDiscounts();
  const { settings: orgSettings } = useOrganizationSettings();

  const [sendingLinkSms, setSendingLinkSms] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Get customer phone
  const customerPhone = customerTab === 'existing' && selectedCustomer 
    ? selectedCustomer.phone 
    : newCustomer.phone;

  // Use override amount if set, otherwise use calculated price
  const effectiveAmount = totalAmount > 0 ? totalAmount : calculatedPrice;

  // Calculate with proper order: Subtotal → Discount → Tax → Total
  const pricingBreakdown = useMemo(() => {
    const subtotal = effectiveAmount;
    const discountAmount = appliedDiscount?.discountAmount || 0;
    const discountedSubtotal = Math.max(0, subtotal - discountAmount);
    const taxRate = orgSettings?.sales_tax_percent || 0;
    const taxAmount = taxRate > 0 ? (discountedSubtotal * taxRate) / 100 : 0;
    const grandTotal = discountedSubtotal + taxAmount;
    
    return {
      subtotal,
      discountAmount,
      discountedSubtotal,
      taxRate,
      taxAmount,
      grandTotal,
    };
  }, [effectiveAmount, appliedDiscount, orgSettings]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Please enter a coupon code');
      return;
    }

    setValidatingCoupon(true);
    setCouponError(null);

    try {
      const discount = await validateCoupon(couponCode.trim(), effectiveAmount);
      
      if (!discount) {
        setCouponError('Invalid or expired coupon code');
        return;
      }

      const discountAmount = calculateDiscountAmount(discount, effectiveAmount);
      
      setAppliedDiscount({
        id: discount.id,
        code: discount.code,
        discount_type: discount.discount_type,
        discount_value: discount.discount_value,
        discountAmount,
      });
      
      setCouponCode('');
      toast.success(`Coupon applied! You saved $${discountAmount.toFixed(2)}`);
    } catch (error) {
      setCouponError('Failed to validate coupon');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedDiscount(null);
    toast.info('Coupon removed');
  };

  const handleSendPaymentLinkSms = async () => {
    if (!customerPhone || !customerName) {
      toast.error('Please enter customer phone number and name first');
      return;
    }

    const amountToCharge = pricingBreakdown.grandTotal;
    if (!amountToCharge || amountToCharge <= 0) {
      toast.error('Please select a service and property details to calculate the price');
      return;
    }

    setSendingLinkSms(true);
    try {
      const result = await invokeSmsFunction(supabase, 'send-card-link-sms', {
        phone: customerPhone,
        email: customerEmail,
        customerName,
        organizationId: organizationId ?? undefined,
        amount: amountToCharge,
      });

      if (!result.success) return;
      toast.success(`Payment link for $${amountToCharge.toFixed(2)} sent via SMS`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send payment link via SMS');
    } finally {
      setSendingLinkSms(false);
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

      {/* Discount Code Section */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Discount Code</Label>
          </div>
          
          {appliedDiscount ? (
            <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-emerald-800 dark:text-emerald-200">
                    {appliedDiscount.code}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    {appliedDiscount.discount_type === 'percentage' 
                      ? `${appliedDiscount.discount_value}% off` 
                      : `$${appliedDiscount.discount_value} off`}
                    {' '}- Saving ${appliedDiscount.discountAmount.toFixed(2)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveCoupon}
                className="h-9 w-9 p-0 text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    setCouponError(null);
                  }}
                  placeholder="Enter coupon code"
                  className="h-11 bg-secondary/30 border-border/50 uppercase"
                />
                <Button
                  onClick={handleApplyCoupon}
                  disabled={validatingCoupon || !couponCode.trim()}
                  className="h-11 px-6"
                >
                  {validatingCoupon ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Apply'
                  )}
                </Button>
              </div>
              {couponError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {couponError}
                </p>
              )}
            </div>
          )}
          
          {/* Price Summary with Tax + Discount */}
          {pricingBreakdown.subtotal > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${pricingBreakdown.subtotal.toFixed(2)}</span>
              </div>
              {appliedDiscount && (
                <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                  <span>Discount ({appliedDiscount.code})</span>
                  <span>-${pricingBreakdown.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {appliedDiscount && pricingBreakdown.taxRate > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Discounted Subtotal</span>
                  <span>${pricingBreakdown.discountedSubtotal.toFixed(2)}</span>
                </div>
              )}
              {pricingBreakdown.taxRate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sales Tax ({pricingBreakdown.taxRate}%)</span>
                  <span>${pricingBreakdown.taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-lg pt-2 border-t border-border/30">
                <span>Grand Total</span>
                <span className={appliedDiscount ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                  ${pricingBreakdown.grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cleaner Payment Section - Only show if NOT in team mode */}
      {!(isTeamMode && selectedTeamMembers.length > 0) && (
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
      )}

      {/* Team Mode Pay Summary */}
      {isTeamMode && selectedTeamMembers.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Team Pay Summary</Label>
            </div>
            <div className="space-y-2">
              {selectedTeamMembers.map((staffId, index) => {
                const staffMember = staff?.find(s => s.id === staffId);
                const pay = teamMemberPay[staffId] || 0;
                return (
                  <div key={staffId} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      {index === 0 && (
                        <Badge className="bg-primary text-primary-foreground text-xs">Lead</Badge>
                      )}
                      <span className="font-medium">{staffMember?.name || 'Unknown'}</span>
                    </div>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      ${pay.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between pt-2 border-t border-border/50 font-semibold">
                <span>Total Team Pay</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  ${Object.values(teamMemberPay).reduce((sum, pay) => sum + pay, 0).toFixed(2)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Individual pay was set in the Schedule step. Each cleaner will see their assigned amount.
            </p>
          </CardContent>
        </Card>
      )}

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
                  organizationId={organizationId || ''}
                  onCardSaved={handleCardSaved}
                  onError={(error) => setChargeError(error)}
                  showHoldOption={true}
                  defaultHoldAmount={pricingBreakdown.grandTotal || 50}
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
                className="h-11 w-full"
                onClick={handleSendPaymentLinkSms}
                disabled={sendingLinkSms || !customerPhone || !pricingBreakdown.grandTotal}
                title={!customerPhone ? "Customer phone required" : !pricingBreakdown.grandTotal ? "Select service and details first" : `Send payment link for $${pricingBreakdown.grandTotal.toFixed(2)}`}
              >
                {sendingLinkSms ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="mr-2 h-4 w-4" />
                )}
                Send Payment Link (${pricingBreakdown.grandTotal?.toFixed(2) || '0.00'})
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
