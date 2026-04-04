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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, User, Mail, Phone, ShieldAlert, UserCheck, CreditCard, Link2, Check, Clock, Send, MapPin, Plus, Trash2, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@/contexts/OrganizationContext';
import { StripeCardForm } from '@/components/stripe/StripeCardForm';
import { format } from 'date-fns';

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  marketing_status?: string | null;
  customer_status?: string | null;
}

interface LocationRecord {
  id: string;
  name: string;
  address: string | null;
  apt_suite: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  is_primary: boolean | null;
}

const ADDRESS_LABELS = ['Home', 'Office', 'Airbnb', 'Rental', 'Other'];

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export function EditCustomerDialog({ open, onOpenChange, customer }: EditCustomerDialogProps) {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    marketing_status: 'active',
    customer_status: 'lead',
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);

  // --- Addresses state ---
  const [newAddress, setNewAddress] = useState({ name: 'Home', address: '', apt_suite: '', city: '', state: '', zip_code: '' });
  const [addingAddress, setAddingAddress] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);

  // Fetch saved addresses (locations) for this customer
  const { data: savedAddresses = [], refetch: refetchAddresses } = useQuery({
    queryKey: ['customer-locations', customer?.id],
    queryFn: async () => {
      if (!customer) return [];
      const { data, error } = await supabase
        .from('locations')
        .select('id, name, address, apt_suite, city, state, zip_code, is_primary')
        .eq('customer_id', customer.id)
        .order('is_primary', { ascending: false });
      if (error) return [];
      return (data || []) as LocationRecord[];
    },
    enabled: !!customer && open,
  });

  // Fetch booking link tracking for this customer
  const { data: linkTracking = [] } = useQuery({
    queryKey: ['customer-link-tracking', customer?.id, organization?.id],
    queryFn: async () => {
      if (!customer || !organization?.id) return [];
      const { data, error } = await supabase
        .from('booking_link_tracking' as any)
        .select('*')
        .eq('organization_id', organization.id)
        .or(`customer_email.eq.${customer.email},customer_phone.eq.${customer.phone}`)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) return [];
      return data || [];
    },
    enabled: !!customer && !!organization?.id && open,
  });

  useEffect(() => {
    if (customer) {
      setFormData({
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        zip_code: customer.zip_code || '',
        marketing_status: customer.marketing_status || 'active',
        customer_status: customer.customer_status || 'lead',
      });
      setShowCardForm(false);
      setShowAddForm(false);
      setNewAddress({ name: 'Home', address: '', apt_suite: '', city: '', state: '', zip_code: '' });
    }
  }, [customer]);

  const handleAddAddress = async () => {
    if (!customer || !organization?.id || !newAddress.address.trim()) {
      toast.error('Please enter a street address');
      return;
    }
    setAddingAddress(true);
    try {
      const isFirst = savedAddresses.length === 0;
      const { error } = await supabase
        .from('locations')
        .insert({
          customer_id: customer.id,
          organization_id: organization.id,
          name: newAddress.name,
          address: newAddress.address,
          apt_suite: newAddress.apt_suite || null,
          city: newAddress.city || null,
          state: newAddress.state || null,
          zip_code: newAddress.zip_code || null,
          is_primary: isFirst,
        });
      if (error) throw error;
      toast.success('Address added');
      setNewAddress({ name: 'Home', address: '', apt_suite: '', city: '', state: '', zip_code: '' });
      setShowAddForm(false);
      refetchAddresses();
      queryClient.invalidateQueries({ queryKey: ['customer-locations'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to add address');
    } finally {
      setAddingAddress(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    setDeletingAddressId(id);
    try {
      const { error } = await supabase.from('locations').delete().eq('id', id);
      if (error) throw error;
      toast.success('Address removed');
      refetchAddresses();
      queryClient.invalidateQueries({ queryKey: ['customer-locations'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete address');
    } finally {
      setDeletingAddressId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!customer) return;
    try {
      // Unset all
      await supabase.from('locations').update({ is_primary: false }).eq('customer_id', customer.id);
      // Set new default
      const { error } = await supabase.from('locations').update({ is_primary: true }).eq('id', id);
      if (error) throw error;
      toast.success('Default address updated');
      refetchAddresses();
    } catch (err: any) {
      toast.error(err.message || 'Failed to set default');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customer) return;
    
    if (!formData.first_name || !formData.last_name || !formData.email) {
      toast.error('Please fill in first name, last name, and email');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('customers')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone || null,
          address: formData.address || null,
          city: formData.city || null,
          state: formData.state || null,
          zip_code: formData.zip_code || null,
          marketing_status: formData.marketing_status,
          customer_status: formData.customer_status,
        })
        .eq('id', customer.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Customer updated successfully');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating customer:', error);
      toast.error(error.message || 'Failed to update customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Edit Customer
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                placeholder="Doe"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> Email *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Addresses Section */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <Label className="font-medium text-base">Addresses</Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Address
              </Button>
            </div>

            {/* Saved Addresses */}
            {savedAddresses.length === 0 && !showAddForm && (
              <p className="text-sm text-muted-foreground py-2">No saved addresses. Add one below.</p>
            )}
            {savedAddresses.map((loc) => (
              <div
                key={loc.id}
                className="p-3 bg-secondary/30 rounded-lg border border-border/50 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{loc.name}</Badge>
                    {loc.is_primary && (
                      <Badge className="bg-primary/10 text-primary text-xs border-0">
                        <Star className="w-3 h-3 mr-0.5" /> Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!loc.is_primary && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleSetDefault(loc.id)}
                      >
                        Set Default
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteAddress(loc.id)}
                      disabled={deletingAddressId === loc.id}
                    >
                      {deletingAddressId === loc.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-sm">
                  {[loc.address, loc.apt_suite].filter(Boolean).join(', ')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[loc.city, loc.state, loc.zip_code].filter(Boolean).join(', ')}
                </p>
              </div>
            ))}

            {/* Add Address Form */}
            {showAddForm && (
              <div className="p-4 border border-border rounded-lg space-y-3 bg-muted/30">
                <div className="space-y-2">
                  <Label className="text-sm">Label</Label>
                  <Select value={newAddress.name} onValueChange={(v) => setNewAddress(prev => ({ ...prev, name: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADDRESS_LABELS.map(l => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Street Address *</Label>
                  <Input
                    value={newAddress.address}
                    onChange={(e) => setNewAddress(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="123 Main St"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Apt / Suite</Label>
                  <Input
                    value={newAddress.apt_suite}
                    onChange={(e) => setNewAddress(prev => ({ ...prev, apt_suite: e.target.value }))}
                    placeholder="Apt 4B"
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">City</Label>
                    <Input
                      value={newAddress.city}
                      onChange={(e) => setNewAddress(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="City"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">State</Label>
                    <Input
                      value={newAddress.state}
                      onChange={(e) => setNewAddress(prev => ({ ...prev, state: e.target.value }))}
                      placeholder="State"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ZIP</Label>
                    <Input
                      value={newAddress.zip_code}
                      onChange={(e) => setNewAddress(prev => ({ ...prev, zip_code: e.target.value }))}
                      placeholder="12345"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
                  <Button type="button" size="sm" onClick={handleAddAddress} disabled={addingAddress}>
                    {addingAddress && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                    Save Address
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Legacy single address (hidden label, kept for backward compat) */}
          <input type="hidden" value={formData.address} />

          {/* Customer Status */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="customer_status" className="font-medium">Customer Status</Label>
              </div>
              <Badge 
                variant={formData.customer_status === 'active' ? 'default' : 'secondary'}
                className={
                  formData.customer_status === 'active' ? 'bg-green-500' : 
                  formData.customer_status === 'lead' ? 'bg-blue-500' : 'bg-gray-500'
                }
              >
                {formData.customer_status === 'lead' ? 'Lead' : 
                 formData.customer_status === 'active' ? 'Active Client' : 'Inactive'}
              </Badge>
            </div>
            <Select
              value={formData.customer_status}
              onValueChange={(value) => setFormData(prev => ({ ...prev, customer_status: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead (No booking yet)</SelectItem>
                <SelectItem value="active">Active Client (Has booked)</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Marketing/Campaign Eligibility */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="marketing_status" className="font-medium">Campaign Eligibility</Label>
              </div>
              <Badge 
                variant={formData.marketing_status === 'active' ? 'default' : 'destructive'}
                className={formData.marketing_status === 'active' ? 'bg-green-500' : ''}
              >
                {formData.marketing_status === 'active' ? 'Eligible' : 'Excluded'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {formData.marketing_status === 'active' 
                  ? 'Customer will receive campaign messages' 
                  : 'Customer excluded from all campaigns'}
              </p>
              <Switch
                id="marketing_status"
                checked={formData.marketing_status === 'active'}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, marketing_status: checked ? 'active' : 'opted_out' }))
                }
              />
            </div>
            {formData.marketing_status === 'opted_out' && (
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                ⚠️ This customer will not receive any automated SMS campaigns including win-back, seasonal promos, or promotional messages.
              </p>
            )}
          </div>

          {/* Add Card on File */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <Label className="font-medium">Card on File</Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCardForm(!showCardForm)}
              >
                {showCardForm ? 'Hide' : 'Add Card'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Securely save a card for future billing. The card will not be charged.
            </p>
            {showCardForm && organization?.id && formData.email && (
              <StripeCardForm
                email={formData.email}
                customerName={`${formData.first_name} ${formData.last_name}`}
                organizationId={organization.id}
                showHoldOption={false}
                onCardSaved={(cardInfo) => {
                  toast.success(`Card saved: ${cardInfo.brand} ending in ${cardInfo.last4}`);
                  setShowCardForm(false);
                }}
                onError={(error) => {
                  toast.error(error);
                }}
              />
            )}
            {showCardForm && !formData.email && (
              <p className="text-sm text-destructive">Please enter a customer email first to add a card.</p>
            )}
          </div>

          {/* Booking Activity Tracking */}
          {linkTracking.length > 0 && (
            <div className="space-y-3">
              <Separator />
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                <Label className="text-base font-semibold">Booking Activity</Label>
              </div>
              <div className="space-y-2">
                {linkTracking.map((track: any) => (
                  <div key={track.id} className="p-3 bg-muted/50 rounded-lg space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant={
                        track.booking_completed_at ? 'default' :
                        track.link_opened_at ? 'destructive' : 'secondary'
                      }>
                        {track.booking_completed_at ? 'Completed' :
                         track.link_opened_at ? 'Abandoned' : 'Sent'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(track.created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Send className="w-3 h-3" /> Sent
                        </span>
                        <span>{track.link_sent_at ? format(new Date(track.link_sent_at), 'h:mm a') : '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Opened
                        </span>
                        <span className={track.link_opened_at ? 'text-amber-600' : ''}>
                          {track.link_opened_at ? format(new Date(track.link_opened_at), 'h:mm a') : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Check className="w-3 h-3" /> Completed
                        </span>
                        <span className={track.booking_completed_at ? 'text-green-600' : ''}>
                          {track.booking_completed_at ? format(new Date(track.booking_completed_at), 'h:mm a') : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
