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
import { 
  Plus, Trash2, Loader2, ChevronUp, ChevronLeft, ChevronRight, 
  Tag, CreditCard, Mail, Eye, Building, Bell, Calendar
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { PaymentMethodsSheet } from './invoice/PaymentMethodsSheet';
import { PaymentRemindersSheet } from './invoice/PaymentRemindersSheet';
import { DueDateSheet } from './invoice/DueDateSheet';
import { SendScheduleSheet } from './invoice/SendScheduleSheet';

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

  // Sheet states
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [sendScheduleOpen, setSendScheduleOpen] = useState(false);

  const [formData, setFormData] = useState({
    customer_id: '',
    lead_id: '',
    customer_type: 'customer' as 'customer' | 'lead',
    address: '',
    tax_percent: defaultTaxPercent.toString(),
    discount_percent: '0',
    notes: '',
    due_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    due_label: 'In 30 days',
    send_immediately: true,
    scheduled_send_at: null as string | null,
    scheduled_time: '09:00',
    is_recurring: false,
    recurring_interval: 'monthly',
    email_copy: true,
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showTax, setShowTax] = useState(false);

  // Fetch payment settings for display
  const { data: paymentSettings } = useQuery({
    queryKey: ['invoice-settings', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_invoice_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && open,
  });

  // Fetch payment reminders for display
  const { data: reminders = [] } = useQuery({
    queryKey: ['payment-reminders', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_payment_reminders')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('days_after_due');
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && open,
  });

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
          due_label: invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : 'Upon receipt',
          send_immediately: !invoice.scheduled_send_at,
          scheduled_send_at: invoice.scheduled_send_at || null,
          scheduled_time: '09:00',
          is_recurring: invoice.is_recurring || false,
          recurring_interval: invoice.recurring_interval || 'monthly',
          email_copy: invoice.send_copy_to_self ?? true,
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
          due_label: 'In 30 days',
          send_immediately: true,
          scheduled_send_at: null,
          scheduled_time: '09:00',
          is_recurring: false,
          recurring_interval: 'monthly',
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

  // Save and optionally send invoice
  const saveMutation = useMutation({
    mutationFn: async (shouldSend: boolean = false) => {
      const validLineItems = lineItems.filter(item => item.description);

      if (validLineItems.length === 0) {
        throw new Error('Please add at least one item to the invoice');
      }

      if (!selectedCustomer) {
        throw new Error('Please select a customer or lead');
      }

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
        due_date: formData.due_label === 'Upon receipt' ? null : formData.due_date,
        is_recurring: formData.is_recurring,
        recurring_interval: formData.is_recurring ? formData.recurring_interval : null,
        scheduled_send_at: formData.send_immediately ? null : formData.scheduled_send_at,
        send_copy_to_self: formData.email_copy,
      };

      let invoiceId: string;
      let invoiceNumber: number;

      if (isEditing) {
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', invoice.id);
        if (error) throw error;
        invoiceId = invoice.id;
        invoiceNumber = invoice.invoice_number;
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
      } else {
        const { data, error } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select('id, invoice_number')
          .single();
        if (error) throw error;
        invoiceId = data.id;
        invoiceNumber = data.invoice_number;
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

      // If we should send the invoice, call the edge function
      if (shouldSend) {
        const customerEmail = selectedCustomer.email;
        const customerName = formData.customer_type === 'customer' 
          ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
          : selectedCustomer.name;
        const customerPhone = selectedCustomer.phone;

        if (!customerEmail && !customerPhone) {
          throw new Error('Customer has no email or phone - cannot send invoice');
        }

        const { error: sendError } = await supabase.functions.invoke('create-stripe-invoice', {
          body: {
            invoiceId,
            organizationId,
            customerEmail,
            customerName,
            customerPhone,
            items: validLineItems.map(item => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unit_price,
            })),
            totalAmount,
            taxAmount: showTax ? taxAmount : 0,
            dueDate: formData.due_label === 'Upon receipt' ? null : formData.due_date,
            notes: formData.notes || null,
          },
        });

        if (sendError) throw sendError;
        
        return { sent: true, invoiceNumber };
      }

      return { sent: false, invoiceNumber };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (result?.sent) {
        toast.success(`Invoice #${result.invoiceNumber} sent successfully`);
      } else {
        toast.success(isEditing ? 'Invoice updated' : 'Invoice saved as draft');
      }
      onOpenChange(false);
    },
    onError: (error: any) => toast.error(error.message || 'Failed to save invoice'),
  });

  const handlePreview = () => {
    // TODO: Implement invoice preview
    toast.info('Invoice preview coming soon');
  };

  const handleSend = () => {
    saveMutation.mutate(true);
  };

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
    actionLabel,
    onClick 
  }: { 
    label: string; 
    value?: string; 
    action?: () => void;
    actionLabel?: string;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick || action}
      disabled={!onClick && !action}
      className="flex items-center justify-between py-3 px-4 border-b border-border last:border-b-0 w-full text-left hover:bg-muted/30 transition-colors disabled:hover:bg-transparent"
    >
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {action ? (
          <span className="text-primary font-medium">{actionLabel}</span>
        ) : (
          <span className="text-foreground">{value}</span>
        )}
        {onClick && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </div>
    </button>
  );

  // Get enabled payment methods for display
  const enabledMethods = [];
  if (paymentSettings?.accept_cards !== false) {
    enabledMethods.push({ 
      name: 'Debit/Credit Cards', 
      fee: `${paymentSettings?.card_fee_percent ?? 2.9}% + $${(paymentSettings?.card_fee_fixed ?? 0.30).toFixed(2)}`,
      icon: CreditCard
    });
  }
  if (paymentSettings?.accept_ach !== false) {
    enabledMethods.push({ name: 'Bank Transfer (ACH)', fee: 'Free', icon: Building });
  }

  return (
    <>
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
          <div className="flex-1 overflow-y-auto pb-36">
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
                    <div className="space-y-1 text-sm bg-muted/50 rounded-lg p-3">
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
                {formData.is_recurring && (
                  <div className="px-4 py-3 border-b">
                    <label className="text-sm text-muted-foreground mb-2 block">Repeat every</label>
                    <Select 
                      value={formData.recurring_interval} 
                      onValueChange={(v) => setFormData({ ...formData, recurring_interval: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Week</SelectItem>
                        <SelectItem value="biweekly">2 Weeks</SelectItem>
                        <SelectItem value="monthly">Month</SelectItem>
                        <SelectItem value="quarterly">Quarter</SelectItem>
                        <SelectItem value="yearly">Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <InfoRow 
                  label="Send" 
                  value={formData.send_immediately ? 'Immediately' : `Scheduled: ${formData.scheduled_send_at ? format(new Date(formData.scheduled_send_at), 'MMM d, yyyy') : 'Not set'}`}
                  onClick={() => setSendScheduleOpen(true)}
                />
                <InfoRow 
                  label="Due" 
                  value={formData.due_label}
                  onClick={() => setDueDateOpen(true)}
                />
                <div className="px-4 py-3 border-b">
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Note</label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value.slice(0, 250) })}
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
                    className="w-full border-dashed border-primary text-primary hover:bg-primary/5"
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
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
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
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
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
                <div className="border-b">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full py-3 px-4 hover:bg-muted/30 transition-colors"
                    onClick={() => setPaymentMethodsOpen(true)}
                  >
                    <div>
                      <p className="font-medium text-left">Accepted Methods</p>
                      <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                        {enabledMethods.map((method, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <method.icon className="w-3 h-3" />
                            <span>{method.name}</span>
                            <span className="text-xs text-primary">{method.fee}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-primary text-sm font-medium">Edit</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                </div>
                
                <button
                  type="button"
                  className="flex items-center justify-between w-full py-3 px-4 hover:bg-muted/30 transition-colors border-b"
                  onClick={() => setRemindersOpen(true)}
                >
                  <div>
                    <p className="font-medium text-left flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      Payment Reminders
                    </p>
                    <div className="text-sm text-muted-foreground mt-1">
                      {reminders.length > 0 ? (
                        reminders.map((r: any) => (
                          <p key={r.id}>{r.days_after_due} days after due date</p>
                        ))
                      ) : (
                        <p>No reminders set</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-primary text-sm font-medium">Edit</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              </CollapsibleContent>
            </Collapsible>

            {/* Additional Options Section - Removed email copy toggle (SMS-only platform) */}
          </div>

          {/* Sticky Footer */}
          <div className="absolute bottom-0 left-0 right-0 bg-background border-t p-4 space-y-3">
            {/* Price Breakdown */}
            {(showDiscount || showTax) && lineItems.length > 0 && (
              <div className="text-sm space-y-1 pb-2 border-b">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {showDiscount && discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount ({discountPercent}%)</span>
                    <span>-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {showTax && taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({taxPercent}%)</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Total due</span>
              <span className="text-lg font-semibold">${totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handlePreview}
                disabled={saveMutation.isPending || lineItems.length === 0}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button
                className="flex-1"
                onClick={handleSend}
                disabled={saveMutation.isPending || lineItems.length === 0 || !selectedCustomer}
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Mail className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sheets */}
      <PaymentMethodsSheet
        open={paymentMethodsOpen}
        onOpenChange={setPaymentMethodsOpen}
        organizationId={organizationId}
      />
      <PaymentRemindersSheet
        open={remindersOpen}
        onOpenChange={setRemindersOpen}
        organizationId={organizationId}
      />
      <DueDateSheet
        open={dueDateOpen}
        onOpenChange={setDueDateOpen}
        value={formData.due_date}
        onChange={(date, label) => setFormData({ ...formData, due_date: date || format(new Date(), 'yyyy-MM-dd'), due_label: label })}
      />
      <SendScheduleSheet
        open={sendScheduleOpen}
        onOpenChange={setSendScheduleOpen}
        sendImmediately={formData.send_immediately}
        scheduledDate={formData.scheduled_send_at}
        scheduledTime={formData.scheduled_time}
        onChange={(immediately, date, time) => setFormData({ 
          ...formData, 
          send_immediately: immediately, 
          scheduled_send_at: date,
          scheduled_time: time 
        })}
      />
    </>
  );
}
