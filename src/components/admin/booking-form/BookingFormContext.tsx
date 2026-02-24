import { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { useCustomers, useServices, useStaff, BookingWithDetails } from '@/hooks/useBookings';
import { supabase } from '@/lib/supabase';
import { squareFootageRanges, frequencyOptions } from '@/data/pricingData';
import { useServicePricing } from '@/hooks/useServicePricing';
import { useOrgId } from '@/hooks/useOrgId';
import { useAuth } from '@/hooks/useAuth';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { getLocalDateInTimezone, getTimeInTimezone } from '@/lib/timezoneUtils';

interface CardInfo {
  hasCard: boolean;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
}

interface AppliedDiscount {
  id: string;
  code: string;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  discountAmount: number;
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
  customFrequencyDays: number | null;
  recurringDaysOfWeek: number[] | null;
  selectedExtras: string[];
  
  // New pricing fields
  pricingMode: 'sqft' | 'bedroom';
  homeCondition: number;
  petOption: string;
  
  // Schedule
  selectedDate: Date | undefined;
  selectedTime: string;
  selectedStaffId: string;
  isTeamMode: boolean;
  selectedTeamMembers: string[];
  teamMemberPay: Record<string, number>; // staffId -> pay amount
  
  // Conflict override
  conflictOverride: boolean;
  
  notes: string;
  totalAmount: number;
  cleanerWage: string;
  cleanerWageType: string;
  cleanerOverrideHours: string;
  sendConfirmationEmail: boolean;
  sendConfirmationSms: boolean;
  
  // Card info
  cardInfo: CardInfo | null;
  loadingCard: boolean;
  
  // Checklist
  selectedChecklistId: string | null;
  
  // Discount
  appliedDiscount: AppliedDiscount | null;
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
  conditionTotal: number;
  petTotal: number;
  calculatedPrice: number;
  finalPrice: number;
  appliedDiscount: AppliedDiscount | null;
  
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
  setCustomFrequencyDays: (days: number | null) => void;
  setRecurringDaysOfWeek: (days: number[] | null) => void;
  toggleExtra: (extraId: string) => void;
  setPricingMode: (mode: 'sqft' | 'bedroom') => void;
  setHomeCondition: (condition: number) => void;
  setPetOption: (option: string) => void;
  setSelectedDate: (date: Date | undefined) => void;
  setSelectedTime: (time: string) => void;
  setSelectedStaffId: (id: string) => void;
  setIsTeamMode: (mode: boolean) => void;
  setSelectedTeamMembers: (members: string[]) => void;
  setTeamMemberPay: (pay: Record<string, number>) => void;
  updateTeamMemberPay: (staffId: string, amount: number) => void;
  setConflictOverride: (override: boolean) => void;
  setNotes: (notes: string) => void;
  setTotalAmount: (amount: number) => void;
  setCleanerWage: (wage: string) => void;
  setCleanerWageType: (type: string) => void;
  setCleanerOverrideHours: (hours: string) => void;
  setSendConfirmationEmail: (send: boolean) => void;
  setSendConfirmationSms: (send: boolean) => void;
  setCardInfo: (info: CardInfo | null) => void;
  setAppliedDiscount: (discount: AppliedDiscount | null) => void;
  setSelectedChecklistId: (id: string | null) => void;
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
  const { organizationId } = useOrgId();
  const { session } = useAuth();
  const orgTimezone = useOrgTimezone();
  
  // Service-specific pricing from database
  const { getServicePricing, loading: pricingLoading } = useServicePricing();
  
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
  const [customFrequencyDays, setCustomFrequencyDays] = useState<number | null>(null);
  const [recurringDaysOfWeek, setRecurringDaysOfWeek] = useState<number[] | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  // New pricing fields
  const [pricingMode, setPricingMode] = useState<'sqft' | 'bedroom'>('sqft');
  const [homeCondition, setHomeCondition] = useState(1);
  const [petOption, setPetOption] = useState('no_pets');
  
  // Schedule state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(defaultDate);
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [isTeamMode, setIsTeamMode] = useState(false);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [teamMemberPay, setTeamMemberPay] = useState<Record<string, number>>({});
  const [conflictOverride, setConflictOverride] = useState(false);
  
  const updateTeamMemberPay = (staffId: string, amount: number) => {
    setTeamMemberPay(prev => ({ ...prev, [staffId]: amount }));
  };
  // Payment/Notes state
  const [notes, setNotes] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [cleanerWage, setCleanerWage] = useState('');
  const [cleanerWageType, setCleanerWageType] = useState('hourly');
  const [cleanerOverrideHours, setCleanerOverrideHours] = useState('');
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(false);
  const [sendConfirmationSms, setSendConfirmationSms] = useState(false);
  
  // Card state
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  
  // Discount state
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  
  // Checklist state
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  
  const selectedService = services.find(s => s.id === selectedServiceId);
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  
  const customerEmail = customerTab === 'existing' && selectedCustomer 
    ? selectedCustomer.email 
    : newCustomer.email;

  const customerName = customerTab === 'existing' && selectedCustomer
    ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
    : `${newCustomer.first_name} ${newCustomer.last_name}`;

  // Get service-specific pricing data
  const servicePricing = useMemo(() => {
    if (!selectedServiceId) return null;
    return getServicePricing(selectedServiceId);
  }, [selectedServiceId, getServicePricing, pricingLoading]);

  // Calculate extras total from service-specific pricing
  const extrasTotal = useMemo(() => {
    if (!servicePricing) return 0;
    return selectedExtras.reduce((total, extraId) => {
      const extra = servicePricing.extras.find((e) => e.id === extraId);
      return total + (extra?.price || 0);
    }, 0);
  }, [servicePricing, selectedExtras]);

  // Calculate condition price from service-specific pricing
  const conditionTotal = useMemo(() => {
    if (!servicePricing) return 0;
    const option = servicePricing.home_condition_options.find((o) => o.id === homeCondition);
    return option?.price || 0;
  }, [servicePricing, homeCondition]);

  // Calculate pet price from service-specific pricing
  const petTotal = useMemo(() => {
    if (!servicePricing) return 0;
    const option = servicePricing.pet_options.find((o) => o.id === petOption);
    return option?.price || 0;
  }, [servicePricing, petOption]);

  // Calculate price from service-specific pricing
  const calculatedPrice = useMemo(() => {
    if (!selectedService) return 0;
    
    let basePrice = 0;
    
    // First check if there's custom pricing configured for this service
    const hasCustomPricing = servicePricing && (
      (servicePricing.sqft_prices && servicePricing.sqft_prices.length > 0 && servicePricing.sqft_prices.some(p => p > 0)) ||
      (servicePricing.bedroom_pricing && servicePricing.bedroom_pricing.length > 0)
    );
    
    if (hasCustomPricing) {
      // Use custom pricing from service_pricing table
      if (pricingMode === 'sqft' && squareFootage) {
        const sqFtIndex = squareFootageRanges.findIndex(r => r.label === squareFootage);
        if (sqFtIndex !== -1 && servicePricing!.sqft_prices[sqFtIndex]) {
          basePrice = servicePricing!.sqft_prices[sqFtIndex];
        }
      } else if (pricingMode === 'bedroom') {
        // Find bedroom/bathroom combination in service pricing
        // Convert to string for comparison since database may store as numbers
        const combo = servicePricing!.bedroom_pricing.find(
          (p) => String(p.bedrooms) === bedrooms && String(p.bathrooms) === bathrooms
        );
        basePrice = combo?.basePrice || 0;
      }
    }
    
    // FIX: If no base price from sqft/bedroom pricing, use the service's base price
    // This ensures custom services always have their price included
    if (basePrice === 0 && selectedService.price && selectedService.price > 0) {
      basePrice = Number(selectedService.price);
    }
    
    // Apply frequency discount
    const freqOption = frequencyOptions.find(f => f.id === frequency);
    if (freqOption && freqOption.discount > 0 && basePrice > 0) {
      basePrice = Math.round(basePrice * (1 - freqOption.discount));
    }
    
    // Ensure minimum price from service pricing if configured
    if (servicePricing?.minimum_price && basePrice > 0 && basePrice < servicePricing.minimum_price) {
      basePrice = servicePricing.minimum_price;
    }
    
    return basePrice + extrasTotal + conditionTotal + petTotal;
  }, [selectedService, servicePricing, pricingMode, squareFootage, bedrooms, bathrooms, frequency, extrasTotal, conditionTotal, petTotal]);

  // Calculate final price after discount
  const finalPrice = useMemo(() => {
    const baseAmount = totalAmount > 0 ? totalAmount : calculatedPrice;
    if (!appliedDiscount) return baseAmount;
    return Math.max(0, baseAmount - appliedDiscount.discountAmount);
  }, [totalAmount, calculatedPrice, appliedDiscount]);

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

  const loadCardInfo = useCallback(async (email: string) => {
    if (!email || !organizationId) {
      setCardInfo({ hasCard: false });
      return;
    }
    
    // Check for valid session before making authenticated request
    if (!session?.access_token) {
      console.warn('No active session for loadCardInfo - skipping card lookup');
      setCardInfo({ hasCard: false });
      return;
    }
    
    setLoadingCard(true);
    try {
      // SECURITY FIX: Pass organizationId and auth token to prevent cross-tenant card access
      const { data, error } = await supabase.functions.invoke('get-customer-card', {
        body: { email, organizationId },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      if (error) throw error;
      setCardInfo(data);
    } catch (error) {
      console.error('Error loading card info:', error);
      setCardInfo({ hasCard: false });
    } finally {
      setLoadingCard(false);
    }
  }, [organizationId, session?.access_token]);

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
    setCustomFrequencyDays(null);
    setRecurringDaysOfWeek(null);
    setBedrooms('1');
    setSquareFootage('');
    setSelectedExtras([]);
    setCardInfo(null);
    setIsTeamMode(false);
    setSelectedTeamMembers([]);
    setCleanerWage('');
    setCleanerWageType('hourly');
    setCleanerOverrideHours('');
    setPricingMode('sqft');
    setHomeCondition(1);
    setPetOption('no_pets');
    setConflictOverride(false);
    setSelectedChecklistId(null);
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
    // Parse the scheduled_at in the org timezone so the date/time shown matches what was intended
    const scheduledDate = getLocalDateInTimezone(booking.scheduled_at, orgTimezone);
    setSelectedDate(scheduledDate);
    const timeStr = getTimeInTimezone(booking.scheduled_at, orgTimezone);
    setSelectedTime(timeStr);
    setNotes(booking.notes || '');
    setTotalAmount(booking.total_amount || 0);
    setAddress(booking.address || '');
    setAptSuite(booking.apt_suite || '');
    setCity(booking.city || '');
    setState(booking.state || '');
    setZipCode(booking.zip_code || '');
    setFrequency(booking.frequency || 'one_time');
    setCustomFrequencyDays((booking as any).custom_frequency_days || null);
    setRecurringDaysOfWeek((booking as any).recurring_days_of_week || null);
    setBedrooms(booking.bedrooms || '1');
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

    // Load existing checklist template for this booking
    if (booking.id && organizationId) {
      supabase
        .from('booking_checklists')
        .select('template_id')
        .eq('booking_id', booking.id)
        .eq('organization_id', organizationId)
        .not('template_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.template_id) {
            setSelectedChecklistId(data.template_id);
          }
        });

      // Load team assignments for this booking (org-scoped)
      supabase
        .from('booking_team_assignments')
        .select('staff_id, pay_share')
        .eq('booking_id', booking.id)
        .eq('organization_id', organizationId ?? '')
        .then(({ data: teamData }) => {
          if (teamData && teamData.length > 0) {
            const memberIds = teamData.map(t => t.staff_id);
            // Include primary staff if not already in team
            if (booking.staff && !memberIds.includes(booking.staff.id)) {
              memberIds.unshift(booking.staff.id);
            }
          // Only enable team mode if there are MULTIPLE people assigned
            const isActualTeam = memberIds.length > 1;
            setIsTeamMode(isActualTeam);
            if (isActualTeam) {
              setSelectedTeamMembers(memberIds);
            } else {
              // Reset team members when not in team mode to prevent stale state
              setSelectedTeamMembers([]);
            }
            // Load pay shares
            const payMap: Record<string, number> = {};
            teamData.forEach(t => {
              if (t.pay_share != null) {
                payMap[t.staff_id] = t.pay_share;
              }
            });
            setTeamMemberPay(payMap);
          }
        });
    }
  };

  // Auto-fill property when existing customer selected
  useEffect(() => {
    if (customerTab === 'existing' && selectedCustomer && !booking) {
      setAddress(selectedCustomer.address || '');
      setAptSuite((selectedCustomer as any).apt_suite || '');
      setCity(selectedCustomer.city || '');
      setState(selectedCustomer.state || '');
      setZipCode(selectedCustomer.zip_code || '');
    }
  }, [selectedCustomerId, selectedCustomer, customerTab, booking]);

  // Load card info when customer email or organization changes
  useEffect(() => {
    if (customerEmail && organizationId) {
      loadCardInfo(customerEmail);
    } else {
      setCardInfo(null);
    }
  }, [customerEmail, organizationId, loadCardInfo]);

  // Note: We no longer auto-set totalAmount - user must manually enter if they want to override
  // The calculated price is displayed in ServiceStep but doesn't auto-populate the override field

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
      customFrequencyDays,
      recurringDaysOfWeek,
      selectedExtras,
      pricingMode,
      homeCondition,
      petOption,
      selectedDate,
      selectedTime,
      selectedStaffId,
      isTeamMode,
      selectedTeamMembers,
      teamMemberPay,
      conflictOverride,
      notes,
      totalAmount,
      cleanerWage,
      cleanerWageType,
      cleanerOverrideHours,
      sendConfirmationEmail,
      sendConfirmationSms,
      cardInfo,
      loadingCard,
      selectedChecklistId,
      
      customers,
      services,
      staff,
      
      // Computed
      selectedService,
      selectedCustomer,
      customerEmail,
      customerName,
      extrasTotal,
      conditionTotal,
      petTotal,
      calculatedPrice,
      finalPrice,
      appliedDiscount,
      
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
      setCustomFrequencyDays,
      setRecurringDaysOfWeek,
      toggleExtra,
      setPricingMode,
      setHomeCondition,
      setPetOption,
      setSelectedDate,
      setSelectedTime,
      setSelectedStaffId,
      setIsTeamMode,
      setSelectedTeamMembers,
      setTeamMemberPay,
      updateTeamMemberPay,
      setConflictOverride,
      setNotes,
      setTotalAmount,
      setCleanerWage,
      setCleanerWageType,
      setCleanerOverrideHours,
      setSendConfirmationEmail,
      setSendConfirmationSms,
      setCardInfo,
      setAppliedDiscount,
      setSelectedChecklistId,
      
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
