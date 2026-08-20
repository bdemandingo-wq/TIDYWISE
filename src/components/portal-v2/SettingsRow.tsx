import { ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Button } from './Button';

/**
 * One settings row. The variants come from what the live screens actually use,
 * not from a taxonomy:
 *
 *   toggle   label + optional description + Switch     NotificationPreferencesCard,
 *                                                      AutomationsTab, SMSSettingsCard
 *   input    label + optional description + field,     SettingsPage (17 Inputs,
 *            optionally a trailing action              21 Labels), PortalSettingsTab
 *                                                      ("Change Password" = field + button)
 *   action   label + description + a button            connect/disconnect, destructive
 *   value    label + current value + chevron           navigates to a sub-screen
 *
 * `indent` exists because NotificationPreferencesCard nests three deep — a
 * master toggle, then a category, then individual types. The nesting is real,
 * so the row supports it rather than each caller inventing padding.
 *
 * §3 rule 14: every row is at least 44px, and the control is the tap target.
 */

type Base = { label: string; description?: string; indent?: boolean; disabled?: boolean };

export function SettingsRow(
  props: Base &
    (
      | { kind: 'toggle'; checked: boolean; onCheckedChange: (v: boolean) => void }
      | {
          kind: 'input';
          value: string;
          onChange: (v: string) => void;
          placeholder?: string;
          inputType?: 'text' | 'email' | 'tel' | 'number' | 'password';
          suffix?: string;
          action?: { label: string; onClick?: () => void };
        }
      | { kind: 'action'; action: { label: string; onClick?: () => void }; tone?: 'default' | 'danger' }
      | { kind: 'value'; value: string; onClick?: () => void }
    ),
) {
  const { label, description, indent, disabled } = props;

  const text = (
    <span className="min-w-0 flex-1">
      <span
        className={cn(
          'block text-[13px] font-bold',
          disabled ? 'text-[hsl(var(--pv-ink-disabled))]' : 'text-[hsl(var(--pv-ink))]',
        )}
      >
        {label}
      </span>
      {description && (
        <span className="mt-0.5 block text-[11.5px] font-normal leading-[1.45] text-[hsl(var(--pv-ink-3))]">
          {description}
        </span>
      )}
    </span>
  );

  const shell = cn('flex min-h-[44px] w-full items-center gap-3 py-2', indent && 'pl-6');

  if (props.kind === 'toggle') {
    return (
      <label className={cn(shell, 'cursor-pointer')}>
        {text}
        <Switch
          checked={props.checked}
          disabled={disabled}
          onCheckedChange={props.onCheckedChange}
          aria-label={label}
          className="shrink-0"
        />
      </label>
    );
  }

  if (props.kind === 'input') {
    const id = `set-${label.replace(/\W+/g, '-').toLowerCase()}`;
    return (
      <div className={cn(shell, 'flex-col items-stretch gap-1.5')}>
        <label htmlFor={id} className="flex">
          {text}
        </label>
        <div className={cn('flex items-center gap-2', indent && '')}>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3">
            <input
              id={id}
              type={props.inputType ?? 'text'}
              value={props.value}
              disabled={disabled}
              placeholder={props.placeholder}
              onChange={(e) => props.onChange(e.target.value)}
              className="h-11 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:outline-none disabled:text-[hsl(var(--pv-ink-disabled))]"
            />
            {props.suffix && (
              <span className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-ink-3))]">
                {props.suffix}
              </span>
            )}
          </div>
          {props.action && (
            <Button variant="secondary" onClick={props.action.onClick} className="shrink-0">
              {props.action.label}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (props.kind === 'action') {
    return (
      <div className={shell}>
        {text}
        <Button
          variant={props.tone === 'danger' ? 'secondary' : 'secondary'}
          onClick={props.action.onClick}
          className={cn(
            'shrink-0',
            props.tone === 'danger' &&
              'border-[hsl(var(--pv-danger))] text-[hsl(var(--pv-danger))]',
          )}
        >
          {props.action.label}
        </Button>
      </div>
    );
  }

  return (
    <button type="button" onClick={props.onClick} disabled={disabled} className={cn(shell, 'text-left')}>
      {text}
      <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-[hsl(var(--pv-ink-3))]">
        {props.value}
      </span>
      {props.onClick && (
        <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--pv-ink-4))]" aria-hidden />
      )}
    </button>
  );
}
