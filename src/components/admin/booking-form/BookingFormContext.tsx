import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useCustomers, useServices, useStaff, BookingWithDetails } from '@/hooks/useBookings';
import { supabase } from '@/integrations/supabase/client';
import { extras as extrasData, cleaningServices, squareFootageRanges, frequencyOptions } from '@/data/pricingData';

interface CardInfo {
  hasCard: boolean;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
}

interface BookingFormState {
  // Customer
  customerTab: 'existing' | 'new';
  selectedCustomerId: string;
  newCustomer: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
  };
  
  // Property
  address: string;
  aptSuite: string;
  city: string;
  state: string;
  zipCode: string;
  
  // Service
  selectedServiceId: string;
  squareFootage: string;
  bedrooms: string;
  bathrooms: string;
  frequency: string;
  selectedExtras: string[];
  
  // Schedule
  selectedDate: Date | undefined;
  selectedTime: string;
  selectedStaffId: string;
  
  // Payment/Notes
  notes: string;
  totalAmount: number;
  cleanerWage: string;
  cleanerWageType: string;
  cleanerOverrideHours: string;
  sendConfirmationEmail: boolean;
  
  // Card info
  cardInfo: CardInfo | null;
  loadingCard: boolean;
}

interface BookingFormContextType extends BookingFormState {
  // Data
  customers: ReturnType<typeof useCustomers>['data'];
  services: ReturnType<typeof useServices>['data'];
  staff: ReturnType<typeof useStaff>['data'];
  
  // Computed
  selectedService: any;
  selectedCustomer: any;
  customerEmail: string;
  customerName: string;
  extrasTotal: number;
  
  // Setters
  setCustomerTab: (tab: 'existing' | 'new') => void;
  setSelectedCustomerId: (id: string) => void;
  setNewCustomer: (customer: BookingFormState['newCustomer']) => void;
  updateNewCustomer: (field: keyof BookingFormState['newCustomer'], value: string) => void;
  setAddress: (address: string) => void;
  setAptSuite: (aptSuite: string) => void;
  setCity: (city: string) => void;
  setState: (state: string) => void;
  setZipCode: (zipCode: string) => void;
  setSelectedServiceId: (id: string) => void;
  setSquareFootage: (sqft: string) => void;
  setBedrooms: (bedrooms: string) => void;
  setBathrooms: (bathrooms: string) => void;
  setFrequency: (frequency: string) => void;
  toggleExtra: (extraId: string) => void;
  setSelectedDate: (date: Date | undefined) => void;
  setSelectedTime: (time: string) => void;
  setSelectedStaffId: (id: string) => void;
  setNotes: (notes: string) => void;
  setTotalAmount: (amount: number) => void;
  setCleanerWage: (wage: string) => void;
  setCleanerWageType: (type: string) => void;
  setCleanerOverrideHours: (hours: string) => void;
  setSendConfirmationEmail: (send: boolean) => void;
  setCardInfo: (info: CardInfo | null) => void;
  
  // Actions
  loadCardInfo: (email: string) => Promise<void>;
  resetForm: () => void;
  prefillFromBooking: (booking: BookingWithDetails) => void;
}

const BookingFormContext = createContext<BookingFormContextType | undefined>(undefined);

const initialNewCustomer = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip_code: ''
};

