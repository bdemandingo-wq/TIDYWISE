import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  MessageSquare,
  Check,
  Sparkles,
  AlertCircle,
  GripVertical,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, addWeeks, addMonths, isAfter } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useCreateBooking, useUpdateBooking, useCreateCustomer, BookingWithDetails, useBookings } from '@/hooks/useBookings';
import { extras as extrasData } from '@/data/pricingData';
import { useBookingForm } from './BookingFormContext';
import { CustomerStep } from './steps/CustomerStep';
import { PropertyStep } from './steps/PropertyStep';
import { ServiceStep } from './steps/ServiceStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { PaymentStep } from './steps/PaymentStep';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DEFAULT_STEPS = [
  { id: 'customer', label: 'Customer', icon: User },
  { id: 'property', label: 'Property', icon: MapPin },
  { id: 'service', label: 'Service', icon: FileText },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'payment', label: 'Payment', icon: CreditCard },
];

const iconMap: Record<string, typeof User> = {
  User, MapPin, FileText, Calendar, CreditCard
};

interface StepItem {
  id: string;
  label: string;
  icon: typeof User;
}

interface SortableStepProps {
  step: StepItem;
  index: number;
  currentStep: number;
  totalSteps: number;
  onClick: () => void;
}

function SortableStep({ step, index, currentStep, totalSteps, onClick }: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = step.icon;
  const isActive = index === currentStep;
  const isCompleted = index < currentStep;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <div className="flex items-center group">
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity",
            isDragging && "opacity-100"
          )}
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </button>
        <button
          onClick={onClick}
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
      </div>
      {index < totalSteps - 1 && (
        <div className={cn(
          "w-8 lg:w-12 h-0.5 mx-1",
          index < currentStep ? "bg-primary" : "bg-border"
        )} />
      )}
    </div>
  );
}

interface BookingStepperProps {
  booking?: BookingWithDetails | null;
  onClose: () => void;
  onDuplicate?: (booking: BookingWithDetails) => void;
}

