import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { CURRENCIES, getCurrency } from '@/lib/currency';
import { getAllTimezones, getTimezoneOffsetLabel } from '@/lib/timezones';

interface CurrencyPickerProps {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  className?: string;
}

export function CurrencyPicker({ value, onChange, id, className }: CurrencyPickerProps) {
  const [open, setOpen] = useState(false);
  const info = getCurrency(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
        >
          <span className="truncate">
            {info.symbol} {info.code} — {info.name}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currencies..." />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {CURRENCIES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.name} ${c.symbol}`}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === c.code ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-medium w-12">{c.symbol}</span>
                  <span className="font-mono w-14">{c.code}</span>
                  <span className="text-muted-foreground truncate">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface TimezonePickerProps {
  value: string;
  onChange: (tz: string) => void;
  id?: string;
  className?: string;
}

export function TimezonePicker({ value, onChange, id, className }: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const all = useMemo(() => getAllTimezones(), []);
  const currentOffset = getTimezoneOffsetLabel(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
        >
          <span className="truncate">
            {value} {currentOffset && <span className="text-muted-foreground">({currentOffset})</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezones..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {all.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  onSelect={() => {
                    onChange(tz);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === tz ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 truncate">{tz}</span>
                  <span className="text-xs text-muted-foreground ml-2">{getTimezoneOffsetLabel(tz)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface LocalePickersProps {
  currency: string;
  timezone: string;
  onCurrencyChange: (code: string) => void;
  onTimezoneChange: (tz: string) => void;
}

/** Side-by-side currency + timezone pickers with labels. */
export function LocalePickers({
  currency,
  timezone,
  onCurrencyChange,
  onTimezoneChange,
}: LocalePickersProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="currency-picker">Currency</Label>
        <CurrencyPicker id="currency-picker" value={currency} onChange={onCurrencyChange} />
        <p className="text-xs text-muted-foreground">
          Used for all prices, invoices, payments, and reports.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone-picker">Timezone</Label>
        <TimezonePicker id="timezone-picker" value={timezone} onChange={onTimezoneChange} />
        <p className="text-xs text-muted-foreground">
          All booking times and reports display in this timezone.
        </p>
      </div>
    </div>
  );
}
