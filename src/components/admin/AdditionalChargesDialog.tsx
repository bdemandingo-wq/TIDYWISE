import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, DollarSign, CreditCard, Banknote } from 'lucide-react';

interface AdditionalCharge {
  id: string;
  charge_name: string;
  charge_amount: number;
  description: string | null;
  created_at: string;
}

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  isDefault?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  bookingNumber: number;
  organizationId: string;
  currentTotal: number;
  customerEmail?: string;
  onTotalUpdated?: () => void;
}

export function AdditionalChargesDialog({ 
  open, 
  onOpenChange, 
  bookingId, 
  bookingNumber,
  organizationId,
  currentTotal,
  customerEmail,
  onTotalUpdated 
}: Props) {
  const queryClient = useQueryClient();
  const [newCharge, setNewCharge] = useState({
    charge_name: '',
    charge_amount: '',
    description: ''
  });
  const [paymentMethod, setPaymentMethod] = useState<'existing_card' | 'cash'>('existing_card');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [excludeNotification, setExcludeNotification] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

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

  // Fetch saved cards when dialog opens
  useEffect(() => {
    const fetchCards = async () => {
      if (!open || !customerEmail || !organizationId) return;
      
      setLoadingCards(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke('get-customer-card', {
          body: { email: customerEmail, organizationId },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`
          }
        });
        
        if (error) throw error;
        
        if (data?.cards && data.cards.length > 0) {
          setSavedCards(data.cards);
          // Select default card or first card
          const defaultCard = data.cards.find((c: SavedCard) => c.isDefault) || data.cards[0];
          setSelectedCardId(defaultCard.id);
        } else {
          setSavedCards([]);
          setPaymentMethod('cash');
        }
      } catch (err) {
        console.error('Error fetching cards:', err);
        setSavedCards([]);
        setPaymentMethod('cash');
      } finally {
        setLoadingCards(false);
      }
    };

    fetchCards();
  }, [open, customerEmail, organizationId]);

  // Charge and add mutation
  const chargeAndAdd = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(newCharge.charge_amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid amount');
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: session } = await supabase.auth.getSession();

      // If paying with existing card, charge it
      if (paymentMethod === 'existing_card' && customerEmail) {
        const { data: chargeResult, error: chargeError } = await supabase.functions.invoke('charge-card-directly', {
          body: {
            email: customerEmail,
            amount: amount,
            description: `Additional charge: ${newCharge.charge_name.trim()}`,
            organizationId,
            bookingId
          },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`
          }
        });

        if (chargeError) throw new Error(chargeError.message);
        if (!chargeResult?.success) {
          throw new Error(chargeResult?.error || 'Payment failed');
        }
      }

      // Insert the charge record
      const { error: insertError } = await supabase
        .from('additional_charges')
        .insert({
          booking_id: bookingId,
          organization_id: organizationId,
          charge_name: newCharge.charge_name.trim(),
          charge_amount: amount,
          description: newCharge.description.trim() || null,
          created_by: user?.id
        });

      if (insertError) throw insertError;

      // Update booking total
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ 
          total_amount: currentTotal + amount 
        })
        .eq('id', bookingId);

      if (updateError) throw updateError;

      return { paymentMethod, amount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['additional-charges', bookingId] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      
      if (result.paymentMethod === 'existing_card') {
        toast.success(`Charged $${result.amount.toFixed(2)} to card successfully`);
      } else {
        toast.success('Additional charge added (cash/check)');
      }
      
      setNewCharge({ charge_name: '', charge_amount: '', description: '' });
      onTotalUpdated?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process charge');
    }
  });

  // Delete charge mutation
  const deleteCharge = useMutation({
    mutationFn: async (charge: AdditionalCharge) => {
      const { error: deleteError } = await supabase
        .from('additional_charges')
        .delete()
        .eq('id', charge.id);

      if (deleteError) throw deleteError;

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
      toast.error('Please enter a reason for the charge');
      return;
    }
    if (!newCharge.charge_amount || parseFloat(newCharge.charge_amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    chargeAndAdd.mutate();
  };

  const formatCardDisplay = (card: SavedCard) => {
    return `XXXX XXXX XXXX ${card.last4}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Additional charge</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing charges summary */}
          {charges.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">Previous Charges</span>
                <Badge variant="outline" className="font-semibold">
                  +${chargesTotal.toFixed(2)}
                </Badge>
              </div>
              {charges.map((charge) => (
                <div 
                  key={charge.id} 
                  className="flex items-center justify-between p-2 bg-card border rounded-lg text-sm"
                >
                  <span>{charge.charge_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">+${Number(charge.charge_amount).toFixed(2)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => deleteCharge.mutate(charge)}
                      disabled={deleteCharge.isPending}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new charge form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center w-10 bg-muted border-r rounded-l-md">
                  <span className="text-muted-foreground font-medium">$</span>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter amount"
                  className="pl-12"
                  value={newCharge.charge_amount}
                  onChange={(e) => setNewCharge({ ...newCharge, charge_amount: e.target.value })}
                  disabled={chargeAndAdd.isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason for extra charge</Label>
              <Textarea
                placeholder="Extra charge reason"
                value={newCharge.charge_name}
                onChange={(e) => setNewCharge({ ...newCharge, charge_name: e.target.value })}
                disabled={chargeAndAdd.isPending}
                rows={3}
              />
            </div>

            {/* Payment method selection */}
            <RadioGroup 
              value={paymentMethod} 
              onValueChange={(val) => setPaymentMethod(val as 'existing_card' | 'cash')}
              className="flex flex-wrap gap-4"
              disabled={chargeAndAdd.isPending || loadingCards}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="existing_card" id="existing_card" disabled={savedCards.length === 0} />
                <Label htmlFor="existing_card" className="flex items-center gap-1.5 cursor-pointer">
                  <CreditCard className="h-4 w-4" />
                  Existing credit card
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cash" id="cash" />
                <Label htmlFor="cash" className="flex items-center gap-1.5 cursor-pointer">
                  <Banknote className="h-4 w-4" />
                  Cash/check
                </Label>
              </div>
            </RadioGroup>

            {/* Card selection */}
            {paymentMethod === 'existing_card' && (
              <div className="space-y-2">
                <Label>Your saved card</Label>
                {loadingCards ? (
                  <div className="flex items-center gap-2 p-3 border rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading cards...</span>
                  </div>
                ) : savedCards.length > 0 ? (
                  <Select value={selectedCardId} onValueChange={setSelectedCardId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a card" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedCards.map((card) => (
                        <SelectItem key={card.id} value={card.id}>
                          {formatCardDisplay(card)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/50">
                    No saved cards found for this customer
                  </p>
                )}
              </div>
            )}

            {/* Notification exclusion */}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="exclude_notification" 
                checked={excludeNotification}
                onCheckedChange={(checked) => setExcludeNotification(checked === true)}
              />
              <Label htmlFor="exclude_notification" className="text-sm cursor-pointer">
                Exclude notification from being sent
              </Label>
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={
                chargeAndAdd.isPending || 
                !newCharge.charge_name.trim() || 
                !newCharge.charge_amount ||
                (paymentMethod === 'existing_card' && savedCards.length === 0)
              }
            >
              {chargeAndAdd.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Charge now
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
