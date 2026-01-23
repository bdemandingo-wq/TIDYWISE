import { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { squareFootageRanges } from '@/data/pricingData';
import { usePublicOrgPricing } from '@/hooks/usePublicOrgPricing';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState<string>('');
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
    loading: pricingLoading 
  } = usePublicOrgPricing(orgSlug);

  const service = services.find(s => s.id === selectedService);
  
  const calculateTotal = () => {
    let total = 0;
    if (service && selectedSqFtIndex !== null) {
      total = service.prices[selectedSqFtIndex] || service.minimumPrice;
    }
    
    // Add extras
    const extrasTotal = selectedExtras.reduce((sum, extraId) => {
      const extra = extras.find(e => e.id === extraId);
      return sum + (extra?.price || 0);
    }, 0);
    total += extrasTotal;
    
    return total;
  };

  const handleNext = async () => {
    if (step === 3) {
      // Submit booking and send confirmation email
      setIsSubmitting(true);
      const newConfirmationNumber = `BK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      setConfirmationNumber(newConfirmationNumber);
      
      try {
        const extraNames = selectedExtras.map(id => extras.find(e => e.id === id)?.name).filter(Boolean) as string[];
        
        const { error } = await supabase.functions.invoke('send-booking-email', {
          body: {
            customerName: customerInfo.name,
            customerEmail: customerInfo.email,
            customerPhone: customerInfo.phone,
            serviceName: service?.name || '',
            homeSize: selectedSqFtIndex !== null ? squareFootageRanges[selectedSqFtIndex].label : '',
            appointmentDate: selectedDate?.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            appointmentTime: selectedTime,
            address: customerInfo.address,
            city: customerInfo.city,
            state: customerInfo.state,
            zipCode: customerInfo.zipCode,
            extras: extraNames,
            totalPrice: calculateTotal(),
            confirmationNumber: newConfirmationNumber,
            organizationId: organizationId || undefined,
          },
        });
        
        if (error) {
          console.error('Email error:', error);
          toast.error('Booking confirmed but email failed to send');
        } else {
          toast.success('Booking confirmed! Check your email for confirmation.');
        }
      } catch (err) {
        console.error('Failed to send email:', err);
        toast.error('Booking confirmed but email failed to send');
      } finally {
        setIsSubmitting(false);
        setStep(4);
      }
    } else if (step < 4) {
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
      case 1: return selectedService !== null && selectedSqFtIndex !== null;
      case 2: return selectedDate !== undefined && selectedTime !== null;
      case 3: return customerInfo.name && customerInfo.email && customerInfo.phone && customerInfo.address;
      default: return true;
    }
  };

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto px-4 py-6">
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
                <p className="text-sm text-sidebar-foreground/70">Book your service online</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/staff/login">
                <Button variant="outline" className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80">
                  Staff Login
                </Button>
              </Link>
              <Link to="/admin">
                <Button variant="outline" className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80">
                  Admin Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-8">
            {[
              { num: 1, label: 'Select Service' },
              { num: 2, label: 'Choose Time' },
              { num: 3, label: 'Your Details' },
              { num: 4, label: 'Confirmation' },
            ].map((s, i) => (
              <div key={s.num} className="flex items-center gap-3">
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
                {i < 3 && (
                  <div className="w-12 h-0.5 bg-border hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Step 1: Select Service & Square Footage */}
          {step === 1 && (
            <div className="animate-fade-in space-y-8">
              {/* Square Footage Selection */}
              <div>
                <h2 className="text-2xl font-bold mb-2">Home Size</h2>
                <p className="text-muted-foreground mb-4">Select your home's square footage</p>
                <Card>
                  <CardContent className="p-6">
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
                        <CardContent className="p-6">
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

              {/* Extras - Only show if NOT Deep Clean (deep clean includes all add-ons) */}
              {service && !service.name.toLowerCase().includes('deep') && (
                <div>
                  <h2 className="text-2xl font-bold mb-2">Add Extras</h2>
                  <p className="text-muted-foreground mb-4">Optional add-on services</p>
                  <Card>
                    <CardContent className="p-6">
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
              
              {service && service.name.toLowerCase().includes('deep') && (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm font-medium text-primary">
                    ✨ Deep Clean includes all add-on services (windows, appliances, baseboards, walls, and more)
                  </p>
                </div>
              )}

              {/* Price Summary */}
              {selectedService && selectedSqFtIndex !== null && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Estimated Total</p>
                        <p className="text-3xl font-bold text-primary">${calculateTotal()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{service?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {squareFootageRanges[selectedSqFtIndex].label}
                        </p>
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
                        // Only block past dates and Sundays
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
                          // All time slots are available by default - actual availability 
                          // should be checked against existing bookings in a real implementation
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
                        <Input
                          id="name"
                          placeholder="John Doe"
                          className="pl-9"
                          value={customerInfo.name}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="john@example.com"
                          className="pl-9"
                          value={customerInfo.email}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number *</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="phone"
                          placeholder="(555) 123-4567"
                          className="pl-9"
                          value={customerInfo.phone}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Street Address *</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="address"
                          placeholder="123 Main Street"
                          className="pl-9"
                          value={customerInfo.address}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        placeholder="City"
                        value={customerInfo.city}
                        onChange={(e) => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          placeholder="State"
                          value={customerInfo.state}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, state: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zipCode">ZIP Code</Label>
                        <Input
                          id="zipCode"
                          placeholder="12345"
                          value={customerInfo.zipCode}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, zipCode: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Special Instructions (Optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any special requests or access instructions..."
                      value={customerInfo.notes}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                    />
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

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div className="animate-fade-in space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-success" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Booking Confirmed!</h2>
                <p className="text-muted-foreground">
                  Your appointment has been scheduled. You'll receive a confirmation email shortly.
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
                      Check your email for your full loyalty progress and tier benefits!
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
            {step > 1 && step < 4 && (
              <Button variant="outline" onClick={handleBack} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            {step === 1 && <div />}
            {step < 4 && (
              <Button onClick={handleNext} disabled={!canProceed() || isSubmitting} className="gap-2 ml-auto">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    {step === 3 ? 'Confirm Booking' : 'Continue'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            )}
            {step === 4 && (
              <Button onClick={() => setStep(1)} className="mx-auto">
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
