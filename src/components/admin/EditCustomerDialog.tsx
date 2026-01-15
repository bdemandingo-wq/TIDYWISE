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
import { toast } from 'sonner';
import { Loader2, User, Mail, Phone, MapPin, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

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
}

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export function EditCustomerDialog({ open, onOpenChange, customer }: EditCustomerDialogProps) {
  const queryClient = useQueryClient();
  
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
  });
  
  const [submitting, setSubmitting] = useState(false);

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
      });
    }
  }, [customer]);


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
      <DialogContent className="max-w-lg">
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

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address" className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Address
            </Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                placeholder="State"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip_code">ZIP Code</Label>
              <Input
                id="zip_code"
                value={formData.zip_code}
                onChange={(e) => setFormData(prev => ({ ...prev, zip_code: e.target.value }))}
                placeholder="12345"
              />
            </div>
          </div>

          {/* Marketing Status */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="marketing_status" className="font-medium">Marketing Status</Label>
              </div>
              <Badge 
                variant={formData.marketing_status === 'active' ? 'default' : 'destructive'}
                className={formData.marketing_status === 'active' ? 'bg-green-500' : ''}
              >
                {formData.marketing_status === 'active' ? 'Active' : 'Opted-Out'}
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

          {/* Actions */}
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
