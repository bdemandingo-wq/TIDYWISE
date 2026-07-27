import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Save, Loader2, Upload, Palette, LayoutTemplate, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useInvoiceBusinessInfo } from '@/hooks/useInvoiceBusinessInfo';

export function InvoiceDesignSettings() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const branding = useInvoiceBusinessInfo();
  const isLoading = branding.isLoading;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // font_style is deliberately gone: getFontFamily returned 'Inter' for the
  // default, which email clients cannot load — so the setting visibly did
  // nothing in the surface invoices matter most in.
  const [form, setForm] = useState<{
    logo_url: string | null;
    primary_color: string;
    accent_color: string;
    header_layout: 'left' | 'center' | 'right';
    footer_message: string;
  }>({
    logo_url: null,
    primary_color: '#3b82f6',
    accent_color: '#e5e7eb',
    header_layout: 'left',
    footer_message: 'Thank you for your business!',
  });

  useEffect(() => {
    setForm({
      logo_url: branding.logoUrl,
      primary_color: branding.primaryColor || '#3b82f6',
      accent_color: branding.accentColor || '#e5e7eb',
      header_layout: branding.headerLayout,
      footer_message: branding.footerMessage || 'Thank you for your business!',
    });
  }, [branding]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization?.id) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      // Same {org}/logos/ prefix Settings writes to — a separate key here
      // is how the app ended up with two logos that could disagree.
      const path = `${organization.id}/logos/invoice-logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('business-assets')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('business-assets').getPublicUrl(path);
      setForm(prev => ({ ...prev, logo_url: urlData.publicUrl }));
      toast.success('Logo uploaded');
    } catch (err: any) {
      console.error('Logo upload error:', err);
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!organization?.id) return;
    setSaving(true);
    try {
      const payload = {
        organization_id: organization.id,
        logo_url: form.logo_url,
        primary_color: form.primary_color,
        accent_color: form.accent_color,
        invoice_header_layout: form.header_layout,
        invoice_footer_message: form.footer_message,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from('business_settings')
        .upsert(payload, { onConflict: 'organization_id' });
      if (error) {
        console.error('[InvoiceDesign] Save error:', error);
        throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      toast.success('Invoice design saved');
    } catch (err: any) {
      console.error('[InvoiceDesign] Save failed:', err);
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Settings Panel */}
      <div className="space-y-6">
        {/* Logo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="w-4 h-4" /> Invoice Logo
            </CardTitle>
            <CardDescription>Displayed in the invoice header</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" className="h-12 w-auto max-w-[160px] object-contain rounded border p-1 bg-white" height={48} loading="lazy" />
              ) : (
                <div className="h-12 w-24 border-2 border-dashed rounded flex items-center justify-center text-xs text-muted-foreground">No logo</div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                  Upload
                </Button>
                {form.logo_url && (
                  <Button variant="ghost" size="sm" onClick={() => setForm(p => ({ ...p, logo_url: null }))}>Remove</Button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="w-4 h-4" /> Colors
            </CardTitle>
            <CardDescription>Primary for header & totals, accent for table borders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">Primary Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))}
                    className="w-10 h-10 rounded border cursor-pointer p-0"
                    style={{ WebkitAppearance: 'none', appearance: 'none' }}
                  />
                  <Input
                    value={form.primary_color}
                    onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))}
                    className="font-mono text-sm"
                    maxLength={7}
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Accent Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.accent_color}
                    onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                    className="w-10 h-10 rounded border cursor-pointer p-0"
                    style={{ WebkitAppearance: 'none', appearance: 'none' }}
                  />
                  <Input
                    value={form.accent_color}
                    onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                    className="font-mono text-sm"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Layout */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutTemplate className="w-4 h-4" /> Header Layout
            </CardTitle>
            <CardDescription>Where the logo appears in the invoice header</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={form.header_layout} onValueChange={(v: 'left' | 'center' | 'right') => setForm(p => ({ ...p, header_layout: v }))} className="flex gap-4">
              {(['left', 'center', 'right'] as const).map(opt => (
                <div key={opt} className="flex items-center gap-2">
                  <RadioGroupItem value={opt} id={`layout-${opt}`} />
                  <Label htmlFor={`layout-${opt}`} className="capitalize cursor-pointer">{opt}</Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Footer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4" /> Footer Message
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.footer_message}
              onChange={e => setForm(p => ({ ...p, footer_message: e.target.value }))}
              placeholder="Thank you for your business!"
              rows={2}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground mt-1">{form.footer_message.length}/200</p>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Invoice Design
        </Button>
      </div>

      {/* Live Preview */}
      <div className="lg:sticky lg:top-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Live Preview</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className="bg-white rounded-b-lg overflow-hidden border-t"
             
            >
              <InvoicePreview form={form} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvoicePreview({ form }: { form: Omit<InvoiceBranding, 'id' | 'organization_id'> }) {
  const logoEl = form.logo_url ? (
    <img src={form.logo_url} alt="Logo" className="h-8 w-auto max-w-[120px] object-contain" height={32} loading="lazy" />
  ) : null;

  const companyBlock = (
    <div>
      {logoEl && form.header_layout !== 'center' && <div className="mb-1">{logoEl}</div>}
      <p className="font-bold text-sm text-gray-900">Your Company Name</p>
      <p className="text-[10px] text-gray-500">123 Main St, City, ST 12345</p>
    </div>
  );

  const invoiceBlock = (
    <div className={form.header_layout === 'left' ? 'text-right' : 'text-left'}>
      <p className="text-lg font-bold" style={{ color: form.primary_color }}>INVOICE</p>
      <p className="text-[10px] text-gray-500">INV-0042</p>
    </div>
  );

  return (
    <div className="p-5 text-[11px] text-gray-700 space-y-4">
      {/* Header */}
      {form.header_layout === 'center' ? (
        <div className="text-center space-y-1">
          {logoEl && <div className="flex justify-center mb-1">{logoEl}</div>}
          <p className="font-bold text-sm text-gray-900">Your Company Name</p>
          <p className="text-lg font-bold" style={{ color: form.primary_color }}>INVOICE</p>
          <p className="text-[10px] text-gray-500">INV-0042</p>
        </div>
      ) : form.header_layout === 'right' ? (
        <div className="flex justify-between items-start">
          {invoiceBlock}
          <div className="text-right">
            {logoEl && <div className="flex justify-end mb-1">{logoEl}</div>}
            <p className="font-bold text-sm text-gray-900">Your Company Name</p>
            <p className="text-[10px] text-gray-500">123 Main St, City, ST 12345</p>
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-start">
          {companyBlock}
          {invoiceBlock}
        </div>
      )}

      {/* Bill To */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[9px] uppercase text-gray-400 font-medium mb-0.5">Bill To</p>
          <p className="font-medium text-gray-900">Jane Doe</p>
          <p className="text-gray-500">jane@example.com</p>
        </div>
        <div className="text-right text-gray-500">
          <p>Date: Apr 6, 2026</p>
          <p>Due: May 6, 2026</p>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-[10px]">
        <thead>
          <tr style={{ backgroundColor: form.accent_color + '30', borderBottom: `2px solid ${form.accent_color}` }}>
            <th className="text-left py-1.5 px-2 font-medium text-gray-600">Description</th>
            <th className="text-center py-1.5 px-2 font-medium text-gray-600 w-10">Qty</th>
            <th className="text-right py-1.5 px-2 font-medium text-gray-600 w-16">Price</th>
            <th className="text-right py-1.5 px-2 font-medium text-gray-600 w-16">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: `1px solid ${form.accent_color}40` }}>
            <td className="py-1.5 px-2 text-gray-900">Deep Clean Service</td>
            <td className="text-center py-1.5 px-2">1</td>
            <td className="text-right py-1.5 px-2">$250.00</td>
            <td className="text-right py-1.5 px-2 font-medium">$250.00</td>
          </tr>
          <tr style={{ borderBottom: `1px solid ${form.accent_color}40` }}>
            <td className="py-1.5 px-2 text-gray-900">Window Cleaning Add-on</td>
            <td className="text-center py-1.5 px-2">2</td>
            <td className="text-right py-1.5 px-2">$35.00</td>
            <td className="text-right py-1.5 px-2 font-medium">$70.00</td>
          </tr>
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-40 space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal:</span><span>$320.00</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Tax (7%):</span><span>$22.40</span></div>
          <div
            className="flex justify-between font-bold text-sm pt-1 mt-1"
            style={{ borderTop: `2px solid ${form.primary_color}`, color: form.primary_color }}
          >
            <span>Total:</span><span>$342.40</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      {form.footer_message && (
        <div className="pt-3 border-t text-center text-[10px] text-gray-400" style={{ borderColor: form.accent_color + '40' }}>
          {form.footer_message}
        </div>
      )}
    </div>
  );
}
