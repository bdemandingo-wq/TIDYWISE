import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Bell, LayoutGrid, Mail, MessageSquare, RotateCcw, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  SIDEBAR_DEFAULTS,
  BELL_DEFAULTS,
  CHANNEL_DEFAULTS,
} from '@/hooks/useNotificationPreferences';

interface Item { key: string; label: string; hint?: string; }
interface Group { title: string; items: Item[]; }

const SIDEBAR_GROUPS: Group[] = [
  { title: 'Staff', items: [
    { key: 'staff.time_off', label: 'Pending time-off requests' },
    { key: 'staff.documents', label: 'Pending staff documents' },
    { key: 'staff.payout', label: 'Staff payout / setup issues' },
  ]},
  { title: 'Bookings', items: [
    { key: 'bookings.unassigned', label: 'Unassigned bookings' },
    { key: 'bookings.pending', label: 'Pending confirmations' },
    { key: 'bookings.payment', label: 'Payment / card issues' },
  ]},
  { title: 'Scheduler', items: [
    { key: 'scheduler.time_off_conflicts', label: 'Staff time-off conflicts' },
    { key: 'scheduler.overlaps', label: 'Schedule overlaps / unassigned' },
  ]},
  { title: 'Client Portal', items: [
    { key: 'client_portal.requests', label: 'Booking requests' },
    { key: 'client_portal.reschedule', label: 'Reschedule / cancel requests' },
  ]},
  { title: 'Messages', items: [
    { key: 'messages.unread', label: 'Unread messages' },
  ]},
  { title: 'Tasks', items: [
    { key: 'tasks.open', label: 'Open tasks' },
    { key: 'tasks.overdue', label: 'Overdue tasks (priority)' },
  ]},
  { title: 'Leads', items: [
    { key: 'leads.new', label: 'New leads' },
    { key: 'leads.stale', label: 'Stale / hot leads' },
  ]},
  { title: 'Inventory', items: [
    { key: 'inventory.low', label: 'Low stock' },
  ]},
  { title: 'Automation / Campaigns', items: [
    { key: 'automation.failed', label: 'Failed sends' },
    { key: 'automation.stuck', label: 'Queue stuck' },
  ]},
  { title: 'Payments / Stripe', items: [
    { key: 'payments.stripe_requirements', label: 'Stripe requirements' },
    { key: 'payments.failed_charges', label: 'Failed charges' },
  ]},
  { title: 'Feedback', items: [
    { key: 'feedback.low_rating', label: 'Low-rating feedback' },
    { key: 'feedback.complaint', label: 'New complaint' },
  ]},
];

const BELL_ITEMS: Item[] = [
  { key: 'bell.new_booking_request', label: 'New booking request' },
  { key: 'bell.new_booking', label: 'New booking (noisy)' },
  { key: 'bell.time_off', label: 'Time-off request' },
  { key: 'bell.staff_document', label: 'Staff document uploaded' },
  { key: 'bell.failed_payment', label: 'Failed payment / charge' },
  { key: 'bell.unread_message', label: 'New unread message' },
  { key: 'bell.new_lead', label: 'New lead' },
  { key: 'bell.low_feedback', label: 'Low-rating feedback' },
  { key: 'bell.automation_failure', label: 'Automation failure' },
  { key: 'bell.inventory_low', label: 'Inventory low stock' },
  { key: 'bell.payroll', label: 'Payroll ready / failure' },
  { key: 'bell.stripe_requirement', label: 'Stripe requirement' },
];

const CHANNEL_ITEMS: Array<Item & { icon: any }> = [
  { key: 'channel.in_app_bell', label: 'In-app bell', icon: Bell },
  { key: 'channel.sidebar_badge', label: 'Sidebar badge', icon: LayoutGrid },
  { key: 'channel.browser_push', label: 'Browser push', icon: Zap },
  { key: 'channel.email_summary', label: 'Email summary', icon: Mail },
  { key: 'channel.sms_urgent', label: 'SMS alert (urgent only)', icon: MessageSquare },
];

export function NotificationPreferencesCard() {
  const prefs = useNotificationPreferences();
  const { save, resetToDefaults, saving } = useUpdateNotificationPreferences();
  const [resetting, setResetting] = useState(false);

  const sb = prefs.sidebar_badges;
  const bell = prefs.bell_notifications;
  const ch = prefs.channels;

  const toggleSidebar = async (key: string, value: boolean) => {
    const res = await save({ sidebar_badges: { [key]: value } });
    if (res.error) toast.error(res.error);
  };
  const toggleBell = async (key: string, value: boolean) => {
    const res = await save({ bell_notifications: { [key]: value } });
    if (res.error) toast.error(res.error);
  };
  const toggleChannel = async (key: string, value: boolean) => {
    const res = await save({ channels: { [key]: value } });
    if (res.error) toast.error(res.error);
  };

  const handleReset = async () => {
    setResetting(true);
    const res = await resetToDefaults();
    setResetting(false);
    if (res.error) toast.error(res.error);
    else toast.success('Reset to recommended defaults');
  };

  const isOn = (obj: Record<string, boolean>, k: string, def = true) =>
    obj?.[k] === undefined ? def : !!obj[k];

  return (
    <>
      {/* Delivery Channels */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Delivery Channels
              </CardTitle>
              <CardDescription>
                Choose how notifications reach you. Turning off a channel here disables it globally.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={resetting || saving} className="gap-2 shrink-0">
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Reset to defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNEL_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <Label className="cursor-pointer">{item.label}</Label>
                </div>
                <Switch
                  checked={isOn(ch, item.key, CHANNEL_DEFAULTS[item.key] ?? true)}
                  onCheckedChange={(v) => toggleChannel(item.key, v)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Sidebar Badges */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-primary" />
            Sidebar Badges
          </CardTitle>
          <CardDescription>
            Show a red count on sidebar items for unresolved action items. Turning off a badge does not hide the page or the data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {SIDEBAR_GROUPS.map(group => (
            <div key={group.title}>
              <div className="text-sm font-semibold mb-2">{group.title}</div>
              <div className="space-y-2 pl-2">
                {group.items.map(item => (
                  <div key={item.key} className="flex items-center justify-between">
                    <Label className="cursor-pointer text-sm">{item.label}</Label>
                    <Switch
                      checked={isOn(sb, item.key, SIDEBAR_DEFAULTS[item.key] ?? true)}
                      onCheckedChange={(v) => toggleSidebar(item.key, v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Bell Notifications */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Bell Notifications
          </CardTitle>
          <CardDescription>
            Control which events appear in the in-app bell feed. Critical failures (payments, security) still surface even when their category is off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {BELL_ITEMS.map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <Label className="cursor-pointer text-sm">{item.label}</Label>
              <Switch
                checked={isOn(bell, item.key, BELL_DEFAULTS[item.key] ?? true)}
                onCheckedChange={(v) => toggleBell(item.key, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
