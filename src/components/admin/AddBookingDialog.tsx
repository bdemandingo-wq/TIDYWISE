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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format, addWeeks, addMonths } from 'date-fns';
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
  RefreshCw,
  Save,
  Copy,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCustomers, useServices, useStaff, useCreateBooking, useUpdateBooking, useCreateCustomer, BookingWithDetails } from '@/hooks/useBookings';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { CustomerSearchInput } from '@/components/admin/CustomerSearchInput';
import { 
  squareFootageRanges, 
  extras as extrasData, 
  frequencyOptions, 
  bedroomOptions, 
  bathroomOptions,
  cleaningServices,
  CleaningServiceType
} from '@/data/pricingData';

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  booking?: BookingWithDetails | null;
  onDuplicate?: (booking: BookingWithDetails) => void;
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

export function AddBookingDialog({ open, onOpenChange, defaultDate, booking, onDuplicate }: AddBookingDialogProps) {
  const { data: customers = [] } = useCustomers();
  const { data: services = [] } = useServices();
  const { data: staff = [] } = useStaff();
  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();
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
  
  // New form fields
  const [address, setAddress] = useState('');
  const [aptSuite, setAptSuite] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [frequency, setFrequency] = useState('one_time');
  const [bedrooms, setBedrooms] = useState('1');
  const [bathrooms, setBathrooms] = useState('1');
  const [squareFootage, setSquareFootage] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);

  // Card state
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [chargingCard, setChargingCard] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeErrorType, setChargeErrorType] = useState<'insufficient_funds' | 'declined' | 'other' | null>(null);
  const [sendingLink, setSendingLink] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const selectedService = services.find(s => s.id === selectedServiceId);
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  
  // Get customer email for card operations
  const customerEmail = customerTab === 'existing' && selectedCustomer 
    ? selectedCustomer.email 
    : newCustomer.email;

  const customerName = customerTab === 'existing' && selectedCustomer
    ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
    : `${newCustomer.first_name} ${newCustomer.last_name}`;

  // Pre-fill form when editing a booking
  useEffect(() => {
    if (booking && open) {
      // Customer
      if (booking.customer) {
        setCustomerTab('existing');
        setSelectedCustomerId(booking.customer.id);
      }
      
      // Service
      if (booking.service) {
        setSelectedServiceId(booking.service.id);
      }
      
      // Staff
      if (booking.staff) {
        setSelectedStaffId(booking.staff.id);
      }
      
      // Date and time
      const scheduledDate = new Date(booking.scheduled_at);
      setSelectedDate(scheduledDate);
      const hours = scheduledDate.getHours();
      const minutes = scheduledDate.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      setSelectedTime(`${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`);
      
      // Other fields
      setNotes(booking.notes || '');
      setTotalAmount(booking.total_amount || 0);
      setAddress(booking.address || '');
      setAptSuite(booking.apt_suite || '');
      setCity(booking.city || '');
      setState(booking.state || '');
      setZipCode(booking.zip_code || '');
      setFrequency(booking.frequency || 'one_time');
      setBedrooms(booking.bedrooms || '1');
      setBathrooms(booking.bathrooms || '1');
      setSquareFootage(booking.square_footage || '');
      setSelectedExtras(booking.extras || []);
    } else if (!booking && open) {
      // Reset for new booking but keep defaultDate
      if (defaultDate) {
        setSelectedDate(defaultDate);
      }
    }
  }, [booking, open, defaultDate]);

  // Update total when service, square footage, or frequency changes (only if not editing)
  useEffect(() => {
    if (!booking && selectedService) {
      // Find matching cleaning service from pricing data
      const serviceName = selectedService.name.toLowerCase();
      let matchedService = cleaningServices.find(s => serviceName.includes(s.name.toLowerCase().split(' ')[0]));
      
      // Try to match by specific keywords
      if (!matchedService) {
        if (serviceName.includes('deep')) matchedService = cleaningServices.find(s => s.id === 'deep_clean');
        else if (serviceName.includes('move')) matchedService = cleaningServices.find(s => s.id === 'move_in_out');
        else if (serviceName.includes('construction')) matchedService = cleaningServices.find(s => s.id === 'construction');
        else if (serviceName.includes('standard') || serviceName.includes('clean')) matchedService = cleaningServices.find(s => s.id === 'standard_clean');
      }
      
      if (matchedService && squareFootage) {
        // Get the index based on selected square footage
        const sqFtIndex = squareFootageRanges.findIndex(r => r.label === squareFootage);
        if (sqFtIndex !== -1) {
          let basePrice = matchedService.prices[sqFtIndex];
          
          // Apply frequency discount for standard cleaning
          const freqOption = frequencyOptions.find(f => f.id === frequency);
          if (freqOption && freqOption.discount > 0 && matchedService.id === 'standard_clean') {
            basePrice = Math.round(basePrice * (1 - freqOption.discount));
          }
          
          // Add extras
          const extrasTotal = selectedExtras.reduce((sum, extraId) => {
            const extra = extrasData.find(e => e.id === extraId);
            return sum + (extra?.price || 0);
          }, 0);
          
          setTotalAmount(basePrice + extrasTotal);
        }
      } else if (!squareFootage) {
        // Fall back to service base price
        setTotalAmount(selectedService.price);
      }
    }
  }, [selectedService, squareFootage, frequency, selectedExtras, booking]);

  // Auto-fill property details when existing customer is selected
  useEffect(() => {
    if (customerTab === 'existing' && selectedCustomer && !booking) {
      setAddress(selectedCustomer.address || '');
      setCity(selectedCustomer.city || '');
      setState(selectedCustomer.state || '');
      setZipCode(selectedCustomer.zip_code || '');
    }
  }, [selectedCustomerId, selectedCustomer, customerTab, booking]);

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
    if (!customerEmail) {
      toast.error('Please select a customer first');
      return;
    }
    
    if (!totalAmount || totalAmount < 0.50) {
      toast.error('Amount must be at least $0.50 to charge a card');
      return;
    }

    setChargingCard(true);
    setChargeError(null);
    setChargeErrorType(null);

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
        const declineCode = data.declineCode;
        let friendlyMessage = data.error;
        let errorType: 'insufficient_funds' | 'declined' | 'other' = 'other';
        
        switch (declineCode) {
          case 'insufficient_funds':
            friendlyMessage = 'Insufficient Funds';
            errorType = 'insufficient_funds';
            break;
          case 'card_declined':
            friendlyMessage = 'Card Declined';
            errorType = 'declined';
            break;
          case 'expired_card':
            friendlyMessage = 'Card Expired';
            errorType = 'declined';
            break;
          case 'incorrect_cvc':
            friendlyMessage = 'Incorrect CVC';
            errorType = 'declined';
            break;
          case 'processing_error':
            friendlyMessage = 'Processing Error - Try Again';
            errorType = 'other';
            break;
          case 'lost_card':
          case 'stolen_card':
            friendlyMessage = 'Card Reported Lost/Stolen';
            errorType = 'declined';
            break;
          default:
            friendlyMessage = data.error || 'Card Declined';
            errorType = 'declined';
        }
        
        setChargeError(friendlyMessage);
        setChargeErrorType(errorType);
        toast.error(friendlyMessage);
        return null;
      } else {
        throw new Error(data.error || 'Failed to charge card');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to charge card';
      setChargeError(errorMessage);
      setChargeErrorType('other');
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

  const buildBookingData = async (isDraft: boolean) => {
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

    const scheduledAt = new Date(selectedDate!);
    scheduledAt.setHours(hour24, minutes, 0, 0);

    return {
      customer_id: customerId || null,
      service_id: selectedServiceId && selectedServiceId.length > 0 ? selectedServiceId : null,
      staff_id: selectedStaffId && selectedStaffId.length > 0 ? selectedStaffId : null,
      scheduled_at: scheduledAt.toISOString(),
      duration: selectedService?.duration || 60,
      total_amount: totalAmount,
      status: isDraft ? 'pending' as const : 'confirmed' as const,
      payment_status: 'pending' as const,
      notes: notes || null,
      address: address || null,
      apt_suite: aptSuite || null,
      city: city || null,
      state: state || null,
      zip_code: zipCode || null,
      frequency: frequency,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      square_footage: squareFootage || null,
      extras: selectedExtras,
      is_draft: isDraft,
    };
  };

  const createRecurringBookings = async (baseBookingData: any) => {
    if (frequency === 'one_time') return;

    const bookingsToCreate: any[] = [];
    const baseDate = new Date(baseBookingData.scheduled_at);
    
    // Create 3 bookings in advance for all recurring frequencies
    const numBookings = 3;
    
    for (let i = 1; i <= numBookings; i++) {
      let nextDate: Date;
      if (frequency === 'weekly') {
        nextDate = addWeeks(baseDate, i);
      } else if (frequency === 'biweekly') {
        nextDate = addWeeks(baseDate, i * 2);
      } else {
        // monthly
        nextDate = addMonths(baseDate, i);
      }

      bookingsToCreate.push({
        ...baseBookingData,
        scheduled_at: nextDate.toISOString(),
        payment_intent_id: null, // Each booking needs its own payment
      });
    }

    // Create all recurring bookings
    for (const bookingData of bookingsToCreate) {
      await createBooking.mutateAsync(bookingData);
    }
  };

  const handleSubmit = async (isDraft: boolean = false) => {
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

    if (isDraft) {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }

    try {
      const bookingData = await buildBookingData(isDraft);

      // Only update when we have a real booking id.
      // Duplicates prefill the form with a booking object but without an id.
      if (booking?.id) {
        // Update existing booking
        await updateBooking.mutateAsync({
          id: booking.id,
          ...bookingData,
        });
        toast.success('Booking updated successfully');
      } else {
        // Attempt to charge card if customer has one and not a draft
        let paymentIntentId: string | undefined;
        if (!isDraft && cardInfo?.hasCard) {
          const result = await handleChargeCard();
          if (result) {
            paymentIntentId = result;
          }
        }

        const finalBookingData = {
          ...bookingData,
          payment_status: paymentIntentId ? 'partial' as const : 'pending' as const,
          payment_intent_id: paymentIntentId,
        };

        await createBooking.mutateAsync(finalBookingData);

        // Create recurring bookings if applicable
        if (!isDraft && frequency !== 'one_time') {
          await createRecurringBookings(finalBookingData);
          toast.success(`Booking created with ${frequency} recurring schedule`);
        } else {
          toast.success(isDraft ? 'Draft quote saved' : 'Booking created successfully');
        }

        // Send admin notification email
        if (!isDraft) {
          try {
            await supabase.functions.invoke('send-admin-booking-notification', {
              body: {
                customerName: customerName,
                customerEmail: customerEmail,
                serviceName: selectedService?.name,
                scheduledAt: bookingData.scheduled_at,
                totalAmount: totalAmount,
                address: address,
              }
            });
          } catch (emailError) {
            console.error('Failed to send admin notification:', emailError);
          }
        }
      }

      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving booking:', error);
      toast.error(error.message || 'Failed to save booking');
    } finally {
      setSubmitting(false);
      setSavingDraft(false);
    }
  };

  const handleDuplicate = () => {
    if (!booking) return;
    
    // Create a copy of the booking data for duplication
    const duplicateBooking = {
      ...booking,
      id: undefined,
      booking_number: undefined,
      payment_intent_id: null,
      payment_status: 'pending' as const,
    };
    
    onDuplicate?.(duplicateBooking as BookingWithDetails);
    toast.success('Booking duplicated - adjust the date and save');
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
    setAddress('');
    setAptSuite('');
    setCity('');
    setState('');
    setZipCode('');
    setFrequency('one_time');
    setBedrooms('1');
    setBathrooms('1');
    setSquareFootage('');
    setSelectedExtras([]);
    setCardInfo(null);
    setChargeError(null);
  };

  const toggleExtra = (extraId: string) => {
    setSelectedExtras(prev => 
      prev.includes(extraId) 
        ? prev.filter(id => id !== extraId)
        : [...prev, extraId]
    );
  };

  // Calculate extras total
  const extrasTotal = selectedExtras.reduce((sum, extraId) => {
    const extra = extrasData.find(e => e.id === extraId);
    return sum + (extra?.price || 0);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {booking ? 'Edit Booking' : 'New Booking'}
            {booking?.is_draft && <Badge variant="secondary">Draft</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 - Customer */}
          <div className="space-y-6">
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
                    <CustomerSearchInput
                      customers={customers}
                      selectedCustomerId={selectedCustomerId}
                      onSelectCustomer={setSelectedCustomerId}
                      placeholder="Type to search customers..."
                    />
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
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Property Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Property Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Address</Label>
                  <AddressAutocomplete
                    value={address}
                    onChange={setAddress}
                    onAddressSelect={(addressData) => {
                      setAddress(addressData.address);
                      setCity(addressData.city);
                      setState(addressData.state);
                      setZipCode(addressData.zipCode);
                    }}
                    placeholder="Start typing address..."
                  />
                </div>
                <div>
                  <Label htmlFor="aptSuite">Apt / Suite</Label>
                  <Input
                    id="aptSuite"
                    value={aptSuite}
                    onChange={(e) => setAptSuite(e.target.value)}
                    placeholder="Apt 4B"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="zipCode">ZIP</Label>
                    <Input
                      id="zipCode"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Column 2 - Service & Extras */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Service</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Service Type</Label>
                  <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Square Footage</Label>
                  <Select value={squareFootage} onValueChange={setSquareFootage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sq ft range" />
                    </SelectTrigger>
                    <SelectContent>
                      {squareFootageRanges.map((range) => (
                        <SelectItem key={range.label} value={range.label}>
                          {range.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
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
                  <div>
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
                </div>

                <div>
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencyOptions.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="totalAmount">Adjust Total Amount</Label>
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

            {/* Extras */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Extras</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {extrasData.map((extra) => (
                    <div 
                      key={extra.id}
                      className={cn(
                        "flex items-center space-x-2 p-2 rounded-lg border cursor-pointer transition-colors",
                        selectedExtras.includes(extra.id) 
                          ? "border-primary bg-primary/10" 
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => toggleExtra(extra.id)}
                    >
                      <Checkbox 
                        checked={selectedExtras.includes(extra.id)}
                        onCheckedChange={() => toggleExtra(extra.id)}
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-medium">{extra.name}</p>
                        <p className="text-muted-foreground">${extra.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {extrasTotal > 0 && (
                  <div className="mt-3 pt-3 border-t text-sm">
                    Extras Total: <span className="font-semibold">${extrasTotal}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Column 3 - Schedule & Payment */}
          <div className="space-y-6">
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
                      <div className={cn(
                        "flex flex-col gap-2 p-4 rounded-lg border-2",
                        chargeErrorType === 'insufficient_funds' 
                          ? "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-800"
                          : "bg-destructive/10 border-destructive/20"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex items-center justify-center w-10 h-10 rounded-full",
                            chargeErrorType === 'insufficient_funds'
                              ? "bg-red-100 dark:bg-red-900/50"
                              : "bg-destructive/20"
                          )}>
                            <AlertCircle className={cn(
                              "h-6 w-6",
                              chargeErrorType === 'insufficient_funds'
                                ? "text-red-600 dark:text-red-400"
                                : "text-destructive"
                            )} />
                          </div>
                          <div>
                            <p className={cn(
                              "font-semibold text-base",
                              chargeErrorType === 'insufficient_funds'
                                ? "text-red-700 dark:text-red-300"
                                : "text-destructive"
                            )}>
                              {chargeError}
                            </p>
                            {chargeErrorType === 'insufficient_funds' && (
                              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                The card does not have enough funds
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                          onClick={handleSendCardLink}
                          disabled={sendingLink}
                        >
                          {sendingLink ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Send Link to Update Card
                        </Button>
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
        
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-lg font-semibold">
            Total: <span className="text-primary">${(totalAmount + extrasTotal).toFixed(2)}</span>
            {extrasTotal > 0 && (
              <span className="text-sm text-muted-foreground ml-2">
                (${totalAmount} + ${extrasTotal} extras)
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            
            {booking && (
              <Button variant="outline" onClick={handleDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </Button>
            )}
            
            <Button 
              variant="secondary" 
              onClick={() => handleSubmit(true)} 
              disabled={savingDraft || submitting}
            >
              {savingDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <FileText className="mr-2 h-4 w-4" />
              Save as Draft
            </Button>
            
            <Button onClick={() => handleSubmit(false)} disabled={submitting || savingDraft}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              {booking ? 'Update Booking' : 'Save Booking'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
