import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCreateBooking, useCreateCustomer, useServices, useStaff, useCustomers } from '@/hooks/useBookings';
import { cleaningServices, squareFootageRanges, getSqFtIndexFromValue, getPriceForService, CleaningServiceType } from '@/data/pricingData';

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
}

export function AddBookingDialog({ open, onOpenChange, defaultDate }: AddBookingDialogProps) {
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  
  // New customer fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  
  // Booking fields
  const [selectedService, setSelectedService] = useState<CleaningServiceType | ''>('');
  const [squareFootage, setSquareFootage] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(
    defaultDate ? defaultDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [notes, setNotes] = useState('');

  const { data: existingCustomers = [] } = useCustomers();
  const { data: dbServices = [] } = useServices();
  const { data: staff = [] } = useStaff();
  const createBooking = useCreateBooking();
  const createCustomer = useCreateCustomer();

  // Calculate price based on service and square footage
  const calculatePrice = () => {
    if (!selectedService || !squareFootage) return 0;
    const sqFtIndex = getSqFtIndexFromValue(parseInt(squareFootage));
    return getPriceForService(selectedService as CleaningServiceType, sqFtIndex);
  };

  const resetForm = () => {
    setCustomerType('new');
    setSelectedCustomerId('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setCity('');
    setState('');
    setZipCode('');
    setSelectedService('');
    setSquareFootage('');
    setSelectedStaffId('');
    setScheduledDate(new Date().toISOString().split('T')[0]);
    setScheduledTime('09:00');
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      let customerId = selectedCustomerId;
      let customerAddress = address;
      let customerCity = city;
      let customerState = state;
      let customerZip = zipCode;

      // If new customer, create them first
      if (customerType === 'new') {
        const newCustomer = await createCustomer.mutateAsync({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || undefined,
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          zip_code: zipCode || undefined,
        });
        customerId = newCustomer.id;
      } else {
        // Use existing customer's address
        const existingCustomer = existingCustomers.find(c => c.id === selectedCustomerId);
        if (existingCustomer) {
          customerAddress = existingCustomer.address || address;
          customerCity = existingCustomer.city || city;
          customerState = existingCustomer.state || state;
          customerZip = existingCustomer.zip_code || zipCode;
        }
      }

      // Find matching service in database or use first one
      const serviceData = cleaningServices.find(s => s.id === selectedService);
      const dbService = dbServices.find(s => s.name.toLowerCase().includes(selectedService.replace('_', ' '))) || dbServices[0];

      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      const totalAmount = calculatePrice();

      await createBooking.mutateAsync({
        customer_id: customerId || undefined,
        service_id: dbService?.id,
        staff_id: selectedStaffId || undefined,
        scheduled_at: scheduledAt,
        duration: serviceData?.id.includes('deep') || serviceData?.id.includes('move') ? 180 : 120,
        total_amount: totalAmount,
        status: 'pending',
        payment_status: 'pending',
        notes: notes ? `${serviceData?.name} - ${squareFootage} sq ft. ${notes}` : `${serviceData?.name} - ${squareFootage} sq ft`,
        address: customerAddress || undefined,
        city: customerCity || undefined,
        state: customerState || undefined,
        zip_code: customerZip || undefined,
      });

      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create booking:', error);
    }
  };

  const isSubmitting = createBooking.isPending || createCustomer.isPending;
  const price = calculatePrice();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Booking</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Customer</h3>
            
            <div className="flex gap-2">
              <Button
                type="button"
                variant={customerType === 'new' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCustomerType('new')}
              >
                New Customer
              </Button>
              <Button
                type="button"
                variant={customerType === 'existing' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCustomerType('existing')}
              >
                Existing Customer
              </Button>
            </div>

            {customerType === 'existing' ? (
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {existingCustomers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.first_name} {customer.last_name} - {customer.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street address"
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ZIP</Label>
                    <Input
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Service Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Service</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Service Type *</Label>
                <Select value={selectedService} onValueChange={(v) => setSelectedService(v as CleaningServiceType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {cleaningServices.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Square Footage *</Label>
                <Select value={squareFootage} onValueChange={setSquareFootage}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {squareFootageRanges.map((range) => (
                      <SelectItem key={range.maxSqFt} value={range.maxSqFt.toString()}>
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedService && squareFootage && (
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Calculated Price</p>
                <p className="text-3xl font-bold text-primary">${price}</p>
              </div>
            )}
          </div>

          {/* Schedule Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Schedule</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Assign Staff</Label>
                <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedService || !squareFootage}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