export function BookingFormProvider({ 
  children, 
  defaultDate,
  booking 
}: { 
  children: ReactNode;
  defaultDate?: Date;
  booking?: BookingWithDetails | null;
}) {
  const { data: customers = [] } = useCustomers();
  const { data: services = [] } = useServices();
  const { data: staff = [] } = useStaff();
  
  // Customer state
  const [customerTab, setCustomerTab] = useState<'existing' | 'new'>('existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState(initialNewCustomer);
  
  // Property state
  const [address, setAddress] = useState('');
  const [aptSuite, setAptSuite] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  
  // Service state
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [squareFootage, setSquareFootage] = useState('');
  const [bedrooms, setBedrooms] = useState('1');
  const [bathrooms, setBathrooms] = useState('1');
  const [frequency, setFrequency] = useState('one_time');
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  
  // Schedule state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(defaultDate);
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  
  // Payment/Notes state
  const [notes, setNotes] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [cleanerWage, setCleanerWage] = useState('');
  const [cleanerWageType, setCleanerWageType] = useState('hourly');
  const [cleanerOverrideHours, setCleanerOverrideHours] = useState('');
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(false);
  
  // Card state
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  
  const selectedService = services.find(s => s.id === selectedServiceId);
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  
  const customerEmail = customerTab === 'existing' && selectedCustomer 
    ? selectedCustomer.email 
    : newCustomer.email;

  const customerName = customerTab === 'existing' && selectedCustomer
    ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
    : `${newCustomer.first_name} ${newCustomer.last_name}`;

  const extrasTotal = selectedExtras.reduce((sum, extraId) => {
    const extra = extrasData.find(e => e.id === extraId);
    return sum + (extra?.price || 0);
  }, 0);

  const updateNewCustomer = (field: keyof typeof initialNewCustomer, value: string) => {
    setNewCustomer(prev => ({ ...prev, [field]: value }));
  };

  const toggleExtra = (extraId: string) => {
    setSelectedExtras(prev => 
      prev.includes(extraId) 
        ? prev.filter(id => id !== extraId)
        : [...prev, extraId]
    );
  };

  const loadCardInfo = async (email: string) => {
    if (!email) return;
    setLoadingCard(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-customer-card', {
        body: { email }
      });
      if (error) throw error;
      setCardInfo(data);
    } catch (error) {
      console.error('Error loading card info:', error);
      setCardInfo({ hasCard: false });
    } finally {
      setLoadingCard(false);
    }
  };

  const resetForm = () => {
    setCustomerTab('existing');
    setSelectedCustomerId('');
    setNewCustomer(initialNewCustomer);
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
    setCleanerWage('');
    setCleanerWageType('hourly');
    setCleanerOverrideHours('');
  };

  const prefillFromBooking = (booking: BookingWithDetails) => {
    if (booking.customer) {
      setCustomerTab('existing');
      setSelectedCustomerId(booking.customer.id);
    }
    if (booking.service) {
      setSelectedServiceId(booking.service.id);
    }
    if (booking.staff) {
      setSelectedStaffId(booking.staff.id);
    }
    const scheduledDate = new Date(booking.scheduled_at);
    setSelectedDate(scheduledDate);
    const hours = scheduledDate.getHours();
    const minutes = scheduledDate.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    setSelectedTime(`${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`);
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
    // Handle extras which can be array of objects or strings from Json type
    const rawExtras = booking.extras;
    let extrasStringArray: string[] = [];
    if (Array.isArray(rawExtras)) {
      extrasStringArray = rawExtras.map((e: unknown) => 
        typeof e === 'string' ? e : (e as Record<string, unknown>)?.id as string || ''
      ).filter(Boolean);
    }
    setSelectedExtras(extrasStringArray);
    const bookingAny = booking as any;
    setCleanerWage(bookingAny.cleaner_wage ? String(bookingAny.cleaner_wage) : '');
    setCleanerWageType(bookingAny.cleaner_wage_type || 'hourly');
    setCleanerOverrideHours(bookingAny.cleaner_override_hours ? String(bookingAny.cleaner_override_hours) : '');
  };

  // Auto-fill property when existing customer selected
  useEffect(() => {
    if (customerTab === 'existing' && selectedCustomer && !booking) {
      setAddress(selectedCustomer.address || '');
      setCity(selectedCustomer.city || '');
      setState(selectedCustomer.state || '');
      setZipCode(selectedCustomer.zip_code || '');
    }
  }, [selectedCustomerId, selectedCustomer, customerTab, booking]);

  // Load card info when customer email changes
  useEffect(() => {
    if (customerEmail) {
      loadCardInfo(customerEmail);
    } else {
      setCardInfo(null);
    }
  }, [customerEmail]);

  // Calculate total price
  useEffect(() => {
    if (!booking && selectedService) {
      const serviceName = selectedService.name.toLowerCase();
      let matchedService = cleaningServices.find(s => serviceName.includes(s.name.toLowerCase().split(' ')[0]));
      
      if (!matchedService) {
        if (serviceName.includes('deep')) matchedService = cleaningServices.find(s => s.id === 'deep_clean');
        else if (serviceName.includes('move')) matchedService = cleaningServices.find(s => s.id === 'move_in_out');
        else if (serviceName.includes('construction')) matchedService = cleaningServices.find(s => s.id === 'construction');
        else if (serviceName.includes('standard') || serviceName.includes('clean')) matchedService = cleaningServices.find(s => s.id === 'standard_clean');
      }
      
      if (matchedService && squareFootage) {
        const sqFtIndex = squareFootageRanges.findIndex(r => r.label === squareFootage);
        if (sqFtIndex !== -1) {
          let basePrice = matchedService.prices[sqFtIndex];
          const freqOption = frequencyOptions.find(f => f.id === frequency);
          if (freqOption && freqOption.discount > 0 && matchedService.id === 'standard_clean') {
            basePrice = Math.round(basePrice * (1 - freqOption.discount));
          }
          const extrasTotal = selectedExtras.reduce((sum, extraId) => {
            const extra = extrasData.find(e => e.id === extraId);
            return sum + (extra?.price || 0);
          }, 0);
          setTotalAmount(basePrice + extrasTotal);
        }
      } else if (!squareFootage) {
        setTotalAmount(selectedService.price);
      }
    }
  }, [selectedService, squareFootage, frequency, selectedExtras, booking]);

  // Prefill form when editing
  useEffect(() => {
    if (booking) {
      prefillFromBooking(booking);
    } else if (defaultDate) {
      setSelectedDate(defaultDate);
    }
  }, [booking, defaultDate]);

  return (
    <BookingFormContext.Provider value={{
      // State
      customerTab,
      selectedCustomerId,
      newCustomer,
      address,
      aptSuite,
      city,
      state,
      zipCode,
      selectedServiceId,
      squareFootage,
      bedrooms,
      bathrooms,
      frequency,
      selectedExtras,
      selectedDate,
      selectedTime,
      selectedStaffId,
      notes,
      totalAmount,
      cleanerWage,
      cleanerWageType,
      cleanerOverrideHours,
      sendConfirmationEmail,
      cardInfo,
      loadingCard,
      
      // Data
      customers,
      services,
      staff,
      
      // Computed
      selectedService,
      selectedCustomer,
      customerEmail,
      customerName,
      extrasTotal,
      
      // Setters
      setCustomerTab,
      setSelectedCustomerId,
      setNewCustomer,
      updateNewCustomer,
      setAddress,
      setAptSuite,
      setCity,
      setState,
      setZipCode,
      setSelectedServiceId,
      setSquareFootage,
      setBedrooms,
      setBathrooms,
      setFrequency,
      toggleExtra,
      setSelectedDate,
      setSelectedTime,
      setSelectedStaffId,
      setNotes,
      setTotalAmount,
      setCleanerWage,
      setCleanerWageType,
      setCleanerOverrideHours,
      setSendConfirmationEmail,
      setCardInfo,
      
      // Actions
      loadCardInfo,
      resetForm,
      prefillFromBooking,
    }}>
      {children}
    </BookingFormContext.Provider>
  );
}

export function useBookingForm() {
  const context = useContext(BookingFormContext);
  if (!context) {
    throw new Error('useBookingForm must be used within BookingFormProvider');
  }
  return context;
}
