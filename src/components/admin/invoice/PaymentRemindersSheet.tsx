import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Bell, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface PaymentRemindersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

interface Reminder {
  id?: string;
  days_after_due: number;
  send_sms: boolean;
  is_active: boolean;
}

export function PaymentRemindersSheet({ open, onOpenChange, organizationId }: PaymentRemindersSheetProps) {
  const queryClient = useQueryClient();
  
  const { data: existingReminders = [], isLoading } = useQuery({
    queryKey: ['payment-reminders', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_payment_reminders')
        .select('*')
        .eq('organization_id', organizationId)
        .order('days_after_due');
      if (error) throw error;
      return data as Reminder[];
    },
    enabled: !!organizationId && open,
  });

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize reminders when data loads
  if (existingReminders.length > 0 && !initialized) {
    setReminders(existingReminders);
    setInitialized(true);
  } else if (existingReminders.length === 0 && !initialized && !isLoading) {
    // Set default reminders if none exist
    setReminders([
      { days_after_due: 2, send_sms: true, is_active: true },
      { days_after_due: 7, send_sms: true, is_active: true },
    ]);
    setInitialized(true);
  }

  // Reset initialized when sheet closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setInitialized(false);
    }
    onOpenChange(isOpen);
  };

  const addReminder = () => {
    const maxDays = Math.max(...reminders.map(r => r.days_after_due), 0);
    setReminders([
      ...reminders,
      { days_after_due: maxDays + 3, send_sms: true, is_active: true }
    ]);
  };

  const removeReminder = (index: number) => {
    setReminders(reminders.filter((_, i) => i !== index));
  };

  const updateReminder = (index: number, field: keyof Reminder, value: any) => {
    const updated = [...reminders];
    updated[index] = { ...updated[index], [field]: value };
    setReminders(updated);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Delete all existing reminders for this org
      await supabase
        .from('invoice_payment_reminders')
        .delete()
        .eq('organization_id', organizationId);

      // Insert new reminders
      if (reminders.length > 0) {
        const toInsert = reminders.map(r => ({
          organization_id: organizationId,
          days_after_due: r.days_after_due,
          send_email: false, // Always false - SMS-only platform
          send_sms: r.send_sms,
          is_active: r.is_active,
        }));

        const { error } = await supabase
          .from('invoice_payment_reminders')
          .insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-reminders'] });
      toast.success('Payment reminders saved');
      handleOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Payment Reminders
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="py-4 space-y-4 overflow-y-auto max-h-[calc(70vh-160px)]">
            <p className="text-sm text-muted-foreground">
              Set up automatic SMS reminders to send to customers when invoices remain unpaid.
            </p>

            {reminders.map((reminder, index) => (
              <div key={index} className="p-4 border rounded-lg bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      value={reminder.days_after_due}
                      onChange={(e) => updateReminder(index, 'days_after_due', parseInt(e.target.value) || 1)}
                      className="w-16 h-8"
                    />
                    <span className="text-sm text-muted-foreground">days after due date</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeReminder(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={reminder.send_sms}
                      onCheckedChange={(v) => updateReminder(index, 'send_sms', v)}
                    />
                    SMS Notification
                  </label>
                  <label className="flex items-center gap-2 text-sm ml-auto">
                    <Switch
                      checked={reminder.is_active}
                      onCheckedChange={(v) => updateReminder(index, 'is_active', v)}
                    />
                    Active
                  </label>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={addReminder}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Reminder
            </Button>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t">
          <Button 
            className="w-full" 
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Reminders
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
