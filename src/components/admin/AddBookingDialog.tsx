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
  FileText,
  Plus,
  Sparkles
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-background via-background to-secondary/20 border-border/50">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
              <CalendarIcon className="h-5 w-5 text-primary" />
            </div>
            <span>{booking ? 'Edit Booking' : 'New Booking'}</span>
            {booking?.is_draft && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
                Draft
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-2">
          {/* Column 1 - Customer */}
          <div className="space-y-5">
            <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card/80 overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-blue-500/5 to-transparent">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  Customer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={customerTab} onValueChange={(v) => setCustomerTab(v as 'existing' | 'new')}>
                  <TabsList className="grid w-full grid-cols-2 h-10 p-1 bg-secondary/50">
                    <TabsTrigger value="existing" className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md text-sm">
                      Existing
                    </TabsTrigger>
                    <TabsTrigger value="new" className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md text-sm">
                      New Customer
                    </TabsTrigger>
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
                        <Label htmlFor="firstName" className="text-xs font-medium text-muted-foreground">First Name</Label>
                        <Input
                          id="firstName"
                          value={newCustomer.first_name}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, first_name: e.target.value }))}
                          placeholder="John"
                          className="mt-1.5 h-10 bg-secondary/30 border-border/50 focus:border-primary/50"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName" className="text-xs font-medium text-muted-foreground">Last Name</Label>
                        <Input
                          id="lastName"
                          value={newCustomer.last_name}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, last_name: e.target.value }))}
                          placeholder="Doe"
                          className="mt-1.5 h-10 bg-secondary/30 border-border/50 focus:border-primary/50"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="john@example.com"
                        className="mt-1.5 h-10 bg-secondary/30 border-border/50 focus:border-primary/50"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground">Phone</Label>
                      <Input
                        id="phone"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="(555) 123-4567"
                        className="mt-1.5 h-10 bg-secondary/30 border-border/50 focus:border-primary/50"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Property Details */}
            <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card/80 overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-emerald-500/5 to-transparent">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  Property Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Address</Label>
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
                  <Label htmlFor="aptSuite" className="text-xs font-medium text-muted-foreground">Apt / Suite</Label>
                  <Input
                    id="aptSuite"
                    value={aptSuite}
                    onChange={(e) => setAptSuite(e.target.value)}
                    placeholder="Apt 4B"
                    className="mt-1.5 h-10 bg-secondary/30 border-border/50 focus:border-primary/50"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="city" className="text-xs font-medium text-muted-foreground">City</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="mt-1.5 h-10 bg-secondary/30 border-border/50 focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state" className="text-xs font-medium text-muted-foreground">State</Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="mt-1.5 h-10 bg-secondary/30 border-border/50 focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="zipCode" className="text-xs font-medium text-muted-foreground">ZIP</Label>
                    <Input
                      id="zipCode"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="mt-1.5 h-10 bg-secondary/30 border-border/50 focus:border-primary/50"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Column 2 - Service & Extras */}
          <div className="space-y-5">
            <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card/80 overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-purple-500/5 to-transparent">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  Service
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Service Type</Label>
                  <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                    <SelectTrigger className="mt-1.5 h-10 bg-secondary/30 border-border/50">
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Square Footage</Label>
                  <Select value={squareFootage} onValueChange={setSquareFootage}>
                    <SelectTrigger className="mt-1.5 h-10 bg-secondary/30 border-border/50">
                      <SelectValue placeholder="Select sq ft range" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
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
                    <Label className="text-xs font-medium text-muted-foreground">Bedrooms</Label>
                    <Select value={bedrooms} onValueChange={setBedrooms}>
                      <SelectTrigger className="mt-1.5 h-10 bg-secondary/30 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {bedroomOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Bathrooms</Label>
                    <Select value={bathrooms} onValueChange={setBathrooms}>
                      <SelectTrigger className="mt-1.5 h-10 bg-secondary/30 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {bathroomOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger className="mt-1.5 h-10 bg-secondary/30 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {frequencyOptions.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="totalAmount" className="text-xs font-medium text-muted-foreground">Adjust Total Amount</Label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                    <Input
                      id="totalAmount"
                      type="number"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(Number(e.target.value))}
                      className="h-12 pl-7 text-xl font-bold bg-gradient-to-r from-primary/5 to-accent/5 border-primary/30 focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Assign Staff (Optional)</Label>
                  <Select value={selectedStaffId || "unassigned"} onValueChange={(val) => setSelectedStaffId(val === "unassigned" ? "" : val)}>
                    <SelectTrigger className="mt-1.5 h-10 bg-secondary/30 border-border/50">
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
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
            <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card/80 overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-amber-500/5 to-transparent">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Plus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  Extras
                  {extrasTotal > 0 && (
                    <Badge className="ml-auto bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                      +${extrasTotal}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {extrasData.map((extra) => (
                    <div 
                      key={extra.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200",
                        selectedExtras.includes(extra.id) 
                          ? "border-primary bg-primary/5 shadow-sm" 
                          : "border-border/50 hover:border-primary/30 hover:bg-secondary/30"
                      )}
                      onClick={() => toggleExtra(extra.id)}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        selectedExtras.includes(extra.id)
                          ? "border-primary bg-primary"
                          : "border-border"
                      )}>
                        {selectedExtras.includes(extra.id) && (
                          <CheckCircle className="w-3 h-3 text-primary-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{extra.name}</p>
                        <p className="text-xs text-muted-foreground">${extra.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Column 3 - Schedule & Payment */}
          <div className="space-y-5">
            <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card/80 overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-cyan-500/5 to-transparent">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                    <CalendarIcon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal mt-1.5 h-10 bg-secondary/30 border-border/50",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                        {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Time</Label>
                  <Select value={selectedTime} onValueChange={setSelectedTime}>
                    <SelectTrigger className="mt-1.5 h-10 bg-secondary/30 border-border/50">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {TIME_SLOTS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes" className="text-xs font-medium text-muted-foreground">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special instructions..."
                    rows={3}
                    className="mt-1.5 bg-secondary/30 border-border/50 focus:border-primary/50 resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment / Card */}
            <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card/80 overflow-hidden">
              <CardHeader className="pb-3 bg-gradient-to-r from-rose-500/5 to-transparent">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/30">
                    <CreditCard className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingCard ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : cardInfo?.hasCard ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="font-medium capitalize text-emerald-800 dark:text-emerald-200">{cardInfo.brand} •••• {cardInfo.last4}</p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            Expires {cardInfo.expMonth}/{cardInfo.expYear}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadCardInfo(customerEmail)}
                        className="h-8 w-8 p-0"
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
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
                      <User className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Select a customer to manage payment
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-5 border-t border-border/50">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold text-foreground">
                  ${(totalAmount + extrasTotal).toFixed(2)}
                </p>
              </div>
              {extrasTotal > 0 && (
                <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700 border-amber-200">
                  +${extrasTotal} extras
                </Badge>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                className="h-10 px-4 border-border/50"
              >
                Cancel
              </Button>
              
              {booking && (
                <Button 
                  variant="outline" 
                  onClick={handleDuplicate}
                  className="h-10 px-4 border-border/50"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </Button>
              )}
              
              <Button 
                variant="secondary" 
                onClick={() => handleSubmit(true)} 
                disabled={savingDraft || submitting}
                className="h-10 px-4"
              >
                {savingDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <FileText className="mr-2 h-4 w-4" />
                Save as Draft
              </Button>
              
              <Button 
                onClick={() => handleSubmit(false)} 
                disabled={submitting || savingDraft}
                className="h-10 px-5 bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-md"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                {booking ? 'Update Booking' : 'Save Booking'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
