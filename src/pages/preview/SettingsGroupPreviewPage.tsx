import { useState } from 'react';
import {
  BottomNav,
  Button,
  CLEANER_NAV,
  DetailHeader,
  SettingsGroup,
  SettingsRow,
} from '@/components/portal-v2';

/**
 * SettingsGroup + SettingsRow, every variant side by side.
 *
 * Preview route only; static data, replaces nothing live. Each group below is
 * modelled on a real screen — see §9 of docs/mobile-design-spec.md.
 */

type Load = 'ready' | 'loading' | 'error';

export default function SettingsGroupPreviewPage() {
  const [state, setState] = useState<Load>('ready');

  const [smsOn, setSmsOn] = useState(true);
  const [emailOn, setEmailOn] = useState(true);
  const [reminderClient, setReminderClient] = useState(true);
  const [reminderCleaner, setReminderCleaner] = useState(false);
  const [company, setCompany] = useState('Clean Collective LLC');
  const [hours, setHours] = useState('24');
  const [pw, setPw] = useState('');

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Group state
        </span>
        {(['ready', 'loading', 'error'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className={
              state === s
                ? 'rounded-full bg-[hsl(var(--pv-brand))] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'rounded-full px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-ink-3))]'
            }
          >
            {s}
          </button>
        ))}
      </div>

      <DetailHeader title="Settings" sub="Every row variant, and the three states" />

      <div className="flex flex-1 flex-col gap-3 px-5 pb-6">
        {/* Modelled on NotificationPreferencesCard — master + nested children. */}
        <SettingsGroup
          title="Notifications"
          description="Choose how you hear about bookings, payments and staff activity."
          state={state}
          onRetry={() => setState('ready')}
          skeletonRows={4}
        >
          <SettingsRow
            kind="toggle"
            label="SMS"
            description="Texts to your business number."
            checked={smsOn}
            onCheckedChange={setSmsOn}
          />
          <SettingsRow
            kind="toggle"
            label="Booking reminders"
            indent
            checked={reminderClient}
            onCheckedChange={setReminderClient}
            disabled={!smsOn}
          />
          <SettingsRow
            kind="toggle"
            label="Cleaner running late"
            indent
            checked={reminderCleaner}
            onCheckedChange={setReminderCleaner}
            disabled={!smsOn}
          />
          <SettingsRow
            kind="toggle"
            label="Email"
            description="A daily digest and anything urgent."
            checked={emailOn}
            onCheckedChange={setEmailOn}
          />
        </SettingsGroup>

        {/* Modelled on SettingsPage general tab — plain labelled inputs. */}
        <SettingsGroup
          title="Business"
          description="Shown to clients on bookings, invoices and emails."
          state={state}
          onRetry={() => setState('ready')}
        >
          <SettingsRow
            kind="input"
            label="Business name"
            value={company}
            onChange={setCompany}
            placeholder="Your business name"
          />
          <SettingsRow
            kind="value"
            label="Timezone"
            value="America/New_York"
            onClick={() => {}}
          />
          <SettingsRow
            kind="value"
            label="Currency"
            value="USD"
            onClick={() => {}}
          />
        </SettingsGroup>

        {/* Modelled on AutomationsTab — a number with a unit suffix. */}
        <SettingsGroup
          title="Automations"
          description="How far ahead reminders go out."
          state={state}
          onRetry={() => setState('ready')}
          skeletonRows={2}
        >
          <SettingsRow
            kind="input"
            label="Reminder lead time"
            description="Sent this many hours before the appointment."
            value={hours}
            onChange={setHours}
            inputType="number"
            suffix="hrs"
          />
          <SettingsRow
            kind="action"
            label="Automation health"
            description="Check which automations fired in the last 7 days."
            action={{ label: 'Review' }}
          />
        </SettingsGroup>

        {/* Modelled on PortalSettingsTab — field with a trailing action. */}
        <SettingsGroup
          title="Security"
          description="Change your password or sign out everywhere."
          state={state}
          onRetry={() => setState('ready')}
          skeletonRows={2}
          footer={
            <Button variant="primary" fullWidth>
              Save changes
            </Button>
          }
        >
          <SettingsRow
            kind="input"
            label="New password"
            value={pw}
            onChange={setPw}
            inputType="password"
            placeholder="At least 12 characters"
            action={{ label: 'Update' }}
          />
          <SettingsRow
            kind="action"
            label="Sign out everywhere"
            description="Ends every other session on every device."
            action={{ label: 'Sign out' }}
            tone="danger"
          />
        </SettingsGroup>
      </div>

      <BottomNav items={CLEANER_NAV} active="profile" />
    </main>
  );
}
