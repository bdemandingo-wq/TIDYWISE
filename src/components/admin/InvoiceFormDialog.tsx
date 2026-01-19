import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Loader2, ChevronUp, ChevronLeft, Tag, CreditCard, Mail } from 'lucide-react';
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

  // Section open states
  const [customerOpen, setCustomerOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [itemsOpen, setItemsOpen] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);

  const [formData, setFormData] = useState({
    customer_id: '',
    lead_id: '',
    customer_type: 'customer' as 'customer' | 'lead',
    address: '',
    tax_percent: defaultTaxPercent.toString(),
    discount_percent: '0',
    notes: '',
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    send_immediately: true,
    due_upon_receipt: true,
    is_recurring: false,
    email_copy: true,
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showTax, setShowTax] = useState(false);

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
          send_immediately: true,
          due_upon_receipt: !invoice.due_date,
          is_recurring: false,
          email_copy: true,
        });
        if (invoice.invoice_items?.length > 0) {
          setLineItems(invoice.invoice_items.map((item: any) => ({
            id: item.id,
            service_id: item.service_id || '__custom__',
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
          })));
        } else {
          setLineItems([]);
        }
        setShowDiscount((invoice.discount_percent || 0) > 0);
        setShowTax((invoice.tax_percent || 0) > 0);
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
          send_immediately: true,
          due_upon_receipt: true,
          is_recurring: false,
          email_copy: true,
        });
        setLineItems([]);
        setShowDiscount(false);
        setShowTax(defaultTaxPercent > 0);
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
    setLineItems([...lineItems, { service_id: '__custom__', description: '', quantity: 1, unit_price: 0, total: 0 }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price') {
      updated[index].total = updated[index].quantity * updated[index].unit_price;
    }
    
    if (field === 'service_id' && value && value !== '__custom__') {
      const service = services.find(s => s.id === value);
      if (service) {
        updated[index].description = service.name;
        updated[index].unit_price = service.price || 0;
        updated[index].total = updated[index].quantity * updated[index].unit_price;
      }
    }
    
    setLineItems(updated);
  };

  // Get selected customer/lead info
  const selectedCustomer = formData.customer_type === 'customer' 
    ? customers.find(c => c.id === formData.customer_id)
    : leads.find(l => l.id === formData.lead_id);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const validLineItems = lineItems.filter(item => item.description);

      const invoiceData = {
        organization_id: organizationId,
        customer_id: formData.customer_type === 'customer' && formData.customer_id ? formData.customer_id : null,
        lead_id: formData.customer_type === 'lead' && formData.lead_id ? formData.lead_id : null,
        address: formData.address || null,
        subtotal,
        tax_percent: showTax ? taxPercent : 0,
        tax_amount: showTax ? taxAmount : 0,
        discount_percent: showDiscount ? discountPercent : 0,
        discount_amount: showDiscount ? discountAmount : 0,
        total_amount: totalAmount,
        notes: formData.notes || null,
        due_date: formData.due_upon_receipt ? null : formData.due_date,
      };

      let invoiceId: string;

      if (isEditing) {
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', invoice.id);
        if (error) throw error;
        invoiceId = invoice.id;
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

      if (validLineItems.length > 0) {
        const itemsToInsert = validLineItems.map((item, index) => ({
          invoice_id: invoiceId,
          service_id: item.service_id && item.service_id !== '__custom__' ? item.service_id : null,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(isEditing ? 'Invoice updated' : 'Invoice created');
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const SectionHeader = ({ 
    title, 
    isOpen, 
    onToggle 
  }: { 
    title: string; 
    isOpen: boolean; 
    onToggle: () => void;
  }) => (
    <CollapsibleTrigger 
      onClick={onToggle}
      className="flex items-center justify-between w-full py-4 px-4 bg-muted/50 hover:bg-muted transition-colors"
    >
      <span className="font-semibold text-foreground">{title}</span>
      <ChevronUp className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? '' : 'rotate-180'}`} />
    </CollapsibleTrigger>
  );

  const InfoRow = ({ 
    label, 
    value, 
    action,
    actionLabel 
  }: { 
    label: string; 
    value?: string; 
    action?: () => void;
    actionLabel?: string;
  }) => (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      {action ? (
        <button onClick={action} className="text-primary font-medium hover:underline">
          {actionLabel}
        </button>
      ) : (
        <span className="text-foreground">{value}</span>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[100vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <button 
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h2 className="text-lg font-semibold">{isEditing ? 'Edit Invoice' : 'New Invoice'}</h2>
          <div className="w-6" />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-32">
          {/* Customer Details Section */}
          <Collapsible open={customerOpen} onOpenChange={setCustomerOpen}>
            <SectionHeader title="Customer Details" isOpen={customerOpen} onToggle={() => setCustomerOpen(!customerOpen)} />
            <CollapsibleContent>
              <div className="px-4 py-3 space-y-4">
                {/* Customer Type Toggle */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={formData.customer_type === 'customer' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, customer_type: 'customer', customer_id: '', lead_id: '' })}
                  >
                    Customer
                  </Button>
                  <Button
                    type="button"
                    variant={formData.customer_type === 'lead' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData({ ...formData, customer_type: 'lead', customer_id: '', lead_id: '' })}
                  >
                    Lead
                  </Button>
                </div>

                {/* Customer/Lead Selection */}
                {formData.customer_type === 'customer' ? (
                  <Select 
                    value={formData.customer_id || '__none__'} 
                    onValueChange={(v) => {
                      if (v === '__none__') {
                        setFormData({ ...formData, customer_id: '', address: '' });
                        return;
                      }
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
                      <SelectItem value="__none__">Select customer...</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.first_name} {c.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select 
                    value={formData.lead_id || '__none__'} 
                    onValueChange={(v) => {
                      if (v === '__none__') {
                        setFormData({ ...formData, lead_id: '', address: '' });
                        return;
                      }
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
                      <SelectItem value="__none__">Select lead...</SelectItem>
                      {leads.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Selected Customer Info */}
                {selectedCustomer && (
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-foreground">
                      {formData.customer_type === 'customer' 
                        ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
                        : selectedCustomer.name}
                    </p>
                    {selectedCustomer.email && (
                      <p className="text-muted-foreground">{selectedCustomer.email}</p>
                    )}
                    {selectedCustomer.phone && (
                      <p className="text-muted-foreground">{selectedCustomer.phone}</p>
                    )}
                    {(selectedCustomer.address || formData.address) && (
                      <>
                        <p className="text-muted-foreground">{selectedCustomer.address || formData.address}</p>
                        {selectedCustomer.city && selectedCustomer.state && (
                          <p className="text-muted-foreground">
                            {selectedCustomer.city}, {selectedCustomer.state} {selectedCustomer.zip_code}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="border-t">
                <InfoRow 
                  label="Additional recipients" 
                  action={() => {}} 
                  actionLabel="Add recipients" 
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Invoice Details Section */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <SectionHeader title="Invoice Details" isOpen={detailsOpen} onToggle={() => setDetailsOpen(!detailsOpen)} />
            <CollapsibleContent>
              <InfoRow 
                label="Invoice Number" 
                value={invoice?.invoice_number ? `#${String(invoice.invoice_number).padStart(4, '0')}` : 'Auto-generated'} 
              />
              <div className="flex items-center justify-between py-3 px-4 border-b">
                <span className="text-muted-foreground">Make this a recurring invoice</span>
                <Switch 
                  checked={formData.is_recurring}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
                />
              </div>
              <InfoRow 
                label="Send" 
                value={formData.send_immediately ? 'Immediately' : 'Scheduled'} 
              />
              <InfoRow 
                label="Due" 
                value={formData.due_upon_receipt ? 'Upon receipt' : format(new Date(formData.due_date), 'MMM d, yyyy')} 
              />
              <div className="px-4 py-3 border-b">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Note</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add a quick note for your client (optional)"
                  className="resize-none border-border"
                  rows={2}
                />
                <div className="text-right text-xs text-muted-foreground mt-1">
                  {formData.notes.length}/250
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Billable Items Section */}
          <Collapsible open={itemsOpen} onOpenChange={setItemsOpen}>
            <SectionHeader title="Billable Items" isOpen={itemsOpen} onToggle={() => setItemsOpen(!itemsOpen)} />
            <CollapsibleContent>
              <div className="px-4 py-3 space-y-3">
                {/* Line Items */}
                {lineItems.map((item, index) => (
                  <div key={index} className="p-3 border rounded-lg bg-card space-y-3">
                    <div className="flex items-start justify-between">
                      <Select 
                        value={item.service_id} 
                        onValueChange={(v) => updateLineItem(index, 'service_id', v)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select service..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__custom__">Custom Item</SelectItem>
                          {services.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} - ${s.price}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeLineItem(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      placeholder="Description"
                      className="w-full"
                    />
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Qty</label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Price</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Total</label>
                        <div className="h-10 flex items-center font-medium">
                          ${item.total.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add Item Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-auto border-primary text-primary hover:bg-primary/5"
                  onClick={addLineItem}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add item
                </Button>

                {/* Add Discount */}
                {!showDiscount ? (
                  <button
                    type="button"
                    className="flex items-center gap-2 text-primary font-medium hover:underline"
                    onClick={() => setShowDiscount(true)}
                  >
                    <Tag className="w-4 h-4" />
                    Add a discount
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Discount %</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.discount_percent}
                      onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
                      className="w-20 h-8"
                    />
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setShowDiscount(false);
                        setFormData({ ...formData, discount_percent: '0' });
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Add Tax */}
                {!showTax ? (
                  <button
                    type="button"
                    className="flex items-center gap-2 text-primary font-medium hover:underline"
                    onClick={() => setShowTax(true)}
                  >
                    <span className="text-lg font-bold">$</span>
                    Add tax
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-muted-foreground">$</span>
                    <span className="text-sm">Tax %</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.tax_percent}
                      onChange={(e) => setFormData({ ...formData, tax_percent: e.target.value })}
                      className="w-20 h-8"
                    />
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setShowTax(false);
                        setFormData({ ...formData, tax_percent: '0' });
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Payment Options Section */}
          <Collapsible open={paymentOpen} onOpenChange={setPaymentOpen}>
            <SectionHeader title="Payment Options" isOpen={paymentOpen} onToggle={() => setPaymentOpen(!paymentOpen)} />
            <CollapsibleContent>
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Accepted Methods</span>
                  <button className="text-primary font-medium hover:underline text-sm">Edit</button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                    <span>Debit/Credit Cards</span>
                    <span className="text-muted-foreground">2.9% + $0.30 fee</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 text-center text-muted-foreground text-xs">ACH</span>
                    <span>Bank Transfer (ACH)</span>
                    <span className="text-muted-foreground">Free</span>
                  </div>
                </div>
              </div>
              <div className="border-t px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Payment Reminders</span>
                  <button className="text-primary font-medium hover:underline text-sm">Edit</button>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  <p>2 days after due date</p>
                  <p>3 days after due date</p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Additional Options Section */}
          <Collapsible open={additionalOpen} onOpenChange={setAdditionalOpen}>
            <SectionHeader title="Additional Options" isOpen={additionalOpen} onToggle={() => setAdditionalOpen(!additionalOpen)} />
            <CollapsibleContent>
              <div className="flex items-center justify-between py-3 px-4 border-b">
                <div>
                  <p className="font-medium">Email me a copy of this invoice</p>
                </div>
                <Switch 
                  checked={formData.email_copy}
                  onCheckedChange={(checked) => setFormData({ ...formData, email_copy: checked })}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Sticky Footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-background border-t p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">Total due</span>
            <span className="text-lg font-semibold">${totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-primary text-primary hover:bg-primary/5"
              onClick={() => {
                // Preview functionality would go here
                toast.info('Preview coming soon');
              }}
            >
              Preview
            </Button>
            <Button
              className="flex-1"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
