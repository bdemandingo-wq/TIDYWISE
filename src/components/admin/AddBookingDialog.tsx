import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  CreditCard, 
  Loader2, 
  User, 
  Mail, 
  Phone, 
  MapPin,
  Send,
  CheckCircle,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCustomers, useServices, useStaff, useCreateBooking, useCreateCustomer, BookingWithDetails } from '@/hooks/useBookings';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  booking?: BookingWithDetails | null;
}

interface CardInfo {
  hasCard: boolean;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
}

const TIME_SLOTS = [
  '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM', '06:00 PM'
];

export function AddBookingDialog({ open, onOpenChange, defaultDate, booking }: AddBookingDialogProps) {
  const { data: customers = [] } = useCustomers();
  const { data: services = [] } = useServices();
  const { data: staff = [] } = useStaff();
  const createBooking = useCreateBooking();
  const createCustomer = useCreateCustomer();

  // Form state
  const [customerTab, setCustomerTab] = useState<'existing' | 'new'>('existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [newCustomer, setNewCustomer] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: ''
  });
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(defaultDate);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [totalAmount, setTotalAmount] = useState<number>(0);

  // Card state
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [chargingCard, setChargingCard] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [sendingLink, setSendingLink] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  const selectedService = services.find(s => s.id === selectedServiceId);
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  
  // Get customer email for card operations
  const customerEmail = customerTab === 'existing' && selectedCustomer 
    ? selectedCustomer.email 
    : newCustomer.email;

  const customerName = customerTab === 'existing' && selectedCustomer
    ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
    : `${newCustomer.first_name} ${newCustomer.last_name}`;

  // Update total when service changes
  useEffect(() => {
    if (selectedService) {
      setTotalAmount(selectedService.price);
    }
  }, [selectedService]);

  // Load card info when customer changes
  useEffect(() => {
    if (customerEmail) {
      loadCardInfo(customerEmail);
    } else {
      setCardInfo(null);
    }
  }, [customerEmail]);

  const loadCardInfo = async (email: string) => {
    if (!email) return;
    
    setLoadingCard(true);
    setChargeError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('get-customer-card', {
        body: { email }
      });

      if (error) throw error;
      setCardInfo(data);
    } catch (error: any) {
      console.error('Error loading card info:', error);
      setCardInfo({ hasCard: false });
    } finally {
      setLoadingCard(false);
    }
  };

  const handleChargeCard = async () => {
    if (!customerEmail || !totalAmount) {
      toast.error('Please select a customer and service first');
      return;
    }

    setChargingCard(true);
    setChargeError(null);

    try {
      const { data, error } = await supabase.functions.invoke('charge-customer-card', {
        body: {
          email: customerEmail,
          amount: totalAmount,
          description: selectedService?.name || 'Cleaning Service',
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'Hold placed on card successfully');
        return data.paymentIntentId;
      } else if (data.declined) {
        // Parse specific decline reasons
        const declineCode = data.declineCode;
        let friendlyMessage = data.error;
        
        switch (declineCode) {
          case 'insufficient_funds':
            friendlyMessage = 'Insufficient funds - The card does not have enough funds to complete this transaction.';
            break;
          case 'card_declined':
            friendlyMessage = 'Card declined - The card was declined by the bank.';
            break;
          case 'expired_card':
            friendlyMessage = 'Expired card - The card has expired.';
            break;
          case 'incorrect_cvc':
            friendlyMessage = 'Incorrect CVC - The security code is incorrect.';
            break;
          case 'processing_error':
            friendlyMessage = 'Processing error - Please try again.';
            break;
          case 'lost_card':
          case 'stolen_card':
            friendlyMessage = 'Card reported lost or stolen - Please use a different card.';
            break;
          default:
            friendlyMessage = data.error || 'Card was declined';
        }
        
        setChargeError(friendlyMessage);
        toast.error(friendlyMessage);
        return null;
      } else {
        throw new Error(data.error || 'Failed to charge card');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to charge card';
      setChargeError(errorMessage);
      toast.error(errorMessage);
      return null;
    } finally {
      setChargingCard(false);
    }
  };

  const handleSendCardLink = async () => {
    if (!customerEmail || !customerName) {
      toast.error('Please enter customer email and name first');
      return;
    }

    setSendingLink(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-card-collection-link', {
        body: {
          email: customerEmail,
          customerName: customerName,
        }
      });

      if (error) throw error;

      toast.success('Card collection link sent to customer');
    } catch (error: any) {
      console.error('Error sending card link:', error);
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

  const handleSubmit = async () => {
    // Validation
    if (customerTab === 'existing' && !selectedCustomerId) {
      toast.error('Please select a customer');
      return;
    }
    if (customerTab === 'new' && (!newCustomer.first_name || !newCustomer.last_name || !newCustomer.email)) {
      toast.error('Please fill in customer name and email');
      return;
    }
    if (!selectedServiceId) {
      toast.error('Please select a service');
      return;
    }
    if (!selectedDate || !selectedTime) {
      toast.error('Please select a date and time');
      return;
    }

    setSubmitting(true);

    try {
      let customerId = selectedCustomerId;

      // Create new customer if needed
      if (customerTab === 'new') {
        const customer = await createCustomer.mutateAsync(newCustomer);
        customerId = customer.id;
      }

      // Parse the time
      const [time, period] = selectedTime.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let hour24 = hours;
      if (period === 'PM' && hours !== 12) hour24 += 12;
      if (period === 'AM' && hours === 12) hour24 = 0;

      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hour24, minutes, 0, 0);

      // Attempt to charge card if customer has one
      let paymentIntentId: string | undefined;
      if (cardInfo?.hasCard) {
        const result = await handleChargeCard();
        if (result) {
          paymentIntentId = result;
        }
        // Don't block booking creation if card charge fails
      }

      // Get address from customer
      const customerData = customerTab === 'existing' 
        ? customers.find(c => c.id === customerId)
        : newCustomer;

      // Create the booking
      const bookingData = {
        customer_id: customerId,
        service_id: selectedServiceId,
        staff_id: selectedStaffId || null,
        scheduled_at: scheduledAt.toISOString(),
        duration: selectedService?.duration || 60,
        total_amount: totalAmount,
        status: 'confirmed' as const,
        payment_status: paymentIntentId ? 'partial' as const : 'pending' as const,
        payment_intent_id: paymentIntentId,
        notes: notes || null,
        address: customerData?.address || null,
        city: customerData?.city || null,
        state: customerData?.state || null,
        zip_code: customerData?.zip_code || null,
      };

      await createBooking.mutateAsync(bookingData);

      // Send admin notification email
      try {
        await supabase.functions.invoke('send-admin-booking-notification', {
          body: {
            customerName: customerName,
            customerEmail: customerEmail,
            serviceName: selectedService?.name,
            scheduledAt: scheduledAt.toISOString(),
            totalAmount: totalAmount,
            address: customerData?.address,
          }
        });
      } catch (emailError) {
        console.error('Failed to send admin notification:', emailError);
        // Don't block on email failure
      }

      toast.success('Booking created successfully');
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error creating booking:', error);
      toast.error(error.message || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCustomerTab('existing');
    setSelectedCustomerId('');
    setNewCustomer({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip_code: ''
    });
    setSelectedServiceId('');
    setSelectedStaffId('');
    setSelectedDate(undefined);
    setSelectedTime('');
    setNotes('');
    setTotalAmount(0);
    setCardInfo(null);
    setChargeError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{booking ? 'Edit Booking' : 'New Booking'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Customer & Service */}
          <div className="space-y-6">
            {/* Customer Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Customer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={customerTab} onValueChange={(v) => setCustomerTab(v as 'existing' | 'new')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="existing">Existing</TabsTrigger>
                    <TabsTrigger value="new">New Customer</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="existing" className="mt-4">
                    <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.first_name} {customer.last_name} - {customer.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TabsContent>
                  
                  <TabsContent value="new" className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={newCustomer.first_name}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, first_name: e.target.value }))}
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={newCustomer.last_name}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, last_name: e.target.value }))}
                          placeholder="Doe"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="john@example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <AddressAutocomplete
                        value={newCustomer.address}
                        onChange={(value) => setNewCustomer(prev => ({ ...prev, address: value }))}
                        onAddressSelect={(addressData) => {
                          setNewCustomer(prev => ({
                            ...prev,
                            address: addressData.address,
                            city: addressData.city,
                            state: addressData.state,
                            zip_code: addressData.zipCode
                          }));
                        }}
                        placeholder="Start typing address..."
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={newCustomer.city}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, city: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={newCustomer.state}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, state: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="zipCode">ZIP</Label>
                        <Input
                          id="zipCode"
                          value={newCustomer.zip_code}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, zip_code: e.target.value }))}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Service Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Service</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name} - ${service.price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div>
                  <Label htmlFor="totalAmount">Total Amount</Label>
                  <Input
                    id="totalAmount"
                    type="number"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(Number(e.target.value))}
                    className="text-lg font-semibold"
                  />
                </div>

                <div>
                  <Label>Assign Staff (Optional)</Label>
                  <Select value={selectedStaffId || "unassigned"} onValueChange={(val) => setSelectedStaffId(val === "unassigned" ? "" : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {staff.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Schedule & Payment */}
          <div className="space-y-6">
            {/* Date & Time */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Time</Label>
                  <Select value={selectedTime} onValueChange={setSelectedTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special instructions..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment / Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingCard ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : cardInfo?.hasCard ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="font-medium capitalize">{cardInfo.brand} •••• {cardInfo.last4}</p>
                          <p className="text-sm text-muted-foreground">
                            Expires {cardInfo.expMonth}/{cardInfo.expYear}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadCardInfo(customerEmail)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>

                    {chargeError && (
                      <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                        <p className="text-sm">{chargeError}</p>
                      </div>
                    )}
                  </div>
                ) : customerEmail ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
                      <AlertCircle className="h-5 w-5" />
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
                      className="w-full"
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
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Select a customer to manage payment
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <Separator className="my-4" />
        
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">
            Total: <span className="text-primary">${totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {booking ? 'Update Booking' : 'Create Booking'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
