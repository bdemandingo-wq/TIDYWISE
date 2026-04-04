import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Phone, MessageSquare, Mail, CreditCard, MapPin, Calendar,
  DollarSign, ChevronRight, FileText, Clock, Loader2, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@/contexts/OrganizationContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

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
  notes?: string | null;
  customer_status?: string | null;
}

interface MobileContactProfileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onEdit: () => void;
  onPaymentHistory: () => void;
}

export function MobileContactProfile({
  open,
  onOpenChange,
  customer,
  onEdit,
  onPaymentHistory,
}: MobileContactProfileProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [notes, setNotes] = useState(customer?.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  // Fetch booking stats
  const { data: bookingStats } = useQuery({
    queryKey: ['customer-booking-stats', customer?.id, organization?.id],
    queryFn: async () => {
      if (!customer?.id || !organization?.id) return null;
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, scheduled_at, total_amount, status')
        .eq('customer_id', customer.id)
        .eq('organization_id', organization.id)
        .order('scheduled_at', { ascending: false });

      if (!bookings || bookings.length === 0) return { total: 0, totalSpent: 0, lastDate: null, nextDate: null };

      const now = new Date().toISOString();
      const completed = bookings.filter(b => b.status === 'completed' || b.status === 'confirmed');
      const upcoming = bookings.find(b => b.scheduled_at > now && b.status !== 'cancelled');
      const totalSpent = completed.reduce((sum, b) => sum + (b.total_amount || 0), 0);

      return {
        total: bookings.filter(b => b.status !== 'cancelled').length,
        totalSpent,
        lastDate: completed[0]?.scheduled_at || null,
        nextDate: upcoming?.scheduled_at || null,
      };
    },
    enabled: !!customer?.id && !!organization?.id && open,
  });

  // Fetch primary address
  const { data: primaryAddress } = useQuery({
    queryKey: ['customer-primary-address', customer?.id],
    queryFn: async () => {
      if (!customer?.id) return null;
      const { data } = await supabase
        .from('locations')
        .select('address, city, state, zip_code')
        .eq('customer_id', customer.id)
        .eq('is_primary', true)
        .maybeSingle();
      return data;
    },
    enabled: !!customer?.id && open,
  });

  if (!customer) return null;

  const initials = `${customer.first_name?.[0] || ''}${customer.last_name?.[0] || ''}`.toUpperCase();
  const fullName = `${customer.first_name} ${customer.last_name}`;
  const addressLine = primaryAddress
    ? [primaryAddress.address, primaryAddress.city, primaryAddress.state, primaryAddress.zip_code].filter(Boolean).join(', ')
    : [customer.address, customer.city, customer.state, customer.zip_code].filter(Boolean).join(', ');

  const handleSaveNotes = async () => {
    if (!customer?.id) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ notes })
        .eq('id', customer.id);
      if (error) throw error;
      toast.success('Notes saved');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const quickActions = [
    {
      icon: Phone,
      label: 'Call',
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/40',
      disabled: !customer.phone,
      onClick: () => customer.phone && window.open(`tel:${customer.phone}`),
    },
    {
      icon: MessageSquare,
      label: 'Text',
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-100 dark:bg-green-900/40',
      disabled: !customer.phone,
      onClick: () => customer.phone && window.open(`sms:${customer.phone}`),
    },
    {
      icon: Mail,
      label: 'Mail',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/40',
      disabled: !customer.email,
      onClick: () => customer.email && window.open(`mailto:${customer.email}`),
    },
    {
      icon: CreditCard,
      label: 'Pay',
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-100 dark:bg-purple-900/40',
      disabled: false,
      onClick: () => {
        toast.info('Payment link feature');
      },
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl p-0 overflow-y-auto bg-muted/50 dark:bg-background">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Close + Edit row */}
        <div className="flex items-center justify-between px-4 pb-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onOpenChange(false)}>
            <X className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="sm" className="text-primary font-medium" onClick={() => { onOpenChange(false); onEdit(); }}>
            Edit
          </Button>
        </div>

        {/* Header — Avatar + Name */}
        <div className="flex flex-col items-center px-6 pb-5">
          <Avatar className="w-24 h-24 mb-3">
            <AvatarFallback className="text-2xl font-semibold bg-gradient-to-br from-primary/20 to-accent/20 text-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-xl font-bold text-foreground">{fullName}</h2>
          {customer.customer_status && (
            <Badge
              variant="secondary"
              className={cn(
                'mt-1.5 text-xs',
                customer.customer_status === 'active' && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                customer.customer_status === 'lead' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                customer.customer_status === 'inactive' && 'bg-muted text-muted-foreground',
              )}
            >
              {customer.customer_status === 'active' ? 'Active Client' : customer.customer_status === 'lead' ? 'Lead' : 'Inactive'}
            </Badge>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2 px-6 pb-5">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              className={cn(
                'flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors',
                action.bg,
                action.disabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              <action.icon className={cn('w-5 h-5', action.color)} />
              <span className={cn('text-[11px] font-medium', action.color)}>{action.label}</span>
            </button>
          ))}
        </div>

        {/* Section 1 — Contact Info */}
        <div className="mx-4 mb-3 rounded-xl bg-card shadow-sm overflow-hidden">
          <SectionHeader title="Contact Info" />
          {customer.phone && (
            <InfoRow
              icon={<Phone className="w-4 h-4 text-muted-foreground" />}
              label="mobile"
              value={customer.phone}
              href={`tel:${customer.phone}`}
            />
          )}
          {customer.email && (
            <>
              {customer.phone && <RowDivider />}
              <InfoRow
                icon={<Mail className="w-4 h-4 text-muted-foreground" />}
                label="email"
                value={customer.email}
                href={`mailto:${customer.email}`}
              />
            </>
          )}
          {addressLine && (
            <>
              <RowDivider />
              <InfoRow
                icon={<MapPin className="w-4 h-4 text-muted-foreground" />}
                label="address"
                value={addressLine}
                href={`https://maps.apple.com/?q=${encodeURIComponent(addressLine)}`}
              />
            </>
          )}
        </div>

        {/* Section 2 — Booking Info */}
        <div className="mx-4 mb-3 rounded-xl bg-card shadow-sm overflow-hidden">
          <SectionHeader title="Booking Info" />
          <StatRow icon={<Calendar className="w-4 h-4 text-muted-foreground" />} label="Total Bookings" value={String(bookingStats?.total ?? '—')} />
          <RowDivider />
          <StatRow
            icon={<Clock className="w-4 h-4 text-muted-foreground" />}
            label="Last Booking"
            value={bookingStats?.lastDate ? format(new Date(bookingStats.lastDate), 'MMM d, yyyy') : '—'}
          />
          <RowDivider />
          <StatRow
            icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
            label="Next Booking"
            value={bookingStats?.nextDate ? format(new Date(bookingStats.nextDate), 'MMM d, yyyy') : '—'}
          />
          <RowDivider />
          <StatRow
            icon={<DollarSign className="w-4 h-4 text-muted-foreground" />}
            label="Total Spent"
            value={bookingStats?.totalSpent != null ? `$${bookingStats.totalSpent.toFixed(2)}` : '—'}
          />
        </div>

        {/* Section 3 — Notes */}
        <div className="mx-4 mb-3 rounded-xl bg-card shadow-sm overflow-hidden">
          <SectionHeader title="Notes" />
          <div className="px-4 pb-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this client..."
              className="min-h-[80px] border-0 bg-transparent resize-none p-0 focus-visible:ring-0 text-sm"
            />
            {notes !== (customer.notes || '') && (
              <div className="flex justify-end mt-2">
                <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                  {savingNotes && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  Save
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Section 4 — Linked Items */}
        <div className="mx-4 mb-8 rounded-xl bg-card shadow-sm overflow-hidden">
          <SectionHeader title="Linked Items" />
          <LinkRow
            icon={<Calendar className="w-4 h-4 text-primary" />}
            label="View Bookings"
            onClick={() => { onOpenChange(false); navigate(`/dashboard/bookings?customer=${customer.id}`); }}
          />
          <RowDivider />
          <LinkRow
            icon={<FileText className="w-4 h-4 text-primary" />}
            label="View Invoices"
            onClick={() => { onOpenChange(false); navigate(`/dashboard/invoices?customer=${customer.id}`); }}
          />
          <RowDivider />
          <LinkRow
            icon={<DollarSign className="w-4 h-4 text-primary" />}
            label="View Payment History"
            onClick={() => { onOpenChange(false); onPaymentHistory(); }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---- Sub-components ---- */

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 pt-3 pb-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    </div>
  );
}

function RowDivider() {
  return <Separator className="ml-12" />;
}

function InfoRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-primary truncate">{value}</p>
      </div>
      {href && <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}
    </div>
  );
  return href ? <a href={href} className="block">{content}</a> : content;
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {icon}
      <span className="text-sm text-foreground flex-1">{label}</span>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

function LinkRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 px-4 py-3 w-full text-left active:bg-muted/50 transition-colors">
      {icon}
      <span className="text-sm text-primary flex-1">{label}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
    </button>
  );
}