export function BookingStepper({ booking, onClose, onDuplicate }: BookingStepperProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [steps, setSteps] = useState<StepItem[]>(DEFAULT_STEPS);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [pendingBookingData, setPendingBookingData] = useState<any>(null);
  const [applyToFuture, setApplyToFuture] = useState(false);
  
  // Get all bookings to check for future recurring bookings
  const { data: allBookings = [] } = useBookings();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load step order from localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem('tidywise_booking_steps_order');
    if (savedOrder) {
      try {
        const stepIds: string[] = JSON.parse(savedOrder);
        const reordered = stepIds
          .map(id => DEFAULT_STEPS.find(s => s.id === id))
          .filter((s): s is StepItem => s !== undefined);
        
        // Add any missing steps
        DEFAULT_STEPS.forEach(step => {
          if (!reordered.find(r => r.id === step.id)) {
            reordered.push(step);
          }
        });
        
        setSteps(reordered);
      } catch (e) {
        console.error('Error parsing step order:', e);
      }
    }
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSteps((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        
        // Save to localStorage
        localStorage.setItem('tidywise_booking_steps_order', JSON.stringify(newOrder.map(s => s.id)));
        
        return newOrder;
      });
    }
  };

  const { organizationId } = useOrgId();

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
    sendConfirmationSms,
    setSendConfirmationSms,
    selectedService,
    selectedCustomer,
    customerEmail,
    customerName,
    extrasTotal,
    calculatedPrice,
    finalPrice,
    resetForm,
    staff,
  } = useBookingForm();

  const validateStep = (stepId: string): boolean => {
    switch (stepId) {
      case 'customer':
        if (customerTab === 'existing' && !selectedCustomerId) {
          toast.error('Please select a customer');
          return false;
        }
        if (customerTab === 'new' && (!newCustomer.first_name || !newCustomer.last_name || !newCustomer.email)) {
          toast.error('Please fill in customer name and email');
          return false;
        }
        return true;
      case 'property':
        return true;
      case 'service':
        if (!selectedServiceId) {
          toast.error('Please select a service');
          return false;
        }
        return true;
      case 'schedule':
        if (!selectedDate || !selectedTime) {
          toast.error('Please select a date and time');
          return false;
        }
        return true;
      case 'payment':
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(steps[currentStep].id)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const goToStep = (stepIndex: number) => {
    if (stepIndex < currentStep || validateStep(steps[currentStep].id)) {
      setCurrentStep(stepIndex);
    }
  };

  const buildBookingData = async (isDraft: boolean) => {
    let customerId = selectedCustomerId;

    if (customerTab === 'new') {
      const customer = await createCustomer.mutateAsync(newCustomer);
      customerId = customer.id;
    }

    // Parse 24h time format (HH:mm)
    const [hours, minutes] = selectedTime.split(':').map(Number);

    const scheduledAt = new Date(selectedDate!);
    scheduledAt.setHours(hours, minutes, 0, 0);

    // Handle "reclean" special case - it's not a real service UUID
    const isReclean = selectedServiceId === 'reclean';
    
    return {
      customer_id: customerId || null,
      service_id: isReclean ? null : (selectedServiceId && selectedServiceId.length > 0 ? selectedServiceId : null),
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

  // Check if this customer has future bookings that could be affected by staff change
  const getFutureBookingsForCustomer = () => {
    if (!booking?.customer?.id) return [];
    const now = new Date();
    return allBookings.filter(b => 
      b.customer?.id === booking.customer?.id &&
      b.id !== booking.id &&
      isAfter(new Date(b.scheduled_at), now) &&
      !['cancelled', 'completed'].includes(b.status)
    );
  };

  const handleSubmit = async (isDraft: boolean = false, skipRecurringCheck: boolean = false) => {
    // Final validation - validate all steps
    for (let i = 0; i < steps.length; i++) {
      if (!validateStep(steps[i].id) && !isDraft) {
        setCurrentStep(i);
        return;
      }
    }

    // Check if we're editing an existing booking and staff changed
    if (booking?.id && !skipRecurringCheck) {
      const staffChanged = selectedStaffId !== (booking.staff?.id || '');
      const futureBookings = getFutureBookingsForCustomer();
      
      if (staffChanged && futureBookings.length > 0) {
        const bookingData = await buildBookingData(isDraft);
        setPendingBookingData({ bookingData, isDraft, futureBookings });
        setShowRecurringDialog(true);
        return;
      }
    }

    await executeSubmit(isDraft);
  };

  const executeSubmit = async (isDraft: boolean = false, updateFutureBookings: boolean = false) => {
    if (isDraft) {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }

    try {
      const bookingData = pendingBookingData?.bookingData || await buildBookingData(isDraft);

      if (booking?.id) {
        await updateBooking.mutateAsync({ id: booking.id, ...bookingData });
        
        // If user chose to apply to future bookings, update those too
        if (updateFutureBookings && pendingBookingData?.futureBookings) {
          const futureBookings = pendingBookingData.futureBookings as BookingWithDetails[];
          for (const futureBooking of futureBookings) {
            await updateBooking.mutateAsync({ 
              id: futureBooking.id, 
              staff_id: bookingData.staff_id 
            });
          }
          toast.success(`Booking updated and staff assigned to ${futureBookings.length} future booking(s)`);
        } else {
          toast.success('Booking updated successfully');
        }
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
          const adminScheduledDate = new Date(selectedDate!);
          // Parse 24h time format (HH:mm)
          const [adminHours, adminMinutes] = selectedTime.split(':').map(Number);
          adminScheduledDate.setHours(adminHours, adminMinutes, 0, 0);
          
          const formattedDateStr = format(adminScheduledDate, 'MMMM d, yyyy');
          const formattedTimeStr = format(adminScheduledDate, 'h:mm a');

          supabase.functions.invoke('send-admin-sms-notification', {
            body: {
              customerName,
              serviceName: selectedService?.name,
              scheduledAt: bookingData.scheduled_at,
              formattedDate: formattedDateStr,
              formattedTime: formattedTimeStr,
              totalAmount,
              address,
              organizationId: organizationId ?? undefined,
            }
          }).then(({ error }) => {
            if (error) {
              console.log('Admin SMS notification skipped (SMS may not be configured)');
            }
          }).catch((err) => {
            console.log('Admin SMS notification failed:', err);
          });

          if (sendConfirmationSms) {
            const customerPhone = customerTab === 'existing' && selectedCustomer ? selectedCustomer.phone : newCustomer.phone;
            if (customerPhone) {
              try {
                // Parse 24h time format (HH:mm)
                const [hours, minutes] = selectedTime.split(':').map(Number);
                
                const scheduledDate = new Date(selectedDate!);
                scheduledDate.setHours(hours, minutes, 0, 0);
                
                const { error } = await supabase.functions.invoke('send-openphone-sms', {
                  body: {
                    to: customerPhone,
                    message: `Hi ${customerName}! Your ${selectedService?.name || 'cleaning'} appointment is confirmed for ${format(scheduledDate, 'MMMM d, yyyy')} at ${format(scheduledDate, 'h:mm a')}. Address: ${address}${city ? `, ${city}` : ''}. Reply to this message with any questions!`,
                    organizationId: organizationId ?? undefined,
                  },
                });
                if (error) throw error;
                toast.success('Confirmation text sent to customer');
              } catch (smsError: any) {
                console.error('SMS error:', smsError);
                toast.error('Failed to send confirmation text');
              }
            } else {
              toast.warning('No phone number available for SMS');
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
      setPendingBookingData(null);
    }
  };

  const handleRecurringDialogConfirm = async (applyToFutureBookings: boolean) => {
    setShowRecurringDialog(false);
    await executeSubmit(pendingBookingData?.isDraft || false, applyToFutureBookings);
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
    const stepId = steps[currentStep]?.id;
    switch (stepId) {
      case 'customer': return <CustomerStep />;
      case 'property': return <PropertyStep />;
      case 'service': return <ServiceStep />;
      case 'schedule': return <ScheduleStep />;
      case 'payment': return <PaymentStep />;
      default: return null;
    }
  };

  return (
    <>
      {/* Recurring Change Dialog */}
      <Dialog open={showRecurringDialog} onOpenChange={setShowRecurringDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Apply to Future Bookings?
            </DialogTitle>
            <DialogDescription>
              This customer has {pendingBookingData?.futureBookings?.length || 0} upcoming booking(s). 
              Would you like to assign the same staff member to all future bookings?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Staff change: <span className="font-medium text-foreground">{booking?.staff?.name || 'Unassigned'}</span> → <span className="font-medium text-foreground">{staff?.find(s => s.id === selectedStaffId)?.name || 'Unassigned'}</span>
            </p>
            {pendingBookingData?.futureBookings?.slice(0, 3).map((fb: BookingWithDetails) => (
              <div key={fb.id} className="flex items-center justify-between text-sm p-2 bg-secondary/50 rounded">
                <span>{format(new Date(fb.scheduled_at), 'MMM d, yyyy')}</span>
                <span className="text-muted-foreground">{fb.service?.name}</span>
              </div>
            ))}
            {(pendingBookingData?.futureBookings?.length || 0) > 3 && (
              <p className="text-xs text-muted-foreground">
                ...and {pendingBookingData.futureBookings.length - 3} more
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => handleRecurringDialogConfirm(false)}
            >
              This Booking Only
            </Button>
            <Button 
              onClick={() => handleRecurringDialogConfirm(true)}
            >
              Apply to All Future
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-6 px-1 overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map(s => s.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex items-center">
                {steps.map((step, index) => (
                  <SortableStep
                    key={step.id}
                    step={step}
                    index={index}
                    currentStep={currentStep}
                    totalSteps={steps.length}
                    onClick={() => goToStep(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
            {currentStep === steps.length - 1 ? (
              <>
                <div className="flex items-center gap-2 mr-4 p-2 bg-secondary/30 rounded-lg">
                  <Checkbox
                    id="sendConfirmationSms"
                    checked={sendConfirmationSms}
                    onCheckedChange={(checked) => setSendConfirmationSms(checked as boolean)}
                  />
                  <Label
                    htmlFor="sendConfirmationSms"
                    className="text-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    Send confirmation text
                  </Label>
                </div>

                {booking && (
                  <Button variant="outline" onClick={handleDuplicate} className="h-11">
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </Button>
                )}

                <div className="relative group">
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
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-popover border rounded-lg shadow-lg text-xs text-muted-foreground z-50">
                    Drafts appear in your Bookings list with "pending payment" status
                  </div>
                </div>

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

          <div className="space-y-3 text-sm">
            {selectedService && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{selectedService.name}</span>
                <span className="font-medium">${calculatedPrice.toFixed(2)}</span>
              </div>
            )}

            {extrasTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Add-ons</span>
                <span className="font-medium">+${extrasTotal.toFixed(2)}</span>
              </div>
            )}

            <Separator />

            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">${finalPrice.toFixed(2)}</span>
            </div>

            {frequency !== 'one_time' && (
              <Badge variant="secondary" className="w-full justify-center mt-2">
                {frequency === 'weekly' && 'Weekly Recurring'}
                {frequency === 'biweekly' && 'Bi-Weekly Recurring'}
                {frequency === 'monthly' && 'Monthly Recurring'}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
