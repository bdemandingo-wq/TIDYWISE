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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Loader2 } from 'lucide-react';

type Readiness = 'yes' | 'no' | 'not_sure';
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
    has_google_business: '' as Readiness | '',
    has_google_ads: '' as Readiness | '',
    has_lsa_verified: '' as Readiness | '',
    has_facebook_bm: '' as Readiness | '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    notes: '',
  });

  const update = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const MIN_BUDGETS: Record<AdServiceType, number> = {
    google_search: 1500,
    google_lsa: 1500,
    facebook: 1500,
  };
  const minBudget = serviceType ? MIN_BUDGETS[serviceType] : 0;
  const isFacebook = serviceType === 'facebook';
  const budgetNum = Number(form.monthly_budget);
  const budgetTooLow =
    !!serviceType && form.monthly_budget !== '' && budgetNum < minBudget;

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
      toast.error(
        `${SERVICE_LABEL[serviceType]} requires a minimum $${minBudget}/mo ad budget`,
      );
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
          has_google_business: form.has_google_business || null,
          has_google_ads: form.has_google_ads || null,
          has_lsa_verified: form.has_lsa_verified || null,
          has_facebook_bm: form.has_facebook_bm || null,
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
        has_google_business: '',
        has_google_ads: '',
        has_lsa_verified: '',
        has_facebook_bm: '',
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
            {serviceType && (
              <p>
                {SERVICE_LABEL[serviceType]} requires a{' '}
                <strong>minimum ${minBudget}/mo ad budget</strong> paid directly to{' '}
                {isFacebook ? 'Facebook' : 'Google'} (separate from the $400/mo
                management fee).
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
              Monthly ad budget (USD){serviceType ? ` — min $${minBudget}` : ''}
            </Label>
            <Input
              id="budget"
              type="number"
              min={0}
              placeholder={String(minBudget)}
              value={form.monthly_budget}
              onChange={(e) => update('monthly_budget', e.target.value)}
            />
            {budgetTooLow && serviceType && (
              <p className="text-xs text-destructive mt-1">
                {SERVICE_LABEL[serviceType]} requires a minimum ${minBudget}/mo budget.
              </p>
            )}
          </div>

          {/* Account-readiness questions: helps onboarding know what to
              CREATE vs CONNECT during done-for-you setup. Each service
              type only shows the questions relevant to it (plus GBP,
              which both Google services need). */}
          <div className="pt-2 space-y-3">
            <p className="text-sm font-medium text-foreground">
              What do you already have set up?
            </p>

            <ReadinessQuestion
              label="A Google Business Profile (the listing that shows on Google Maps)"
              value={form.has_google_business}
              onChange={(v) => update('has_google_business', v)}
            />

            {serviceType === 'google_search' && (
              <ReadinessQuestion
                label="A Google Ads account"
                value={form.has_google_ads}
                onChange={(v) => update('has_google_ads', v)}
              />
            )}

            {serviceType === 'google_lsa' && (
              <ReadinessQuestion
                label="Google Local Services Ads (license-verified)"
                value={form.has_lsa_verified}
                onChange={(v) => update('has_lsa_verified', v)}
              />
            )}

            {serviceType === 'facebook' && (
              <ReadinessQuestion
                label="A Facebook Page + Business Manager"
                value={form.has_facebook_bm}
                onChange={(v) => update('has_facebook_bm', v)}
              />
            )}

            <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 leading-relaxed">
              <strong className="text-foreground">Don't have these yet? No problem</strong> —
              we set them up for you during onboarding. You'll own the accounts; ad spend is
              billed directly to your card by Google/Facebook (separate from the $400/mo
              management fee).
            </p>
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

interface ReadinessQuestionProps {
  label: string;
  value: Readiness | '';
  onChange: (v: Readiness) => void;
}

function ReadinessQuestion({ label, value, onChange }: ReadinessQuestionProps) {
  const options: { value: Readiness; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'not_sure', label: 'Not sure' },
  ];
  return (
    <div>
      <p className="text-sm text-foreground mb-1.5">{label}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
              value === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
