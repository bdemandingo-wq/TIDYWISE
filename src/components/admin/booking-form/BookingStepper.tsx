import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  ChevronLeft, 
  ChevronRight, 
  User, 
  MapPin, 
  FileText, 
  Calendar, 
  CreditCard,
  Loader2,
  Save,
  Copy,
  Mail,
  Check,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, addWeeks, addMonths } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useCreateBooking, useUpdateBooking, useCreateCustomer, BookingWithDetails } from '@/hooks/useBookings';
import { extras as extrasData } from '@/data/pricingData';
import { useBookingForm } from './BookingFormContext';
import { CustomerStep } from './steps/CustomerStep';
import { PropertyStep } from './steps/PropertyStep';
import { ServiceStep } from './steps/ServiceStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { PaymentStep } from './steps/PaymentStep';

const STEPS = [
  { id: 'customer', label: 'Customer', icon: User },
  { id: 'property', label: 'Property', icon: MapPin },
  { id: 'service', label: 'Service', icon: FileText },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'payment', label: 'Payment', icon: CreditCard },
];

interface BookingStepperProps {
  booking?: BookingWithDetails | null;
  onClose: () => void;
  onDuplicate?: (booking: BookingWithDetails) => void;
}

export function BookingStepper({ booking, onClose, onDuplicate }: BookingStepperProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();
  const createCustomer = useCreateCustomer();

  const {
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
    setSendConfirmationEmail,
    selectedService,
    selectedCustomer,
    customerEmail,
    customerName,
    extrasTotal,
    resetForm,
  } = useBookingForm();

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0: // Customer
        if (customerTab === 'existing' && !selectedCustomerId) {
          toast.error('Please select a customer');
          return false;
        }
        if (customerTab === 'new' && (!newCustomer.first_name || !newCustomer.last_name || !newCustomer.email)) {
          toast.error('Please fill in customer name and email');
          return false;
        }
        return true;
      case 1: // Property
        return true; // Optional
      case 2: // Service
        if (!selectedServiceId) {
          toast.error('Please select a service');
          return false;
        }
        return true;
      case 3: // Schedule
        if (!selectedDate || !selectedTime) {
          toast.error('Please select a date and time');
          return false;
        }
        return true;
      case 4: // Payment
        return true; // Optional
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const goToStep = (step: number) => {
    // Allow going back to any step, but forward only if current is valid
    if (step < currentStep || validateStep(currentStep)) {
      setCurrentStep(step);
    }
  };

  const buildBookingData = async (isDraft: boolean) => {
    let customerId = selectedCustomerId;

    if (customerTab === 'new') {
      const customer = await createCustomer.mutateAsync(newCustomer);
      customerId = customer.id;
    }

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
      cleaner_wage: cleanerWage ? parseFloat(cleanerWage) : null,
      cleaner_wage_type: cleanerWageType,
      cleaner_override_hours: cleanerOverrideHours ? parseFloat(cleanerOverrideHours) : null,
    };
  };

  const createRecurringBookings = async (baseBookingData: any) => {
    if (frequency === 'one_time') return;

    const bookingsToCreate: any[] = [];
    const baseDate = new Date(baseBookingData.scheduled_at);
    const numBookings = 3;
    
    for (let i = 1; i <= numBookings; i++) {
      let nextDate: Date;
      if (frequency === 'weekly') {
        nextDate = addWeeks(baseDate, i);
      } else if (frequency === 'biweekly') {
        nextDate = addWeeks(baseDate, i * 2);
      } else {
        nextDate = addMonths(baseDate, i);
      }

      bookingsToCreate.push({
        ...baseBookingData,
        scheduled_at: nextDate.toISOString(),
        payment_intent_id: null,
      });
    }

    for (const bookingData of bookingsToCreate) {
      await createBooking.mutateAsync(bookingData);
    }
  };

  const handleSubmit = async (isDraft: boolean = false) => {
    // Final validation
    for (let i = 0; i < STEPS.length; i++) {
      if (!validateStep(i) && !isDraft) {
        setCurrentStep(i);
        return;
      }
    }

    if (isDraft) {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }

    try {
      const bookingData = await buildBookingData(isDraft);

      if (booking?.id) {
        await updateBooking.mutateAsync({ id: booking.id, ...bookingData });
        toast.success('Booking updated successfully');
      } else {
        const finalBookingData = {
          ...bookingData,
          payment_status: 'pending' as const,
          payment_intent_id: undefined,
        };

        await createBooking.mutateAsync(finalBookingData);

        if (!isDraft && frequency !== 'one_time') {
          await createRecurringBookings(finalBookingData);
          toast.success(`Booking created with ${frequency} recurring schedule`);
        } else {
          toast.success(isDraft ? 'Draft quote saved' : 'Booking created successfully');
        }

        if (!isDraft) {
          try {
            await supabase.functions.invoke('send-admin-booking-notification', {
              body: {
                customerName,
                customerEmail,
                serviceName: selectedService?.name,
                scheduledAt: bookingData.scheduled_at,
                totalAmount,
                address,
              }
            });
          } catch (emailError) {
            console.error('Failed to send admin notification:', emailError);
          }

          if (sendConfirmationEmail && customerEmail) {
            try {
              const scheduledDate = new Date(bookingData.scheduled_at);
              const extraNames = selectedExtras
                .map((id) => extrasData.find((e) => e.id === id)?.name)
                .filter(Boolean) as string[];

              const { error } = await supabase.functions.invoke('send-booking-email', {
                body: {
                  customerName,
                  customerEmail,
                  customerPhone: customerTab === 'existing' && selectedCustomer ? selectedCustomer.phone : newCustomer.phone,
                  serviceName: selectedService?.name || 'Cleaning Service',
                  homeSize: squareFootage || 'Not specified',
                  appointmentDate: format(scheduledDate, 'MMMM d, yyyy'),
                  appointmentTime: format(scheduledDate, 'h:mm a'),
                  address,
                  city,
                  state,
                  zipCode,
                  extras: extraNames,
                  totalPrice: totalAmount,
                  confirmationNumber: `FPC-${Date.now().toString(36).toUpperCase()}`,
                },
              });
              if (error) throw error;
              toast.success('Confirmation email sent to customer');
            } catch (emailError: any) {
              toast.error(emailError?.message || 'Failed to send confirmation email');
            }
          }
        }
      }

      onClose();
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save booking');
    } finally {
      setSubmitting(false);
      setSavingDraft(false);
    }
  };

  const handleDuplicate = () => {
    if (!booking) return;
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

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: return <CustomerStep />;
      case 1: return <PropertyStep />;
      case 2: return <ServiceStep />;
      case 3: return <ScheduleStep />;
      case 4: return <PaymentStep />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-6 px-1">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => goToStep(index)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200",
                    isActive && "bg-primary text-primary-foreground shadow-lg",
                    isCompleted && "bg-primary/10 text-primary",
                    !isActive && !isCompleted && "text-muted-foreground hover:bg-secondary/50"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                    isActive && "bg-primary-foreground/20",
                    isCompleted && "bg-primary text-primary-foreground",
                    !isActive && !isCompleted && "bg-secondary"
                  )}>
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <span className="hidden md:block text-sm font-medium">{step.label}</span>
                </button>
                {index < STEPS.length - 1 && (
                  <div className={cn(
                    "w-8 lg:w-12 h-0.5 mx-1",
                    index < currentStep ? "bg-primary" : "bg-border"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto pr-2">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 mt-6 border-t border-border/50">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="h-11"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            {currentStep === STEPS.length - 1 ? (
              <>
                <div className="flex items-center gap-2 mr-4 p-2 bg-secondary/30 rounded-lg">
                  <Checkbox 
                    id="sendConfirmation" 
                    checked={sendConfirmationEmail} 
                    onCheckedChange={(checked) => setSendConfirmationEmail(checked as boolean)} 
                  />
                  <Label htmlFor="sendConfirmation" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Send email
                  </Label>
                </div>

                {booking && (
                  <Button variant="outline" onClick={handleDuplicate} className="h-11">
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </Button>
                )}

                <Button 
                  variant="secondary" 
                  onClick={() => handleSubmit(true)} 
                  disabled={savingDraft || submitting}
                  className="h-11"
                >
                  {savingDraft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Save Draft
                </Button>

                <Button 
                  onClick={() => handleSubmit(false)} 
                  disabled={submitting || savingDraft}
                  className="h-11 px-6 bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-md"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {booking ? 'Update Booking' : 'Create Booking'}
                </Button>
              </>
            ) : (
              <Button onClick={handleNext} className="h-11 px-6">
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Price Summary Sidebar */}
      <div className="lg:w-72 lg:sticky lg:top-0 lg:self-start">
        <div className="bg-gradient-to-br from-card via-card to-secondary/20 rounded-2xl border border-border/50 p-5 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h4 className="font-semibold">Price Summary</h4>
          </div>

          <Separator className="mb-4" />

          <div className="space-y-3">
            {selectedService && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{selectedService.name}</span>
                <span className="font-medium">${totalAmount.toFixed(2)}</span>
              </div>
            )}

            {extrasTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Add-ons</span>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                  +${extrasTotal}
                </Badge>
              </div>
            )}

            {selectedDate && selectedTime && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium text-xs text-right">
                  {format(selectedDate, 'MMM d, yyyy')}<br/>
                  <span className="text-muted-foreground">{selectedTime}</span>
                </span>
              </div>
            )}
          </div>

          <Separator className="my-4" />

          <div className="flex justify-between items-center">
            <span className="font-medium">Total</span>
            <span className="text-2xl font-bold text-primary">
              ${(totalAmount + extrasTotal).toFixed(2)}
            </span>
          </div>

          {booking?.is_draft && (
            <Badge variant="secondary" className="mt-4 w-full justify-center bg-amber-100 text-amber-700 border-amber-200">
              Draft Quote
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
