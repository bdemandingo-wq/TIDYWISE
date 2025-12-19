import { useEffect, useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  Plus,
  Minus,
  Sparkles,
  LayoutGrid,
  Blinds,
  Refrigerator,
  UtensilsCrossed,
  Flame,
  Dog,
  Shirt,
  Send,
  Calendar,
  CreditCard,
  Check,
} from 'lucide-react';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';
import {
  BookingWithDetails,
  useCreateBooking,
  useCreateCustomer,
  useServices,
  useStaff,
  useCustomers,
  useUpdateBooking,
} from '@/hooks/useBookings';
import {
  cleaningServices,
  squareFootageRanges,
  getSqFtIndexFromValue,
  getPriceForService,
  CleaningServiceType,
  extras,
  frequencyOptions,
  bedroomOptions,
  bathroomOptions,
} from '@/data/pricingData';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  booking?: BookingWithDetails | null;
}

const extraIcons: Record<string, React.ReactNode> = {
  windows: <Blinds className="w-6 h-6" />,
  appliances: <Refrigerator className="w-6 h-6" />,
  baseboards: <LayoutGrid className="w-6 h-6" />,
  walls: <Sparkles className="w-6 h-6" />,
  carpets: <Dog className="w-6 h-6" />,
  laundry: <Shirt className="w-6 h-6" />,
  dishes: <UtensilsCrossed className="w-6 h-6" />,
};

