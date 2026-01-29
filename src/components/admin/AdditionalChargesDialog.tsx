import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, DollarSign } from 'lucide-react';

interface AdditionalCharge {
  id: string;
  charge_name: string;
  charge_amount: number;
  description: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  bookingNumber: number;
  organizationId: string;
  currentTotal: number;
  onTotalUpdated?: () => void;
}

export function AdditionalChargesDialog({ 
  open, 
  onOpenChange, 
  bookingId, 
  bookingNumber,
  organizationId,
  currentTotal,
  onTotalUpdated 
}: Props) {
  const queryClient = useQueryClient();
  const [newCharge, setNewCharge] = useState({
    charge_name: '',
    charge_amount: '',
    description: ''
  });

  // Fetch existing charges
  const { data: charges = [], isLoading } = useQuery({
    queryKey: ['additional-charges', bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('additional_charges')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as AdditionalCharge[];
    },
    enabled: open && !!bookingId
  });

  // Add charge mutation
  const addCharge = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(newCharge.charge_amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid amount');
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Insert the charge
      const { error: chargeError } = await supabase
        .from('additional_charges')
        .insert({
          booking_id: bookingId,
          organization_id: organizationId,
          charge_name: newCharge.charge_name.trim(),
          charge_amount: amount,
          description: newCharge.description.trim() || null,
          created_by: user?.id
        });

      if (chargeError) throw chargeError;

      // Update booking total
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ 
          total_amount: currentTotal + amount 
        })
        .eq('id', bookingId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional-charges', bookingId] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Additional charge added');
      setNewCharge({ charge_name: '', charge_amount: '', description: '' });
      onTotalUpdated?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add charge');
    }
  });

  // Delete charge mutation
  const deleteCharge = useMutation({
    mutationFn: async (charge: AdditionalCharge) => {
      // Delete the charge
      const { error: deleteError } = await supabase
        .from('additional_charges')
        .delete()
        .eq('id', charge.id);

      if (deleteError) throw deleteError;

      // Update booking total
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ 
          total_amount: currentTotal - charge.charge_amount 
        })
        .eq('id', bookingId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional-charges', bookingId] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Charge removed');
      onTotalUpdated?.();
    },
    onError: () => {
      toast.error('Failed to remove charge');
    }
  });

  const chargesTotal = charges.reduce((sum, c) => sum + Number(c.charge_amount), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharge.charge_name.trim()) {
      toast.error('Please enter a charge name');
      return;
    }
    addCharge.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Additional Charges - #{bookingNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Charges Total</span>
            <Badge variant="outline" className="text-lg font-semibold">
              +${chargesTotal.toFixed(2)}
            </Badge>
          </div>

          {/* Existing charges */}
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : charges.length > 0 ? (
            <div className="space-y-2">
              <Label>Current Charges</Label>
              {charges.map((charge) => (
                <div 
                  key={charge.id} 
                  className="flex items-center justify-between p-3 bg-card border rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">{charge.charge_name}</p>
                    {charge.description && (
                      <p className="text-xs text-muted-foreground">{charge.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-primary">
                      +${Number(charge.charge_amount).toFixed(2)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteCharge.mutate(charge)}
                      disabled={deleteCharge.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Add new charge form */}
          <form onSubmit={handleSubmit} className="space-y-3 border-t pt-4">
            <Label>Add New Charge</Label>
            <Input
              placeholder="Charge name (e.g., Extra Room, Deep Clean Add-on)"
              value={newCharge.charge_name}
              onChange={(e) => setNewCharge({ ...newCharge, charge_name: e.target.value })}
              disabled={addCharge.isPending}
            />
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-9"
                value={newCharge.charge_amount}
                onChange={(e) => setNewCharge({ ...newCharge, charge_amount: e.target.value })}
                disabled={addCharge.isPending}
              />
            </div>
            <Textarea
              placeholder="Optional description"
              value={newCharge.description}
              onChange={(e) => setNewCharge({ ...newCharge, description: e.target.value })}
              disabled={addCharge.isPending}
              rows={2}
            />
            <Button 
              type="submit" 
              className="w-full gap-2"
              disabled={addCharge.isPending || !newCharge.charge_name.trim() || !newCharge.charge_amount}
            >
              {addCharge.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add Charge
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
