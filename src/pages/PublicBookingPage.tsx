import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { TermsOfServiceDialog } from '@/components/legal/TermsOfServiceDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Calendar as CalendarIcon,
  Clock,
  Check,
  ArrowRight,
  ArrowLeft,
  MapPin,
  User,
  Mail,
  Phone,
  DollarSign,
  Ruler,
  Loader2,
  Star,
  Gift,
  CreditCard,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { squareFootageRanges } from '@/data/pricingData';
import { usePublicOrgPricing } from '@/hooks/usePublicOrgPricing';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { applyPublicBranding, clearPublicBranding } from '@/hooks/useBrandingColors';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';

// Generate 30-minute time slots from 8:00 AM to 5:00 PM in 12-hour format
const timeSlots = Array.from({ length: 19 }, (_, i) => {
  const totalMinutes = 8 * 60 + i * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
});

export default function PublicBookingPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedSqFtIndex, setSelectedSqFtIndex] = useState<number | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedBedrooms, setSelectedBedrooms] = useState<string | null>(null);
  const [selectedBathrooms, setSelectedBathrooms] = useState<string | null>(null);
  const [selectedPetOption, setSelectedPetOption] = useState<string | null>(null);
  const [selectedHomeCondition, setSelectedHomeCondition] = useState<string | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<string>('one-time');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState<string>('');
  const [cardSaved, setCardSaved] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    notes: '',
  });

  // Use organization-specific pricing
  const { 
    services, 
    extras, 
    organizationName, 
    organizationId,
    logoUrl,
    primaryColor,
    accentColor,
    bookingFormTheme,
    displaySettings,
    bedroomPricing,
    petOptions,
    homeConditionOptions,
    loading: pricingLoading 
  } = usePublicOrgPricing(orgSlug);

  const isLight = bookingFormTheme === 'light';

  // Apply org branding colors once when loaded (no re-renders)
  useEffect(() => {
    if (primaryColor || accentColor) {
      applyPublicBranding(primaryColor, accentColor);
    }
    return () => clearPublicBranding();
  }, [primaryColor, accentColor]);

  // Track abandoned bookings - save progress when user has contact info
  const sessionTokenRef = useState(() => crypto.randomUUID())[0];
  const abandonedTrackedRef = useState({ tracked: false })[0];

  useEffect(() => {
    // Track when user reaches step 3+ with contact info (they've provided name/phone)
    if (step >= 3 && customerInfo.phone && organizationId && !abandonedTrackedRef.tracked) {
      abandonedTrackedRef.tracked = true;
      const nameParts = customerInfo.name.trim().split(/\s+/);
      supabase
        .from('abandoned_bookings')
        .insert({
          organization_id: organizationId,
          first_name: nameParts[0] || null,
          last_name: nameParts.slice(1).join(' ') || null,
          email: customerInfo.email || null,
          phone: customerInfo.phone,
          service_id: selectedService || null,
          step_reached: step,
          session_token: sessionTokenRef,
        })
        .then(({ error }) => {
          if (error) console.log('Abandoned tracking skipped:', error.message);
        });
    }

    // Update step_reached if already tracked
    if (abandonedTrackedRef.tracked && step > 3) {
      supabase
        .from('abandoned_bookings')
        .update({ step_reached: step })
        .eq('session_token', sessionTokenRef)
        .then(() => {});
    }
  }, [step, customerInfo.phone]);

  // Mark as converted when booking completes
  useEffect(() => {
    if (confirmationNumber && abandonedTrackedRef.tracked) {
      supabase
        .from('abandoned_bookings')
        .update({ converted: true, converted_at: new Date().toISOString() })
        .eq('session_token', sessionTokenRef)
        .then(() => {});
    }
  }, [confirmationNumber]);

  const service = services.find(s => s.id === selectedService);

  const calculateTotal = () => {
    let total = 0;
    
    // Bedroom-based pricing takes priority if bed/bath selected
    if (selectedBedrooms && selectedBathrooms && bedroomPricing.length > 0) {
      const match = bedroomPricing.find(
        bp => bp.bedrooms === Number(selectedBedrooms) && bp.bathrooms === Number(selectedBathrooms)
      );
      if (match) total = match.basePrice;
    } else if (service && selectedSqFtIndex !== null) {
      total = service.prices[selectedSqFtIndex] || service.minimumPrice;
    } else if (service) {
      total = service.minimumPrice;
    }

    // Add extras
    const extrasTotal = selectedExtras.reduce((sum, extraId) => {
      const extra = extras.find(e => e.id === extraId);
      return sum + (extra?.price || 0);
    }, 0);
    total += extrasTotal;

    // Add pet fee
    if (selectedPetOption && petOptions.length > 0) {
      const pet = petOptions.find(p => p.id === selectedPetOption);
      if (pet) total += pet.price;
    }

    // Add home condition fee
    if (selectedHomeCondition && homeConditionOptions.length > 0) {
      const condition = homeConditionOptions.find(c => String(c.id) === selectedHomeCondition);
      if (condition) total += condition.price;
    }

    // Apply frequency discount
    if (selectedFrequency !== 'one-time') {
      const discounts: Record<string, number> = { weekly: 0.20, 'bi-weekly': 0.15, monthly: 0.10 };
      const discount = discounts[selectedFrequency] || 0;
      total = total * (1 - discount);
    }

    return Math.round(total);
  };

  const buildScheduledAt = () => {
    if (!selectedDate || !selectedTime) return new Date().toISOString();
    const date = new Date(selectedDate);
    const match = selectedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      const period = match[3].toUpperCase();
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
      date.setHours(hour, minute, 0, 0);
    }
    return date.toISOString();
  };

  const handleNext = async () => {
    if (step === 4) {
      // Step 4 is card step — submit booking after card is saved
      setIsSubmitting(true);
      
      try {
        const extraNames = selectedExtras.map(id => extras.find(e => e.id === id)?.name).filter(Boolean) as string[];
        const scheduledAt = buildScheduledAt();
        const nameParts = customerInfo.name.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const { data: webhookResult, error: webhookError } = await supabase.functions.invoke('external-booking-webhook', {
          body: {
            first_name: firstName,
            last_name: lastName,
            email: customerInfo.email,
            phone: customerInfo.phone,
            address: customerInfo.address,
            city: customerInfo.city,
            state: customerInfo.state,
            zip_code: customerInfo.zipCode,
            service_name: service?.name || '',
            scheduled_at: scheduledAt,
            duration: service ? 120 : 120,
            total_amount: calculateTotal(),
            frequency: selectedFrequency,
            notes: customerInfo.notes || undefined,
            extras: selectedExtras.length > 0 ? { names: extraNames } : undefined,
            organization_id: organizationId || undefined,
            organization_slug: orgSlug || undefined,
            square_footage: selectedSqFtIndex !== null ? squareFootageRanges[selectedSqFtIndex].label : undefined,
          },
        });

        if (webhookError) {
          console.error('Booking creation error:', webhookError);
          toast.error('Failed to create booking. Please try again.');
          setIsSubmitting(false);
          return;
        }

        const bookingNumber = webhookResult?.booking_number || '';
        const newConfirmationNumber = bookingNumber ? `BK-${bookingNumber}` : `BK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        setConfirmationNumber(newConfirmationNumber);

        toast.success(`Booking confirmed! Your confirmation number is ${newConfirmationNumber}. You'll receive an SMS confirmation shortly.`);
        setStep(5);
      } catch (err) {
        console.error('Failed to create booking:', err);
        toast.error('Something went wrong. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    } else if (step < 5) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const toggleExtra = (extraId: string) => {
    setSelectedExtras(prev => 
      prev.includes(extraId) 
        ? prev.filter(id => id !== extraId)
        : [...prev, extraId]
    );
  };

  const canProceed = () => {
    switch (step) {
      case 1: return selectedService !== null;
      case 2: return selectedDate !== undefined && selectedTime !== null;
      case 3: return customerInfo.name && customerInfo.email && customerInfo.phone && customerInfo.address;
      case 4: return cardSaved;
      default: return true;
    }
  };

  // Steps config — 5 steps now (card step added)
  const steps = [
    { num: 1, label: 'Select Service' },
    { num: 2, label: 'Choose Time' },
    { num: 3, label: 'Your Details' },
    { num: 4, label: 'Payment Method' },
    { num: 5, label: 'Confirmation' },
  ];

  if (pricingLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
            <CalendarIcon className="w-8 h-8 text-primary" />
          </div>
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading booking form...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("min-h-screen", isLight ? "bg-white text-gray-900" : "bg-background")}
      style={isLight ? {
        '--background': '0 0% 100%',
        '--foreground': '222 47% 11%',
        '--card': '220 20% 97%',
        '--card-foreground': '222 47% 11%',
        '--popover': '0 0% 100%',
        '--popover-foreground': '222 47% 11%',
        '--primary': '221 83% 46%',
        '--primary-foreground': '210 40% 98%',
        '--secondary': '220 20% 93%',
        '--secondary-foreground': '222 47% 11%',
        '--muted': '220 14% 90%',
        '--muted-foreground': '215 20% 40%',
        '--accent': '220 16% 90%',
        '--accent-foreground': '222 47% 11%',
        '--border': '220 20% 82%',
        '--input': '220 20% 82%',
        '--ring': '221 83% 46%',
        '--success': '142 76% 30%',
        '--success-foreground': '0 0% 100%',
      } as React.CSSProperties : undefined}
    >
      {/* Header */}
      <header className={cn(isLight ? "bg-secondary border-b border-border" : "bg-sidebar text-sidebar-foreground")}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt={organizationName} className="w-10 h-10 rounded-xl object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <CalendarIcon className="w-6 h-6 text-primary-foreground" />
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold">{organizationName || 'Book Your Service'}</h1>
              <p className={cn("text-sm", isLight ? "text-muted-foreground" : "text-sidebar-foreground/70")}>Book your service online</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className={cn("border-b", isLight ? "border-border bg-secondary" : "border-border bg-card")}>
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-center gap-4 md:gap-8 overflow-x-auto">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center gap-2 md:gap-3 shrink-0">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    step > s.num
                      ? 'bg-success text-success-foreground'
                      : step === s.num
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step > s.num ? <Check className="w-4 h-4" /> : s.num}
                </div>
                <span
                  className={cn(
                    'text-sm font-medium hidden sm:block',
                    step >= s.num ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className="w-8 md:w-12 h-0.5 bg-border hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          {/* Step 1: Select Service & Square Footage */}
          {step === 1 && (
            <div className="animate-fade-in space-y-6">
              {/* Square Footage Selection */}
              {displaySettings.show_sqft_on_booking && (
                <div>
                  <h2 className="text-2xl font-bold mb-2">Home Size</h2>
                  <p className="text-muted-foreground mb-4">Select your home's square footage</p>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <Ruler className="w-5 h-5 text-primary" />
                        <Label className="text-base">Square Footage</Label>
                      </div>
                      <Select 
                        value={selectedSqFtIndex?.toString() ?? ''} 
                        onValueChange={(val) => setSelectedSqFtIndex(parseInt(val))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select your home size" />
                        </SelectTrigger>
                        <SelectContent>
                          {squareFootageRanges.map((range, index) => (
                            <SelectItem key={index} value={index.toString()}>
                              {range.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Bed & Bath Selection */}
              {displaySettings.show_bed_bath_on_booking && bedroomPricing.length > 0 && (
                <div>
                  <h2 className="text-2xl font-bold mb-2">Bedrooms & Bathrooms</h2>
                  <p className="text-muted-foreground mb-4">Select your home layout</p>
                  <Card>
                    <CardContent className="p-5 space-y-4">
                      <div>
                        <Label className="text-base mb-2 block">Bedrooms</Label>
                        <div className="flex flex-wrap gap-2">
                          {[...new Set(bedroomPricing.map(bp => bp.bedrooms))].sort((a, b) => a - b).map(bed => (
                            <Button
                              key={bed}
                              type="button"
                              variant={selectedBedrooms === String(bed) ? 'default' : 'outline'}
                              onClick={() => setSelectedBedrooms(String(bed))}
                              className="min-w-[60px]"
                            >
                              {bed}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-base mb-2 block">Bathrooms</Label>
                        <div className="flex flex-wrap gap-2">
                          {[...new Set(bedroomPricing
                            .filter(bp => !selectedBedrooms || bp.bedrooms === Number(selectedBedrooms))
                            .map(bp => bp.bathrooms)
                          )].sort((a, b) => a - b).map(bath => (
                            <Button
                              key={bath}
                              type="button"
                              variant={selectedBathrooms === String(bath) ? 'default' : 'outline'}
                              onClick={() => setSelectedBathrooms(String(bath))}
                              className="min-w-[60px]"
                            >
                              {bath}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Service Selection */}
              <div>
                <h2 className="text-2xl font-bold mb-2">Select a Service</h2>
                <p className="text-muted-foreground mb-4">Choose the cleaning type you need</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {services.map((svc) => {
                    const price = selectedSqFtIndex !== null 
                      ? (svc.prices[selectedSqFtIndex] || svc.minimumPrice)
                      : svc.minimumPrice;
                    
                    return (
                      <Card
                        key={svc.id}
                        className={cn(
                          'cursor-pointer transition-all hover:shadow-md',
                          selectedService === svc.id && 'ring-2 ring-primary'
                        )}
                        onClick={() => setSelectedService(svc.id)}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start gap-4">
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${svc.color}20`, color: svc.color }}
                            >
                              <CalendarIcon className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold">{svc.name}</h3>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{svc.description}</p>
                              <div className="flex items-center gap-2 mt-3">
                                <div className="flex items-center gap-1 text-lg font-bold text-success">
                                  <DollarSign className="w-5 h-5" />
                                  {price}
                                </div>
                                {selectedSqFtIndex === null && (
                                  <span className="text-xs text-muted-foreground">(min price)</span>
                                )}
                              </div>
                            </div>
                            {selectedService === svc.id && (
                              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <Check className="w-4 h-4 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Extras */}
              {displaySettings.show_addons_on_booking && service && !service.name.toLowerCase().includes('deep') && (
                <div>
                  <h2 className="text-2xl font-bold mb-2">Add Extras</h2>
                  <p className="text-muted-foreground mb-4">Optional add-on services</p>
                  <Card>
                    <CardContent className="p-5">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {extras.map((extra) => (
                          <div 
                            key={extra.id} 
                            onClick={() => toggleExtra(extra.id)}
                            className={cn(
                              "flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all h-[100px]",
                              selectedExtras.includes(extra.id) 
                                ? "border-primary bg-primary/5" 
                                : "border-border hover:border-primary/50"
                            )}
                          >
                            <span className="font-medium text-center text-sm mb-1">{extra.name}</span>
                            <span className="text-primary font-semibold">+${extra.price}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Frequency Discount */}
              {displaySettings.show_frequency_discount && (
                <div>
                  <h2 className="text-2xl font-bold mb-2">Service Frequency</h2>
                  <p className="text-muted-foreground mb-4">Save with recurring service</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { id: 'one-time', label: 'One-Time', discount: null },
                      { id: 'weekly', label: 'Weekly', discount: '20% off' },
                      { id: 'bi-weekly', label: 'Bi-Weekly', discount: '15% off' },
                      { id: 'monthly', label: 'Monthly', discount: '10% off' },
                    ].map((freq) => (
                      <Card
                        key={freq.id}
                        className={cn(
                          'cursor-pointer transition-all hover:shadow-md text-center',
                          selectedFrequency === freq.id && 'ring-2 ring-primary'
                        )}
                        onClick={() => setSelectedFrequency(freq.id)}
                      >
                        <CardContent className="p-4">
                          <p className="font-semibold">{freq.label}</p>
                          {freq.discount && (
                            <Badge variant="secondary" className="mt-1 text-success">
                              {freq.discount}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Pet Options */}
              {displaySettings.show_pet_options && petOptions.length > 0 && (
                <div>
                  <h2 className="text-2xl font-bold mb-2">Pets</h2>
                  <p className="text-muted-foreground mb-4">Do you have any pets?</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {petOptions.map((pet) => (
                      <Card
                        key={pet.id}
                        className={cn(
                          'cursor-pointer transition-all hover:shadow-md text-center',
                          selectedPetOption === pet.id && 'ring-2 ring-primary'
                        )}
                        onClick={() => setSelectedPetOption(pet.id)}
                      >
                        <CardContent className="p-4">
                          <p className="font-semibold text-sm">{pet.label}</p>
                          {pet.price > 0 && (
                            <p className="text-primary font-semibold text-sm mt-1">+${pet.price}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Home Condition */}
              {displaySettings.show_home_condition && homeConditionOptions.length > 0 && (
                <div>
                  <h2 className="text-2xl font-bold mb-2">Home Condition</h2>
                  <p className="text-muted-foreground mb-4">Rate your home's current condition</p>
                  <div className="space-y-2">
                    {homeConditionOptions.map((condition) => (
                      <Card
                        key={String(condition.id)}
                        className={cn(
                          'cursor-pointer transition-all hover:shadow-md',
                          selectedHomeCondition === String(condition.id) && 'ring-2 ring-primary'
                        )}
                        onClick={() => setSelectedHomeCondition(String(condition.id))}
                      >
                        <CardContent className="p-4 flex items-center justify-between">
                          <span className="font-medium text-sm">{condition.label}</span>
                          {condition.price > 0 && (
                            <span className="text-primary font-semibold text-sm">+${condition.price}</span>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {service && service.description && (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm font-medium text-primary">
                    ✨ {service.description}
                  </p>
                </div>
              )}

              {/* Price Summary */}
              {selectedService && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Estimated Total</p>
                        <p className="text-3xl font-bold text-primary">${calculateTotal()}</p>
                        {selectedFrequency !== 'one-time' && (
                          <p className="text-xs text-success font-medium mt-1">
                            {selectedFrequency} discount applied
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{service?.name}</p>
                        {selectedSqFtIndex !== null && (
                          <p className="text-sm text-muted-foreground">
                            {squareFootageRanges[selectedSqFtIndex].label}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 2: Choose Date & Time */}
          {step === 2 && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold mb-2">Choose Date & Time</h2>
              <p className="text-muted-foreground mb-6">Select your preferred appointment slot</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Select Date</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today || date.getDay() === 0;
                      }}
                      className="rounded-md border"
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Select Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedDate ? (
                      <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
                        {timeSlots.map((time) => {
                          const available = true;
                          return (
                            <Button
                              key={time}
                              variant={selectedTime === time ? 'default' : 'outline'}
                              className={cn(
                                'h-12 transition-all duration-200',
                                selectedTime === time && 'ring-2 ring-primary/30 shadow-md',
                                !available && 'opacity-50 cursor-not-allowed'
                              )}
                              disabled={!available}
                              onClick={() => setSelectedTime(time)}
                            >
                              <Clock className="w-4 h-4 mr-2" />
                              {time}
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">
                        Please select a date first
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Step 3: Customer Details */}
          {step === 3 && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold mb-2">Your Details</h2>
              <p className="text-muted-foreground mb-6">Please provide your contact information</p>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input id="name" placeholder="John Doe" className="pl-9" value={customerInfo.name} onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input id="email" type="email" placeholder="john@example.com" className="pl-9" value={customerInfo.email} onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number *</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input id="phone" placeholder="(555) 123-4567" className="pl-9" value={customerInfo.phone} onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Street Address *</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input id="address" placeholder="123 Main Street" className="pl-9" value={customerInfo.address} onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input id="city" placeholder="City" value={customerInfo.city} onChange={(e) => setCustomerInfo({ ...customerInfo, city: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input id="state" placeholder="State" value={customerInfo.state} onChange={(e) => setCustomerInfo({ ...customerInfo, state: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zipCode">ZIP Code</Label>
                        <Input id="zipCode" placeholder="12345" value={customerInfo.zipCode} onChange={(e) => setCustomerInfo({ ...customerInfo, zipCode: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Special Instructions (Optional)</Label>
                    <Textarea id="notes" placeholder="Any special requests or access instructions..." value={customerInfo.notes} onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })} />
                  </div>
                </CardContent>
              </Card>

              {/* Price Summary */}
              <Card className="mt-6 bg-primary/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>{service?.name}</span>
                      <span>${selectedSqFtIndex !== null && service ? (service.prices[selectedSqFtIndex] || service.minimumPrice) : 0}</span>
                    </div>
                    {selectedExtras.map(extraId => {
                      const extra = extras.find(e => e.id === extraId);
                      if (!extra) return null;
                      return (
                        <div key={extraId} className="flex justify-between text-sm text-muted-foreground">
                          <span>{extra.name}</span>
                          <span>+${extra.price}</span>
                        </div>
                      );
                    })}
                    <div className="border-t pt-2 flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-primary">${calculateTotal()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 4: Card on File (Required) */}
          {step === 4 && (
            <div className="animate-fade-in space-y-6">
              <h2 className="text-2xl font-bold mb-2">Payment Method</h2>
              <p className="text-muted-foreground mb-6">A card on file is required to complete your booking. Your card will <strong>not</strong> be charged now.</p>
              
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <CreditCard className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Add Card on File</h3>
                      <p className="text-sm text-muted-foreground">Securely stored — only charged when services are rendered</p>
                    </div>
                  </div>

                  {cardSaved ? (
                    <div className="p-4 bg-success/10 border border-success/20 rounded-lg flex items-center gap-3">
                      <Check className="w-5 h-5 text-success" />
                      <div>
                        <p className="font-medium text-success">Card saved successfully!</p>
                        <p className="text-sm text-muted-foreground">You can now complete your booking.</p>
                      </div>
                    </div>
                  ) : organizationId ? (
                    <StripeCardForm
                      email={customerInfo.email}
                      customerName={customerInfo.name}
                      organizationId={organizationId}
                      showHoldOption={false}
                      publicBooking={true}
                      onCardSaved={(cardInfo) => {
                        setCardSaved(true);
                        toast.success(`Card saved: ${cardInfo.brand} ending in ${cardInfo.last4}`);
                      }}
                      onError={(error) => {
                        toast.error(error);
                      }}
                    />
                  ) : (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-sm text-destructive">Unable to load payment form. Please try again.</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Your card info is encrypted and securely processed via Stripe. We never store raw card details.</span>
                  </div>
                </CardContent>
              </Card>

              {/* Price Summary */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Estimated Total (charged after service)</p>
                      <p className="text-3xl font-bold text-primary">${calculateTotal()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{service?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedSqFtIndex !== null ? squareFootageRanges[selectedSqFtIndex].label : ''}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 5: Confirmation */}
          {step === 5 && (
            <div className="animate-fade-in space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-success" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Booking Confirmed!</h2>
                <p className="text-muted-foreground">
                  Your appointment has been scheduled. You'll receive an SMS confirmation shortly.
                </p>
              </div>

              {/* Loyalty Points Earned Card */}
              <Card className="bg-gradient-to-br from-primary/10 via-accent/10 to-primary/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <Star className="w-7 h-7 text-primary-foreground fill-primary-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">You earned</p>
                        <p className="text-3xl font-bold text-primary">
                          +{Math.floor(calculateTotal())} <span className="text-lg font-medium">points</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Gift className="w-4 h-4" />
                        <span className="text-sm">Loyalty Rewards</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        1 point per $1 spent
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-primary/20">
                     <p className="text-sm text-muted-foreground">
                       Track your loyalty progress and tier benefits with each booking!
                     </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Booking Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Service</p>
                      <p className="font-medium">{service?.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Home Size</p>
                      <p className="font-medium">
                        {selectedSqFtIndex !== null ? squareFootageRanges[selectedSqFtIndex].label : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Price</p>
                      <p className="font-semibold text-success">${calculateTotal()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date</p>
                      <p className="font-medium">
                        {selectedDate?.toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Time</p>
                      <p className="font-medium">{selectedTime}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Customer</p>
                      <p className="font-medium">{customerInfo.name}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">
                        {customerInfo.address}
                        {customerInfo.city && `, ${customerInfo.city}`}
                        {customerInfo.state && `, ${customerInfo.state}`}
                        {customerInfo.zipCode && ` ${customerInfo.zipCode}`}
                      </p>
                    </div>
                    {selectedExtras.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Extras</p>
                        <p className="font-medium">
                          {selectedExtras.map(id => extras.find(e => e.id === id)?.name).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="pt-4 border-t">
                    <Badge className="bg-success/20 text-success border-success/30">
                      Confirmation #{confirmationNumber}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8">
            {step > 1 && step < 5 && (
              <Button variant="outline" onClick={handleBack} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            {step === 1 && <div />}
            {step < 5 && (
              <Button onClick={handleNext} disabled={!canProceed() || isSubmitting} className="gap-2 ml-auto">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    {step === 4 ? 'Confirm Booking' : 'Continue'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            )}
            {step === 5 && (
              <Button onClick={() => { setStep(1); setCardSaved(false); }} className="mx-auto">
                Book Another Service
              </Button>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          <span>By booking you agree to our </span>
          <TermsOfServiceDialog>
            <button className="underline underline-offset-4 hover:text-foreground transition-colors">Terms</button>
          </TermsOfServiceDialog>
          <span> and acknowledge our </span>
          <Link
            to="/privacy-policy"
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <span>.</span>
        </div>
      </footer>
    </div>
  );
}
