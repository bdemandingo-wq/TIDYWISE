import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Search, Check } from 'lucide-react';
import { NAV_ICON_LIBRARY, getNavIconComponent } from '@/lib/navIcons';
import { cn } from '@/lib/utils';

interface NavIconPickerProps {
  label: string;
  currentKey: string;
  onPick: (key: string) => void;
  compact?: boolean;
}

export function NavIconPicker({ label, currentKey, onPick, compact }: NavIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const Current = getNavIconComponent(currentKey);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const entries = Object.entries(NAV_ICON_LIBRARY);
    if (!term) return entries;
    return entries.filter(([name]) => name.toLowerCase().includes(term));
  }, [q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          aria-label={`Change icon for ${label}`}
        >
          <Current className="h-4 w-4" />
          {!compact && (
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">
              {currentKey}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search icons…"
            className="pl-7 h-8 text-xs"
          />
        </div>
        <div className="grid grid-cols-6 gap-1 max-h-64 overflow-y-auto">
          {filtered.map(([name, Icon]) => {
            const isActive = name === currentKey;
            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => {
                  onPick(name);
                  setOpen(false);
                }}
                className={cn(
                  'aspect-square rounded-md flex items-center justify-center hover:bg-accent transition relative',
                  isActive && 'bg-accent ring-2 ring-primary',
                )}
              >
                <Icon className="h-4 w-4" />
                {isActive && (
                  <Check className="absolute -top-1 -right-1 h-3 w-3 text-primary bg-background rounded-full" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-6 text-center text-xs text-muted-foreground py-4">
              No icons match “{q}”.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
