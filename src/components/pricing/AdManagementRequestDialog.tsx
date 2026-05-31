import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export type AdServiceType = 'google_search' | 'google_lsa' | 'facebook';

const SERVICE_LABEL: Record<AdServiceType, string> = {
  google_search: 'Google Search Ads',
  google_lsa: 'Google Local Services Ads',
  facebook: 'Facebook Ads',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceType: AdServiceType | null;
}

export function AdManagementRequestDialog({ open, onOpenChange, serviceType }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    business_name: '',
    service_area: '',
    monthly_budget: '',
    has_ad_accounts: false,
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    notes: '',
  });

  const update = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const isFacebook = serviceType === 'facebook';
  const budgetNum = Number(form.monthly_budget);
  const budgetTooLow = isFacebook && form.monthly_budget !== '' && budgetNum < 500;

  const handleSubmit = async () => {
    if (!serviceType) return;
    if (!user) {
      toast.error('Please sign in to request ad management');
      navigate('/login?redirect=/pricing');
      return;
    }
    if (!form.business_name.trim() || !form.service_area.trim()) {
      toast.error('Business name and service area are required');
      return;
    }
    if (!form.contact_email.trim() && !user.email) {
      toast.error('Contact email is required');
      return;
    }
    if (budgetTooLow) {
      toast.error('Facebook Ads requires a minimum $500/mo ad budget');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-ad-management', {
        body: {
          service_type: serviceType,
          business_name: form.business_name.trim(),
          service_area: form.service_area.trim(),
          monthly_budget: form.monthly_budget ? Number(form.monthly_budget) : null,
          has_ad_accounts: form.has_ad_accounts,
          contact_name: form.contact_name.trim() || null,
          contact_email: form.contact_email.trim() || user.email,
          contact_phone: form.contact_phone.trim() || null,
          notes: form.notes.trim() || null,
        },
      });

      if (error) {
        let msg = error.message || 'Request failed';
        const ctx: any = (error as any)?.context;
        try {
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success("Request received — we'll reach out to get you set up.");
      onOpenChange(false);
      setForm({
        business_name: '',
        service_area: '',
        monthly_budget: '',
        has_ad_accounts: false,
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        notes: '',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Get started with {serviceType ? SERVICE_LABEL[serviceType] : 'ad management'}
          </DialogTitle>
          <DialogDescription>
            Ad management is done-for-you, so we set things up manually after a quick
            intake. No charge today.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-muted/40">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs space-y-1">
            <p><strong>Requires an active paid TidyWise plan.</strong></p>
            {isFacebook && (
              <p>
                Facebook Ads requires a <strong>minimum $500/mo ad budget</strong> paid
                directly to Facebook (separate from the $400/mo management fee).
              </p>
            )}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div>
            <Label htmlFor="biz">Business name *</Label>
            <Input
              id="biz"
              value={form.business_name}
              onChange={(e) => update('business_name', e.target.value)}
              maxLength={120}
            />
          </div>

          <div>
            <Label htmlFor="area">Service area / zip codes *</Label>
            <Input
              id="area"
              placeholder="e.g. 33701, 33702, St. Petersburg FL"
              value={form.service_area}
              onChange={(e) => update('service_area', e.target.value)}
              maxLength={255}
            />
          </div>

          <div>
            <Label htmlFor="budget">
              Monthly ad budget (USD){isFacebook ? ' — min $500' : ''}
            </Label>
            <Input
              id="budget"
              type="number"
              min={0}
              placeholder={isFacebook ? '500' : '300'}
              value={form.monthly_budget}
              onChange={(e) => update('monthly_budget', e.target.value)}
            />
            {budgetTooLow && (
              <p className="text-xs text-destructive mt-1">
                Facebook Ads requires a minimum $500/mo budget.
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="hasAccts"
              checked={form.has_ad_accounts}
              onCheckedChange={(v) => update('has_ad_accounts', v === true)}
            />
            <Label htmlFor="hasAccts" className="text-sm leading-tight font-normal">
              I already have a {serviceType === 'facebook' ? 'Facebook' : 'Google'} ads
              account set up
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <Label htmlFor="cname">Your name</Label>
              <Input
                id="cname"
                value={form.contact_name}
                onChange={(e) => update('contact_name', e.target.value)}
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="cphone">Phone</Label>
              <Input
                id="cphone"
                type="tel"
                value={form.contact_phone}
                onChange={(e) => update('contact_phone', e.target.value)}
                maxLength={40}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cemail">
              Contact email {user?.email ? '' : '*'}
            </Label>
            <Input
              id="cemail"
              type="email"
              placeholder={user?.email ?? 'you@example.com'}
              value={form.contact_email}
              onChange={(e) => update('contact_email', e.target.value)}
              maxLength={255}
            />
          </div>

          <div>
            <Label htmlFor="notes">Anything else we should know? (optional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              maxLength={1000}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || budgetTooLow}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              'Submit request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
