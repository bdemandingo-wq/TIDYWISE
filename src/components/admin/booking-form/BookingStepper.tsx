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
import { handleSmsError } from '@/lib/smsErrorHandler';
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
import { useCleanerConflicts } from '@/hooks/useCleanerConflicts';
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
  const [sendingQuoteSms, setSendingQuoteSms] = useState(false);
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
    isTeamMode,
    selectedTeamMembers,
    teamMemberPay,
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
    conflictOverride,
  } = useBookingForm();

  // Get customer phone for quote SMS
  const customerPhone = customerTab === 'existing' && selectedCustomer 
    ? selectedCustomer.phone 
    : newCustomer.phone;

  // Conflict detection for validation
  const { checkConflictsForStaff } = useCleanerConflicts(
    selectedDate,
    selectedTime,
    selectedService?.duration || 120,
    booking?.id
  );

  // Check if there are unresolved conflicts
  const hasUnresolvedConflicts = () => {
    if (conflictOverride) return false;
    
    if (isTeamMode && selectedTeamMembers.length > 0) {
      return selectedTeamMembers.some(staffId => {
        const conflicts = checkConflictsForStaff(staffId);
        return conflicts.length > 0;
      });
    } else if (selectedStaffId) {
      const conflicts = checkConflictsForStaff(selectedStaffId);
      return conflicts.length > 0;
    }
    
    return false;
  };

  // Send quote SMS handler - also creates a quote record
  const handleSendQuoteSms = async () => {
    if (!customerPhone) {
      toast.error('Customer phone number is required to send a quote');
      return;
    }
    
    const quoteAmount = totalAmount > 0 ? totalAmount : calculatedPrice;
    if (quoteAmount <= 0) {
      toast.error('Please configure service and pricing first');
      return;
    }

    setSendingQuoteSms(true);
    try {
      // First, ensure we have a customer ID (create new customer if needed)
      let customerId = selectedCustomerId;
      if (customerTab === 'new' && newCustomer.first_name && newCustomer.last_name && newCustomer.email) {
        const customer = await createCustomer.mutateAsync(newCustomer);
        customerId = customer.id;
      }

      // Create quote record in database
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7); // Valid for 7 days

      const { error: quoteError } = await supabase.from('quotes').insert({
        organization_id: organizationId,
        customer_id: customerId || null,
        service_id: selectedServiceId === 'reclean' ? null : selectedServiceId || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip_code: zipCode || null,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        square_footage: squareFootage || null,
        extras: selectedExtras || [],
        subtotal: quoteAmount,
        total_amount: quoteAmount,
        status: 'sent',
        valid_until: validUntil.toISOString(),
        notes: notes || null,
      });

      if (quoteError) throw quoteError;

      // Send SMS
      const message = `Hi ${customerName}! Here's your quote for ${selectedService?.name || 'cleaning services'}:\n\n` +
        `📍 Address: ${address}${city ? `, ${city}` : ''}\n` +
        `💰 Total: $${quoteAmount.toFixed(2)}\n\n` +
        `This quote is valid for 7 days. Reply YES to confirm or call us with any questions!`;

      const response = await supabase.functions.invoke('send-openphone-sms', {
        body: {
          to: customerPhone,
          message,
          organizationId: organizationId ?? undefined,
        },
      });
      
      // Handle SMS-specific errors
      if (handleSmsError(response)) {
        return;
      }
      toast.success('Quote saved and sent via SMS!');
    } catch (error: any) {
      console.error('Quote SMS error:', error);
      toast.error(error.message || 'Failed to send quote via SMS');
    } finally {
      setSendingQuoteSms(false);
    }
  };

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
        // Check for conflicts
        if (hasUnresolvedConflicts()) {
          toast.error('Please resolve the scheduling conflict or check the override box');
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
      total_amount: totalAmount > 0 ? totalAmount : calculatedPrice,
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

  // Check if this customer has future bookings that could be affected by changes
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

  // Detect what fields changed between original booking and current form state
  const getChangedFields = () => {
    if (!booking) return [];
    
    const changes: { field: string; oldValue: string; newValue: string; key: string }[] = [];
    
    // Staff change
    const oldStaffId = booking.staff?.id || '';
    if (selectedStaffId !== oldStaffId) {
      changes.push({
        field: 'Staff',
        oldValue: booking.staff?.name || 'Unassigned',
        newValue: staff?.find(s => s.id === selectedStaffId)?.name || 'Unassigned',
        key: 'staff_id'
      });
    }
    
    // Price change
    if (totalAmount !== booking.total_amount) {
      changes.push({
        field: 'Price',
        oldValue: `$${booking.total_amount?.toFixed(2) || '0.00'}`,
        newValue: `$${totalAmount.toFixed(2)}`,
        key: 'total_amount'
      });
    }
    
    // Time change (compare just the time portion)
    const oldDate = new Date(booking.scheduled_at);
    const oldTimeStr = `${oldDate.getHours().toString().padStart(2, '0')}:${oldDate.getMinutes().toString().padStart(2, '0')}`;
    if (selectedTime !== oldTimeStr) {
      const [newH, newM] = selectedTime.split(':').map(Number);
      const newPeriod = newH >= 12 ? 'PM' : 'AM';
      const newDisplayH = newH === 0 ? 12 : newH > 12 ? newH - 12 : newH;
      const oldPeriod = oldDate.getHours() >= 12 ? 'PM' : 'AM';
      const oldDisplayH = oldDate.getHours() === 0 ? 12 : oldDate.getHours() > 12 ? oldDate.getHours() - 12 : oldDate.getHours();
      
      changes.push({
        field: 'Time',
        oldValue: `${oldDisplayH}:${oldDate.getMinutes().toString().padStart(2, '0')} ${oldPeriod}`,
        newValue: `${newDisplayH}:${newM.toString().padStart(2, '0')} ${newPeriod}`,
        key: 'scheduled_time'
      });
    }
    
    // Service change
    const isReclean = selectedServiceId === 'reclean';
    const oldServiceId = booking.service?.id || '';
    if (!isReclean && selectedServiceId !== oldServiceId) {
      changes.push({
        field: 'Service',
        oldValue: booking.service?.name || 'None',
        newValue: selectedService?.name || 'None',
        key: 'service_id'
      });
    }
    
    return changes;
  };

  const handleSubmit = async (isDraft: boolean = false, skipRecurringCheck: boolean = false) => {
    // Final validation - validate all steps
    for (let i = 0; i < steps.length; i++) {
      if (!validateStep(steps[i].id) && !isDraft) {
        setCurrentStep(i);
        return;
      }
    }

    // Check if we're editing an existing booking and important fields changed
    // Empty string id means duplicate - treat as new booking
    const isExistingBooking = booking?.id && booking.id.length > 10;
    if (isExistingBooking && !skipRecurringCheck) {
      const changedFields = getChangedFields();
      const futureBookings = getFutureBookingsForCustomer();
      
      if (changedFields.length > 0 && futureBookings.length > 0) {
        const bookingData = await buildBookingData(isDraft);
        setPendingBookingData({ bookingData, isDraft, futureBookings, changedFields });
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

      // Check for valid UUID - empty string means this is a duplicate (new booking)
      const isExistingBooking = booking?.id && booking.id.length > 10;
      
      if (isExistingBooking) {
        await updateBooking.mutateAsync({ id: booking.id, ...bookingData });
        
        // If user chose to apply to future bookings, update those too
        if (updateFutureBookings && pendingBookingData?.futureBookings && pendingBookingData?.changedFields) {
          const futureBookings = pendingBookingData.futureBookings as BookingWithDetails[];
          const changedFields = pendingBookingData.changedFields as { key: string }[];
          
          for (const futureBooking of futureBookings) {
            const updateData: Record<string, any> = { id: futureBooking.id };
            
            // Apply each changed field to future bookings
            for (const change of changedFields) {
              if (change.key === 'staff_id') {
                updateData.staff_id = bookingData.staff_id;
              }
              if (change.key === 'total_amount') {
                updateData.total_amount = bookingData.total_amount;
              }
              if (change.key === 'scheduled_time') {
                // Update just the time on the future booking's date
                const futureDate = new Date(futureBooking.scheduled_at);
                const [hours, minutes] = selectedTime.split(':').map(Number);
                futureDate.setHours(hours, minutes, 0, 0);
                updateData.scheduled_at = futureDate.toISOString();
              }
              if (change.key === 'service_id') {
                updateData.service_id = bookingData.service_id;
              }
            }
            
            await updateBooking.mutateAsync(updateData as { id: string } & Partial<typeof bookingData>);
          }
          toast.success(`Booking updated and ${changedFields.length} change(s) applied to ${futureBookings.length} future booking(s)`);
        } else {
          toast.success('Booking updated successfully');
        }
      } else {
        const finalBookingData = {
          ...bookingData,
          payment_status: 'pending' as const,
          payment_intent_id: undefined,
        };

        const newBooking = await createBooking.mutateAsync(finalBookingData);

        // Save team assignments if in team mode
        if (isTeamMode && selectedTeamMembers.length > 0 && newBooking?.id) {
          for (let i = 0; i < selectedTeamMembers.length; i++) {
            const staffId = selectedTeamMembers[i];
            
            // Use the manually entered pay from teamMemberPay, or fall back to calculation
            let payShare = teamMemberPay[staffId];
            
            if (payShare === undefined || payShare === 0) {
              // Fall back to calculation if no manual entry
              const staffMember = staff?.find(s => s.id === staffId);
              const jobTotal = totalAmount > 0 ? totalAmount : calculatedPrice;
              const teamSize = selectedTeamMembers.length;
              const wageToUse = cleanerWage ? parseFloat(cleanerWage) : null;
              
              if (wageToUse) {
                if (cleanerWageType === 'flat') {
                  payShare = wageToUse / teamSize;
                } else if (cleanerWageType === 'percentage') {
                  payShare = (jobTotal * wageToUse / 100) / teamSize;
                } else {
                  payShare = wageToUse * 2;
                }
              } else if (staffMember?.percentage_rate) {
                payShare = (jobTotal * staffMember.percentage_rate / 100) / teamSize;
              } else if (staffMember?.hourly_rate) {
                payShare = staffMember.hourly_rate * 2;
              } else {
                payShare = 0;
              }
            }

            await supabase.from('booking_team_assignments').insert({
              booking_id: newBooking.id,
              staff_id: staffId,
              pay_share: payShare,
              is_primary: i === 0,
            });
          }
        }

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
                
                const response = await supabase.functions.invoke('send-openphone-sms', {
                  body: {
                    to: customerPhone,
                    message: `Hi ${customerName}! Your ${selectedService?.name || 'cleaning'} appointment is confirmed for ${format(scheduledDate, 'MMMM d, yyyy')} at ${format(scheduledDate, 'h:mm a')}. Address: ${address}${city ? `, ${city}` : ''}. Reply to this message with any questions!`,
                    organizationId: organizationId ?? undefined,
                  },
                });
                // Handle SMS-specific errors
                if (!handleSmsError(response)) {
                  toast.success('Confirmation text sent to customer');
                }
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
      case 'schedule': return <ScheduleStep currentBookingId={booking?.id} />;
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
              Apply Changes to Future Bookings?
            </DialogTitle>
            <DialogDescription>
              This customer has {pendingBookingData?.futureBookings?.length || 0} upcoming booking(s). 
              Would you like to apply {pendingBookingData?.changedFields?.length === 1 ? 'this change' : 'these changes'} to all future bookings?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {/* Show all detected changes */}
            <div className="space-y-2">
              {pendingBookingData?.changedFields?.map((change: { field: string; oldValue: string; newValue: string; key: string }, idx: number) => (
                <div key={idx} className="text-sm p-2 bg-secondary/50 rounded flex justify-between items-center">
                  <span className="font-medium">{change.field}:</span>
                  <span>
                    <span className="text-muted-foreground line-through mr-2">{change.oldValue}</span>
                    →
                    <span className="font-medium text-foreground ml-2">{change.newValue}</span>
                  </span>
                </div>
              ))}
            </div>
            
            <Separator />
            
            <p className="text-xs text-muted-foreground font-medium">Future bookings affected:</p>
            {pendingBookingData?.futureBookings?.slice(0, 3).map((fb: BookingWithDetails) => (
              <div key={fb.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
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

          <div className="flex items-center gap-3 flex-wrap">
            {currentStep === steps.length - 1 ? (
              <>
                <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg">
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

                {/* Send Quote via SMS button */}
                <Button 
                  variant="outline" 
                  onClick={handleSendQuoteSms} 
                  disabled={sendingQuoteSms || !customerPhone}
                  className="h-11"
                  title={!customerPhone ? 'Customer phone required' : 'Send quote to customer'}
                >
                  {sendingQuoteSms ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="mr-2 h-4 w-4" />
                  )}
                  Send Quote SMS
                </Button>

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
