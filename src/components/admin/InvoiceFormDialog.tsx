import { useState, useEffect } from 'react';
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
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';

interface LineItem {
  id?: string;
  service_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any | null;
  customers: any[];
  leads: any[];
  services: any[];
  defaultTaxPercent: number;
  organizationId: string;
}

export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
  customers,
  leads,
  services,
  defaultTaxPercent,
  organizationId,
}: InvoiceFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = invoice?.id && invoice.id.length > 10;

  const [formData, setFormData] = useState({
    customer_id: '',
    lead_id: '',
    customer_type: 'customer' as 'customer' | 'lead',
    address: '',
    tax_percent: defaultTaxPercent.toString(),
    discount_percent: '0',
    notes: '',
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { service_id: '', description: '', quantity: 1, unit_price: 0, total: 0 }
  ]);

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      if (invoice) {
        setFormData({
          customer_id: invoice.customer_id || '',
          lead_id: invoice.lead_id || '',
          customer_type: invoice.lead_id ? 'lead' : 'customer',
          address: invoice.address || '',
          tax_percent: (invoice.tax_percent || defaultTaxPercent).toString(),
          discount_percent: (invoice.discount_percent || 0).toString(),
          notes: invoice.notes || '',
          due_date: invoice.due_date || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        });
        if (invoice.invoice_items?.length > 0) {
          setLineItems(invoice.invoice_items.map((item: any) => ({
            id: item.id,
            service_id: item.service_id || '',
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
          })));
        } else {
          setLineItems([{ service_id: '', description: '', quantity: 1, unit_price: 0, total: 0 }]);
        }
      } else {
        setFormData({
          customer_id: '',
          lead_id: '',
          customer_type: 'customer',
          address: '',
          tax_percent: defaultTaxPercent.toString(),
          discount_percent: '0',
          notes: '',
          due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        });
        setLineItems([{ service_id: '', description: '', quantity: 1, unit_price: 0, total: 0 }]);
      }
    }
  }, [open, invoice, defaultTaxPercent]);

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const discountPercent = parseFloat(formData.discount_percent) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const subtotalAfterDiscount = subtotal - discountAmount;
  const taxPercent = parseFloat(formData.tax_percent) || 0;
  const taxAmount = subtotalAfterDiscount * (taxPercent / 100);
  const totalAmount = subtotalAfterDiscount + taxAmount;

  const addLineItem = () => {
    setLineItems([...lineItems, { service_id: '', description: '', quantity: 1, unit_price: 0, total: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Recalculate total
    if (field === 'quantity' || field === 'unit_price') {
      updated[index].total = updated[index].quantity * updated[index].unit_price;
    }
    
    // If service selected, auto-fill description and price
    if (field === 'service_id' && value) {
      const service = services.find(s => s.id === value);
      if (service) {
        updated[index].description = service.name;
        updated[index].unit_price = service.price || 0;
        updated[index].total = updated[index].quantity * updated[index].unit_price;
      }
    }
    
    setLineItems(updated);
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (lineItems.every(item => !item.description)) {
        throw new Error('Please add at least one line item');
      }

      const validLineItems = lineItems.filter(item => item.description);

      const invoiceData = {
        organization_id: organizationId,
        customer_id: formData.customer_type === 'customer' && formData.customer_id ? formData.customer_id : null,
        lead_id: formData.customer_type === 'lead' && formData.lead_id ? formData.lead_id : null,
        address: formData.address || null,
        subtotal,
        tax_percent: taxPercent,
        tax_amount: taxAmount,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        notes: formData.notes || null,
        due_date: formData.due_date || null,
      };

      let invoiceId: string;

      if (isEditing) {
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', invoice.id);
        if (error) throw error;
        invoiceId = invoice.id;

        // Delete existing items and re-insert
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
      } else {
        const { data, error } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select('id')
          .single();
        if (error) throw error;
        invoiceId = data.id;
      }

      // Insert line items
      const itemsToInsert = validLineItems.map((item, index) => ({
        invoice_id: invoiceId,
        service_id: item.service_id || null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        sort_order: index,
      }));

      const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(isEditing ? 'Invoice updated' : 'Invoice created');
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Invoice' : 'Create New Invoice'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Customer Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Customer Type</Label>
              <Select 
                value={formData.customer_type} 
                onValueChange={(v: 'customer' | 'lead') => setFormData({ ...formData, customer_type: v, customer_id: '', lead_id: '' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Existing Customer</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{formData.customer_type === 'customer' ? 'Select Customer' : 'Select Lead'}</Label>
              {formData.customer_type === 'customer' ? (
                <Select 
                  value={formData.customer_id} 
                  onValueChange={(v) => {
                    const customer = customers.find(c => c.id === v);
                    setFormData({ 
                      ...formData, 
                      customer_id: v,
                      address: customer?.address || formData.address,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name} - {c.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select 
                  value={formData.lead_id} 
                  onValueChange={(v) => {
                    const lead = leads.find(l => l.id === v);
                    setFormData({ 
                      ...formData, 
                      lead_id: v,
                      address: lead?.address || formData.address,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} - {l.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Address */}
          <div>
            <Label>Service Address</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 Main St, City, State ZIP"
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="w-4 h-4 mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-3">
              {lineItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-start p-3 border rounded-lg bg-muted/30">
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                      <Label className="text-xs">Service</Label>
                      <Select 
                        value={item.service_id} 
                        onValueChange={(v) => updateLineItem(index, 'service_id', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Custom Item</SelectItem>
                          {services.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} - ${s.price}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="h-9"
                        value={item.description}
                        onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                        placeholder="Service description"
                      />
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        className="h-9"
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Unit Price</Label>
                      <Input
                        className="h-9"
                        type="number"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs">Total</Label>
                      <div className="h-9 flex items-center font-medium">
                        ${item.total.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 mt-5 text-destructive"
                    onClick={() => removeLineItem(index)}
                    disabled={lineItems.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Calculations */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Tax %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.tax_percent}
                    onChange={(e) => setFormData({ ...formData, tax_percent: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Discount %</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.discount_percent}
                    onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes for the customer..."
                  rows={3}
                />
              </div>
            </div>
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount ({discountPercent}%):</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Tax ({taxPercent}%):</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2">
                <span>Total:</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => saveMutation.mutate()} 
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? 'Update Invoice' : 'Create Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
