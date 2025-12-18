import { useState } from 'react';
import { mockServices, mockStaff } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const timeSlots = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00'
];

export default function PublicBookingPage() {
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
  });

  const service = mockServices.find(s => s.id === selectedService);

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const canProceed = () => {
    switch (step) {
      case 1: return selectedService !== null;
      case 2: return selectedDate !== undefined && selectedTime !== null;
      case 3: return customerInfo.name && customerInfo.email && customerInfo.phone && customerInfo.address;
      default: return true;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Footprint Cleaning</h1>
                <p className="text-sm text-sidebar-foreground/70">Book your service online</p>
              </div>
            </div>
            <Link to="/admin">
              <Button variant="outline" className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80">
                Admin Login
              </Button>
            </Link>
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
          {/* Step 1: Select Service */}
          {step === 1 && (
            <div className="animate-fade-in">
              <h2 className="text-2xl font-bold mb-2">Select a Service</h2>
              <p className="text-muted-foreground mb-6">Choose the service you'd like to book</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mockServices.filter(s => s.isActive).map((service) => (
                  <Card
                    key={service.id}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      selectedService === service.id && 'ring-2 ring-primary'
                    )}
                    onClick={() => setSelectedService(service.id)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${service.color}20`, color: service.color }}
                        >
                          <CalendarIcon className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold">{service.name}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
                          <div className="flex items-center gap-4 mt-3">
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              {service.duration} min
                            </div>
                            <div className="flex items-center gap-1 text-sm font-semibold">
                              <DollarSign className="w-4 h-4 text-success" />
                              {service.price}
                            </div>
                          </div>
                        </div>
                        {selectedService === service.id && (
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-4 h-4 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
                      disabled={(date) => date < new Date() || date.getDay() === 0}
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
                      <div className="grid grid-cols-2 gap-2">
                        {timeSlots.map((time) => {
                          const available = Math.random() > 0.3; // Simulated availability
                          return (
                            <Button
                              key={time}
                              variant={selectedTime === time ? 'default' : 'outline'}
                              className={cn(
                                'h-12',
                                !available && 'opacity-50 cursor-not-allowed'
                              )}
                              disabled={!available}
                              onClick={() => setSelectedTime(time)}
                            >
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
                      <Label htmlFor="address">Service Address *</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="address"
                          placeholder="123 Main St, City, State"
                          className="pl-9"
                          value={customerInfo.address}
                          onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
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
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-success" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Booking Confirmed!</h2>
                <p className="text-muted-foreground">
                  Your appointment has been scheduled. You'll receive a confirmation email shortly.
                </p>
              </div>
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
                      <p className="text-sm text-muted-foreground">Price</p>
                      <p className="font-semibold text-success">${service?.price}</p>
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
                    <div>
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">{customerInfo.address}</p>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <Badge className="bg-success/20 text-success border-success/30">
                      Confirmation #BK-{Math.random().toString(36).substr(2, 9).toUpperCase()}
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
              <Button onClick={handleNext} disabled={!canProceed()} className="gap-2 ml-auto">
                {step === 3 ? 'Confirm Booking' : 'Continue'}
                <ArrowRight className="w-4 h-4" />
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
    </div>
  );
}