export function AddBookingDialog({ open, onOpenChange, defaultDate, booking }: AddBookingDialogProps) {
  const isEdit = !!booking;
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  
  // New customer fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [aptNumber, setAptNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  
  // Service fields
  const [selectedService, setSelectedService] = useState<CleaningServiceType | ''>('');
  const [frequency, setFrequency] = useState('one_time');
  const [bedrooms, setBedrooms] = useState('0');
  const [bathrooms, setBathrooms] = useState('1');
  const [squareFootage, setSquareFootage] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  
  // Booking adjustments
  const [adjustServiceTotal, setAdjustServiceTotal] = useState(false);
  const [adjustPrice, setAdjustPrice] = useState(false);
  const [adjustTime, setAdjustTime] = useState(false);
  const [customPrice, setCustomPrice] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  
  // Schedule
  const [scheduleType, setScheduleType] = useState<'schedule' | 'manual'>('manual');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(
    defaultDate ? defaultDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [scheduledTime, setScheduledTime] = useState('09:00');
  
  // Key information
  const [accessMethod, setAccessMethod] = useState('someone_home');
  const [keepKeyWithProvider, setKeepKeyWithProvider] = useState(false);
  const [customerNoteForProvider, setCustomerNoteForProvider] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  
  // Coupon/Gift Cards
  const [discountTab, setDiscountTab] = useState('coupon');
  const [discountType, setDiscountType] = useState('code');
  const [couponCode, setCouponCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  
  // Payment
  // Payment - only credit card now
  
  // Sidebar options
  const [autoAcceptsJob, setAutoAcceptsJob] = useState(true);
  const [excludeCancellationFee, setExcludeCancellationFee] = useState(false);
  const [excludeCancellationAfter1st, setExcludeCancellationAfter1st] = useState(false);
  
  const [excludeProviderNotification, setExcludeProviderNotification] = useState(false);
  const [hideChecklist, setHideChecklist] = useState(false);
  
  // Collapsible notes
  const [privateBookingNote, setPrivateBookingNote] = useState('');
  const [privateCustomerNote, setPrivateCustomerNote] = useState('');
  const [noteForProvider, setNoteForProvider] = useState('');
  const [bookingNoteOpen, setBookingNoteOpen] = useState(false);
  const [customerNoteOpen, setCustomerNoteOpen] = useState(false);
  const [providerNoteOpen, setProviderNoteOpen] = useState(false);

  const { data: existingCustomers = [] } = useCustomers();
  const { data: dbServices = [] } = useServices();
  const { data: staff = [] } = useStaff();
  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();
  const createCustomer = useCreateCustomer();
  
  const [sendingPaymentLink, setSendingPaymentLink] = useState(false);
  
  // Card on file - now using Stripe Elements
  const [chargingCard, setChargingCard] = useState(false);
  const [savedCardInfo, setSavedCardInfo] = useState<{ last4: string; brand: string; paymentMethodId?: string } | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  // Calculate price
  const calculatedPrice = useMemo(() => {
    if (!selectedService || !squareFootage) return 0;
    
    const sqFtIndex = getSqFtIndexFromValue(parseInt(squareFootage));
    let basePrice = getPriceForService(selectedService as CleaningServiceType, sqFtIndex);
    
    // Apply frequency discount
    const frequencyOption = frequencyOptions.find(f => f.id === frequency);
    if (frequencyOption && frequencyOption.discount > 0) {
      basePrice = basePrice * (1 - frequencyOption.discount);
    }
    
    // Add extras
    const extrasTotal = selectedExtras.reduce((sum, extraId) => {
      const extra = extras.find(e => e.id === extraId);
      return sum + (extra?.price || 0);
    }, 0);
    
    return Math.round(basePrice + extrasTotal);
  }, [selectedService, squareFootage, frequency, selectedExtras]);

  const finalPrice = adjustPrice && customPrice ? parseFloat(customPrice) : calculatedPrice;
  
  const estimatedDuration = useMemo(() => {
    if (adjustTime && customDuration) return parseInt(customDuration);
    
    // Base duration calculation
    let duration = 120; // 2 hours base
    const sqFt = parseInt(squareFootage) || 1000;
    
    if (sqFt > 2000) duration += 30;
    if (sqFt > 3000) duration += 30;
    if (sqFt > 4000) duration += 30;
    
    if (selectedService === 'deep_clean' || selectedService === 'move_in_out') {
      duration += 60;
    }
    if (selectedService === 'construction') {
      duration += 120;
    }
    
    // Add time for extras
    duration += selectedExtras.length * 15;
    
    return duration;
  }, [squareFootage, selectedService, selectedExtras, adjustTime, customDuration]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} Hr ${mins} Min`;
  };

  const toggleExtra = (extraId: string) => {
    setSelectedExtras(prev => 
      prev.includes(extraId) 
        ? prev.filter(id => id !== extraId)
        : [...prev, extraId]
    );
  };

  const resetForm = () => {
    // If we are editing, keep the dialog state clean for next open
    // (BookingsPage clears `booking` prop on close.)
    setCustomerType('new');
    setSelectedCustomerId('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setAptNumber('');
    setCity('');
    setState('');
    setZipCode('');
    setSelectedService('');
    setFrequency('one_time');
    setBedrooms('0');
    setBathrooms('1');
    setSquareFootage('');
    setSelectedExtras([]);
    setAdjustServiceTotal(false);
    setAdjustPrice(false);
    setAdjustTime(false);
    setCustomPrice('');
    setCustomDuration('');
    setScheduleType('manual');
    setSelectedStaffId('');
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setScheduledTime('09:00');
    setAccessMethod('someone_home');
    setKeepKeyWithProvider(false);
    setCustomerNoteForProvider('');
    setSpecialNotes('');
    setDiscountTab('coupon');
    setDiscountType('code');
    setCouponCode('');
    setDiscountAmount('');
    // Payment - credit card only
    setAutoAcceptsJob(true);
    setExcludeCancellationFee(false);
    setExcludeCancellationAfter1st(false);
    
    setExcludeProviderNotification(false);
    setHideChecklist(false);
    setPrivateBookingNote('');
    setPrivateCustomerNote('');
    setNoteForProvider('');
    setPaymentIntentId(null);
    setSavedCardInfo(null);
  };

  const handleSendPaymentLink = async () => {
    const customerEmail =
      customerType === 'existing'
        ? existingCustomers.find((c) => c.id === selectedCustomerId)?.email
        : email;

    if (!customerEmail) {
      toast({
        title: 'Error',
        description: 'Customer email is required to send payment link',
        variant: 'destructive',
      });
      return;
    }

    setSendingPaymentLink(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-payment-link', {
        body: {
          email: customerEmail,
          customerName:
            customerType === 'existing'
              ? `${existingCustomers.find((c) => c.id === selectedCustomerId)?.first_name} ${existingCustomers.find((c) => c.id === selectedCustomerId)?.last_name}`
              : `${firstName} ${lastName}`,
          amount: finalPrice,
          serviceName:
            cleaningServices.find((s) => s.id === selectedService)?.name ||
            'Cleaning Service',
          bookingId: booking?.id,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to send payment link');

      // Extra safety: if email delivery is delayed/blocked, still surface the URL to the admin.
      if (data?.paymentUrl) {
        try {
          await navigator.clipboard.writeText(String(data.paymentUrl));
          toast({
            title: 'Payment link sent',
            description: 'Email queued. The payment URL was copied to your clipboard.',
          });
        } catch {
          toast({
            title: 'Payment link sent',
            description: 'Email queued. (Could not copy URL automatically.)',
          });
        }
      } else {
        toast({ title: 'Payment link sent', description: 'Email queued successfully.' });
      }
    } catch (error: any) {
      console.error('Failed to send payment link:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to send payment link',
        variant: 'destructive',
      });
    } finally {
      setSendingPaymentLink(false);
    }
  };

  const getCustomerEmail = () => {
    return customerType === 'existing' 
      ? existingCustomers.find(c => c.id === selectedCustomerId)?.email || ''
      : email;
  };

  const getCustomerName = () => {
    return customerType === 'existing' 
      ? `${existingCustomers.find(c => c.id === selectedCustomerId)?.first_name || ''} ${existingCustomers.find(c => c.id === selectedCustomerId)?.last_name || ''}`.trim()
      : `${firstName} ${lastName}`.trim();
  };

  const handleCardSaved = (cardInfo: { last4: string; brand: string; paymentMethodId: string }) => {
    setSavedCardInfo({ last4: cardInfo.last4, brand: cardInfo.brand, paymentMethodId: cardInfo.paymentMethodId });
  };

  const handlePlaceHold = async () => {
    const customerEmail = customerType === 'existing' 
      ? existingCustomers.find(c => c.id === selectedCustomerId)?.email 
      : email;
    
    if (!customerEmail) {
      toast({ title: "Error", description: "Customer email required to place hold", variant: "destructive" });
      return;
    }
    
    if (!finalPrice || finalPrice < 0.50) {
      toast({ title: "Error", description: "Amount must be at least $0.50 to place a hold", variant: "destructive" });
      return;
    }
    
    setChargingCard(true);
    try {
      const serviceName = cleaningServices.find(s => s.id === selectedService)?.name || 'Cleaning Service';
      
      const { data, error } = await supabase.functions.invoke('charge-customer-card', {
        body: {
          email: customerEmail,
          amount: finalPrice,
          description: `${serviceName} - ${firstName || ''} ${lastName || ''}`.trim(),
        }
      });
      
      if (error) throw error;
      
      if (data.declined) {
        toast({ 
          title: "Card Declined", 
          description: data.error || "The card was declined. Please inform the client.", 
          variant: "destructive" 
        });
      } else if (data.success) {
        // Store the payment intent ID to save with the booking
        setPaymentIntentId(data.paymentIntentId);
        toast({ 
          title: "Hold Placed Successfully", 
          description: data.message || `Hold of $${finalPrice.toFixed(2)} placed on card. Will be charged after service.`
        });
      } else {
        toast({ 
          title: "Hold Failed", 
          description: data.error || "Failed to place hold on card", 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error('Failed to place hold:', error);
      toast({ title: "Hold Failed", description: error.message || "Failed to place hold on card. Please inform the client.", variant: "destructive" });
    } finally {
      setChargingCard(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    
    // Reset form when opening fresh (not editing)
    if (!booking) {
      resetForm();
      return;
    }

    // Prefill the same booking form for editing
    setCustomerType('existing');
    setSelectedCustomerId(booking.customer?.id || '');

    // Populate customer details from booking for display
    if (booking.customer) {
      setFirstName(booking.customer.first_name || '');
      setLastName(booking.customer.last_name || '');
      setEmail(booking.customer.email || '');
      setPhone(booking.customer.phone || '');
    }

    // Populate address fields from booking
    setAddress(booking.address || '');
    setCity(booking.city || '');
    setState(booking.state || '');
    setZipCode(booking.zip_code || '');

    if (booking.staff?.id) setSelectedStaffId(booking.staff.id);

    const d = new Date(booking.scheduled_at);
    setScheduledDate(format(d, 'yyyy-MM-dd'));
    setScheduledTime(format(d, 'HH:mm'));

    // Best-effort map service name back to pricing service type
    const serviceName = booking.service?.name?.toLowerCase() || '';
    const matched = cleaningServices.find((s) => serviceName.includes(s.name.toLowerCase()));
    if (matched) setSelectedService(matched.id as any);

    // Set duration
    if (booking.duration) {
      setAdjustTime(true);
      setCustomDuration(String(booking.duration));
    }

    setAdjustPrice(true);
    setCustomPrice(String(booking.total_amount ?? ''));

    // Put existing notes into Special Notes so they stay visible/editable
    setSpecialNotes(booking.notes || '');

    // Preserve payment intent if exists
    if (booking.payment_intent_id) {
      setPaymentIntentId(booking.payment_intent_id);
    }
  }, [open, booking]);

  const handleSubmit = async (e: React.FormEvent, saveType: 'booking' | 'draft' | 'quote' = 'booking') => {
    e.preventDefault();

    try {
      let customerId = selectedCustomerId;
      // Combine address with apt number if provided
      const fullAddress = aptNumber ? `${address}, ${aptNumber}` : address;
      let customerAddress = fullAddress;
      let customerCity = city;
      let customerState = state;
      let customerZip = zipCode;

      // In edit mode, we only allow selecting an existing customer
      if (!isEdit) {
        if (customerType === 'new') {
          const newCustomer = await createCustomer.mutateAsync({
            first_name: firstName,
            last_name: lastName,
            email,
            phone: phone || undefined,
            address: fullAddress || undefined,
            city: city || undefined,
            state: state || undefined,
            zip_code: zipCode || undefined,
          });
          customerId = newCustomer.id;
        } else {
          const existingCustomer = existingCustomers.find((c) => c.id === selectedCustomerId);
          if (existingCustomer) {
            customerAddress = existingCustomer.address || address;
            customerCity = existingCustomer.city || city;
            customerState = existingCustomer.state || state;
            customerZip = existingCustomer.zip_code || zipCode;
          }
        }
      }

      const serviceData = cleaningServices.find((s) => s.id === selectedService);
      const dbService =
        dbServices.find((s) =>
          s.name.toLowerCase().includes(String(selectedService).replace('_', ' ')),
        ) || dbServices[0];

      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();

      // Build comprehensive notes
      const notesParts = [
        serviceData?.name,
        `${squareFootage} sq ft`,
        `${bedrooms} bed / ${bathrooms} bath`,
        frequency !== 'one_time' ? `Frequency: ${frequencyOptions.find((f) => f.id === frequency)?.label}` : '',
        selectedExtras.length > 0 ? `Extras: ${selectedExtras.map((ex) => extras.find((e2) => e2.id === ex)?.name).join(', ')}` : '',
        accessMethod === 'someone_home' ? 'Someone will be at home' : accessMethod === 'hide_keys' ? 'Keys hidden' : '',
        keepKeyWithProvider ? 'Keep key with provider' : '',
        customerNoteForProvider,
        specialNotes,
        privateBookingNote ? `[Private] ${privateBookingNote}` : '',
        noteForProvider ? `[For Provider] ${noteForProvider}` : '',
      ]
        .filter(Boolean)
        .join('. ');

      if (isEdit && booking) {
        await updateBooking.mutateAsync({
          id: booking.id,
          customer_id: customerId || booking.customer?.id || undefined,
          service_id: dbService?.id || booking.service?.id || undefined,
          staff_id: selectedStaffId || undefined,
          scheduled_at: scheduledAt,
          duration: estimatedDuration || booking.duration,
          total_amount: finalPrice || booking.total_amount,
          notes: notesParts,
          address: customerAddress || undefined,
          city: customerCity || undefined,
          state: customerState || undefined,
          zip_code: customerZip || undefined,
          // Preserve existing payment state for edits
          payment_status: booking.payment_status,
          payment_intent_id: booking.payment_intent_id || undefined,
        } as any);

        toast({ title: 'Saved', description: 'Booking updated successfully' });
        resetForm();
        onOpenChange(false);
        return;
      }

      const status =
        saveType === 'draft'
          ? 'pending'
          : saveType === 'quote'
            ? 'pending'
            : autoAcceptsJob
              ? 'confirmed'
              : 'pending';

      await createBooking.mutateAsync({
        customer_id: customerId || undefined,
        service_id: dbService?.id,
        staff_id: selectedStaffId || undefined,
        scheduled_at: scheduledAt,
        duration: estimatedDuration,
        total_amount: finalPrice,
        status,
        payment_status: paymentIntentId ? 'partial' : 'pending',
        payment_intent_id: paymentIntentId || undefined,
        notes: notesParts,
        address: customerAddress || undefined,
        city: customerCity || undefined,
        state: customerState || undefined,
        zip_code: customerZip || undefined,
      });

      toast({
        title: 'Success',
        description:
          saveType === 'draft'
            ? 'Booking saved as draft'
            : saveType === 'quote'
              ? 'Quote created'
              : 'Booking created successfully',
      });

      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save booking:', error);
      toast({ title: 'Error', description: 'Failed to save booking', variant: 'destructive' });
    }
  };

  const isSubmitting = createBooking.isPending || updateBooking.isPending || createCustomer.isPending;
  
  const serviceInfo = cleaningServices.find(s => s.id === selectedService);
  const sqFtLabel = squareFootageRanges.find(r => r.maxSqFt === parseInt(squareFootage))?.label || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden p-0">
        <div className="flex h-[90vh]">
          {/* Main Form */}
          <div className="flex-1 overflow-y-auto p-6">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl font-semibold">
                {isEdit && booking ? `Edit Booking #${booking.booking_number}` : 'New Booking'}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={(e) => handleSubmit(e, 'booking')} className="space-y-8">
              {/* Location Section */}
              <section>
                <h3 className="text-lg font-semibold mb-4">Where Will The Service Be Taking Place?</h3>
                <div className="space-y-2">
                  <Label>Enter Zip Code For Pricing</Label>
                  <Input
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="Zip Code"
                    className="max-w-xs"
                  />
                </div>
              </section>

              {/* Customer Details */}
              <section>
                <h3 className="text-lg font-semibold mb-4">Customer Details</h3>
                
                <RadioGroup 
                  value={customerType} 
                  onValueChange={(v) => setCustomerType(v as 'new' | 'existing')}
                  className="flex gap-4 mb-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="new" id="new-customer" />
                    <Label htmlFor="new-customer">New customer</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="existing-customer" />
                    <Label htmlFor="existing-customer">Existing customer</Label>
                  </div>
                </RadioGroup>

                {customerType === 'existing' ? (
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingCustomers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.first_name} {customer.last_name} - {customer.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="grid grid-cols-2 gap-4 max-w-2xl">
                    <div className="space-y-2">
                      <Label>First name</Label>
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Ex: James"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last name</Label>
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Ex: Lee"
                        required
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Email address</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ex: example@xyz.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Phone number"
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Address</Label>
                      <AddressAutocomplete
                        value={address}
                        onChange={setAddress}
                        onAddressSelect={(components) => {
                          setAddress(components.address);
                          setCity(components.city);
                          setState(components.state);
                          setZipCode(components.zipCode);
                        }}
                        placeholder="Start typing an address..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Apt/Suite #</Label>
                      <Input
                        value={aptNumber}
                        onChange={(e) => setAptNumber(e.target.value)}
                        placeholder="Apt, Suite, Unit, etc."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* Service Type */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Service Type</h3>
                <p className="text-sm mb-4">
                  Keep in mind that your FIRST CLEAN will be a <strong>deep clean</strong>.
                </p>
                
                <div className="space-y-2">
                  <Label>Services</Label>
                  <Select value={selectedService} onValueChange={(v) => setSelectedService(v as CleaningServiceType)}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      {cleaningServices.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>


              {/* Frequency Selection */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Frequency</h3>
                <div className="space-y-2">
                  <Label>How often?</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencyOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              {/* Service Details */}
              <section>
                <h3 className="text-lg font-semibold mb-4">Service Details</h3>
                
                <div className="grid grid-cols-3 gap-4 max-w-2xl">
                  <div className="space-y-2">
                    <Label>Bedrooms</Label>
                    <Select value={bedrooms} onValueChange={setBedrooms}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {bedroomOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Bathrooms</Label>
                    <Select value={bathrooms} onValueChange={setBathrooms}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {bathroomOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sq Ft</Label>
                    <Select value={squareFootage} onValueChange={setSquareFootage}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {squareFootageRanges.map((range) => (
                          <SelectItem key={range.maxSqFt} value={range.maxSqFt.toString()}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              {/* Schedule Date & Time */}
              <section>
                <h3 className="text-lg font-semibold mb-4">Schedule Date & Time</h3>
                <div className="grid grid-cols-2 gap-4 max-w-2xl">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !scheduledDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {scheduledDate ? format(new Date(scheduledDate), "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={scheduledDate ? new Date(scheduledDate) : undefined}
                          onSelect={(date) => date && setScheduledDate(date.toISOString().split('T')[0])}
                          disabled={(date) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return date < today;
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Select value={scheduledTime} onValueChange={setScheduledTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select time" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          { value: '07:00', label: '7:00 AM' },
                          { value: '07:30', label: '7:30 AM' },
                          { value: '08:00', label: '8:00 AM' },
                          { value: '08:30', label: '8:30 AM' },
                          { value: '09:00', label: '9:00 AM' },
                          { value: '09:30', label: '9:30 AM' },
                          { value: '10:00', label: '10:00 AM' },
                          { value: '10:30', label: '10:30 AM' },
                          { value: '11:00', label: '11:00 AM' },
                          { value: '11:30', label: '11:30 AM' },
                          { value: '12:00', label: '12:00 PM' },
                          { value: '12:30', label: '12:30 PM' },
                          { value: '13:00', label: '1:00 PM' },
                          { value: '13:30', label: '1:30 PM' },
                          { value: '14:00', label: '2:00 PM' },
                          { value: '14:30', label: '2:30 PM' },
                          { value: '15:00', label: '3:00 PM' },
                          { value: '15:30', label: '3:30 PM' },
                          { value: '16:00', label: '4:00 PM' },
                          { value: '16:30', label: '4:30 PM' },
                          { value: '17:00', label: '5:00 PM' },
                          { value: '17:30', label: '5:30 PM' },
                          { value: '18:00', label: '6:00 PM' },
                          { value: '18:30', label: '6:30 PM' },
                          { value: '19:00', label: '7:00 PM' },
                          { value: '19:30', label: '7:30 PM' },
                          { value: '20:00', label: '8:00 PM' },
                        ].map((time) => (
                          <SelectItem key={time.value} value={time.value}>
                            {time.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              {/* Select Extras */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Select Extras</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  If you have extras, you can set them up here and charge a price for them or not. You can turn this description off or modify it at anytime.
                </p>
                
                <div className="flex flex-wrap gap-4">
                  {extras.map((extra) => (
                    <button
                      key={extra.id}
                      type="button"
                      onClick={() => toggleExtra(extra.id)}
                      className={cn(
                        "flex flex-col items-center p-4 rounded-lg border-2 transition-all min-w-[100px]",
                        selectedExtras.includes(extra.id)
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="text-muted-foreground mb-2">
                        {extraIcons[extra.id]}
                      </div>
                      <span className="text-sm font-medium text-center">{extra.name}</span>
                      {extra.note && (
                        <span className="text-xs text-muted-foreground mt-1">{extra.note}</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              {/* Booking Adjustments */}
              <section>
                <h3 className="text-lg font-semibold mb-4">Booking Adjustments</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="adjust-total" 
                      checked={adjustServiceTotal}
                      onCheckedChange={(c) => setAdjustServiceTotal(!!c)}
                    />
                    <Label htmlFor="adjust-total">Do you want to adjust service total?</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="adjust-price" 
                      checked={adjustPrice}
                      onCheckedChange={(c) => setAdjustPrice(!!c)}
                    />
                    <Label htmlFor="adjust-price">Do you want to adjust price?</Label>
                  </div>
                  {adjustPrice && (
                    <Input 
                      type="number"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      placeholder="Enter custom price"
                      className="max-w-xs ml-6"
                    />
                  )}
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="adjust-time" 
                      checked={adjustTime}
                      onCheckedChange={(c) => setAdjustTime(!!c)}
                    />
                    <Label htmlFor="adjust-time">Do you want to adjust time?</Label>
                  </div>
                  {adjustTime && (
                    <Input 
                      type="number"
                      value={customDuration}
                      onChange={(e) => setCustomDuration(e.target.value)}
                      placeholder="Duration in minutes"
                      className="max-w-xs ml-6"
                    />
                  )}
                </div>
              </section>


              {/* Key Information & Job Notes */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Key Information & Job Notes</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  You can turn this description off or modify it at anytime.
                </p>
                
                <RadioGroup 
                  value={accessMethod} 
                  onValueChange={setAccessMethod}
                  className="flex flex-wrap gap-4 mb-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="someone_home" id="someone-home" />
                    <Label htmlFor="someone-home">Someone Will Be At Home</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="hide_keys" id="hide-keys" />
                    <Label htmlFor="hide-keys">I Will Hide The Keys</Label>
                  </div>
                </RadioGroup>
                
                <div className="flex items-center space-x-2 mb-4">
                  <Checkbox 
                    id="keep-key" 
                    checked={keepKeyWithProvider}
                    onCheckedChange={(c) => setKeepKeyWithProvider(!!c)}
                  />
                  <Label htmlFor="keep-key">Keep Key With Provider</Label>
                </div>
                
                <div className="space-y-2">
                  <Label>Customer Note For Provider</Label>
                  <Textarea
                    value={customerNoteForProvider}
                    onChange={(e) => setCustomerNoteForProvider(e.target.value)}
                    placeholder="Special Notes And Instructions"
                    rows={3}
                  />
                </div>
              </section>

              {/* Special Notes */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Special Notes Or Instructions</h3>
                <Label className="mb-2">Would You Like To Add Any Notes?</Label>
                <Textarea
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  placeholder="Special Notes Or Instructions"
                  rows={3}
                />
              </section>

              {/* Coupon/Gift Cards */}
              <section>
                <Tabs value={discountTab} onValueChange={setDiscountTab} className="max-w-xl">
                  <TabsList>
                    <TabsTrigger value="coupon">Coupon Code</TabsTrigger>
                    <TabsTrigger value="gift">Gift Cards</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="coupon" className="space-y-4 mt-4">
                    <RadioGroup 
                      value={discountType} 
                      onValueChange={setDiscountType}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="code" id="coupon-code" />
                        <Label htmlFor="coupon-code">Coupon Code</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="amount" id="amount" />
                        <Label htmlFor="amount">Amount</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="percent" id="percent" />
                        <Label htmlFor="percent">% Amount</Label>
                      </div>
                    </RadioGroup>
                    
                    <div className="flex gap-2">
                      <Input
                        value={discountType === 'code' ? couponCode : discountAmount}
                        onChange={(e) => discountType === 'code' ? setCouponCode(e.target.value) : setDiscountAmount(e.target.value)}
                        placeholder={discountType === 'code' ? "Enter Coupon Code" : "Enter amount"}
                        className="flex-1"
                      />
                      <Button type="button" variant="secondary">Apply</Button>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="gift" className="mt-4">
                    <div className="flex gap-2">
                      <Input placeholder="Enter gift card code" className="flex-1" />
                      <Button type="button" variant="secondary">Apply</Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </section>


              {/* Payment Information */}
              <section>
                <h3 className="text-lg font-semibold mb-2">Payment Information</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  A hold will be placed on the card. Payment captured after service completion.
                </p>
                
                <div className="p-4 border rounded-lg max-w-md space-y-4">
                  {savedCardInfo ? (
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CreditCard className="w-5 h-5 text-emerald-600" />
                      <div>
                        <p className="font-medium text-emerald-800">
                          {savedCardInfo.brand} •••• {savedCardInfo.last4}
                        </p>
                        <p className="text-xs text-emerald-600">Card on file</p>
                      </div>
                      <Check className="w-5 h-5 text-emerald-600 ml-auto" />
                    </div>
                  ) : (
                    <>
                      {getCustomerEmail() && getCustomerName() ? (
                        <StripeCardForm
                          email={getCustomerEmail()}
                          customerName={getCustomerName()}
                          onCardSaved={handleCardSaved}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Please enter customer details first to save a card.
                        </p>
                      )}
                    </>
                  )}
                  
                  <Button 
                    type="button" 
                    className="w-full bg-amber-500 hover:bg-amber-600"
                    onClick={handlePlaceHold}
                    disabled={chargingCard || !savedCardInfo}
                  >
                    {chargingCard ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Place Hold for ${finalPrice.toFixed(2)}
                  </Button>
                </div>
              </section>
            </form>
          </div>

          {/* Sidebar */}
          <div className="w-80 border-l bg-muted/30 p-6 overflow-y-auto">
            {/* Booking Summary */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Booking Summary</h3>
                <Button variant="ghost" size="icon">
                  <Minus className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Industry</span>
                  <span className="font-medium">Home Cleaning</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service</span>
                  <span className="font-medium">{serviceInfo?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frequency</span>
                  <span className="font-medium">{frequencyOptions.find(f => f.id === frequency)?.label || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bedrooms</span>
                  <span className="font-medium">{bedrooms}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bathrooms</span>
                  <span className="font-medium">{bathrooms}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sq Ft</span>
                  <span className="font-medium">{sqFtLabel || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Length</span>
                  <span className="font-medium">{formatDuration(estimatedDuration)}</span>
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Payment Summary</h3>
                <Button variant="ghost" size="icon">
                  <Minus className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Total</span>
                  <span className="font-medium">${calculatedPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discounted Total</span>
                  <span className="font-medium">${finalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-semibold">TOTAL</span>
                  <span className="font-bold text-lg">${finalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Collapsible Notes */}
            <div className="space-y-2 mb-6">
              <Collapsible open={bookingNoteOpen} onOpenChange={setBookingNoteOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50">
                  <span className="font-medium">Private Booking Note</span>
                  <Plus className="w-4 h-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Textarea 
                    value={privateBookingNote}
                    onChange={(e) => setPrivateBookingNote(e.target.value)}
                    placeholder="Add private booking note..."
                    rows={2}
                  />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={customerNoteOpen} onOpenChange={setCustomerNoteOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50">
                  <span className="font-medium">Private Customer Note</span>
                  <Plus className="w-4 h-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Textarea 
                    value={privateCustomerNote}
                    onChange={(e) => setPrivateCustomerNote(e.target.value)}
                    placeholder="Add private customer note..."
                    rows={2}
                  />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={providerNoteOpen} onOpenChange={setProviderNoteOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50">
                  <span className="font-medium">Note For Service Provider</span>
                  <Plus className="w-4 h-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Textarea 
                    value={noteForProvider}
                    onChange={(e) => setNoteForProvider(e.target.value)}
                    placeholder="Add note for provider..."
                    rows={2}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Booking Options */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="auto-accept" 
                  checked={autoAcceptsJob}
                  onCheckedChange={(c) => setAutoAcceptsJob(!!c)}
                />
                <Label htmlFor="auto-accept" className="text-sm">Automatically accepts job</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="exclude-cancel" 
                  checked={excludeCancellationFee}
                  onCheckedChange={(c) => setExcludeCancellationFee(!!c)}
                />
                <Label htmlFor="exclude-cancel" className="text-sm">Exclude cancellation fee</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="exclude-cancel-1st" 
                  checked={excludeCancellationAfter1st}
                  onCheckedChange={(c) => setExcludeCancellationAfter1st(!!c)}
                />
                <Label htmlFor="exclude-cancel-1st" className="text-sm">Exclude cancellation after 1st appt fee</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="exclude-provider-notif" 
                  checked={excludeProviderNotification}
                  onCheckedChange={(c) => setExcludeProviderNotification(!!c)}
                />
                <Label htmlFor="exclude-provider-notif" className="text-sm">Don't notify provider of booking changes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="hide-checklist" 
                  checked={hideChecklist}
                  onCheckedChange={(c) => setHideChecklist(!!c)}
                />
                <Label htmlFor="hide-checklist" className="text-sm">Hide checklist</Label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {isEdit && (
                <Button 
                  className="w-full bg-blue-500 hover:bg-blue-600" 
                  onClick={(e) => handleSubmit(e, 'booking')}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Update Booking
                </Button>
              )}
              {!isEdit && (
                <>
                  <Button 
                    className="w-full bg-emerald-500 hover:bg-emerald-600" 
                    onClick={(e) => handleSubmit(e, 'booking')}
                    disabled={isSubmitting || !selectedService || !squareFootage}
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Booking
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="w-full bg-teal-500 hover:bg-teal-600 text-white"
                    onClick={(e) => handleSubmit(e, 'draft')}
                    disabled={isSubmitting}
                  >
                    Save As Draft
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full border-orange-400 text-orange-500 hover:bg-orange-50"
                    onClick={(e) => handleSubmit(e, 'quote')}
                    disabled={isSubmitting}
                  >
                    Save As Quote
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}