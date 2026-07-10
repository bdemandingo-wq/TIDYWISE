import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { Loader2, Palette, RotateCcw, Search, Check } from 'lucide-react';
import {
  NAV_ITEMS,
  NAV_ICON_LIBRARY,
  resolveNavIcon,
  getNavIconComponent,
  type NavItemDef,
} from '@/lib/navIcons';
import { useNavIconOverrides } from '@/hooks/useNavIconOverrides';
import { cn } from '@/lib/utils';

function IconPicker({
  item,
  currentKey,
  onPick,
}: {
  item: NavItemDef;
  currentKey: string;
  onPick: (key: string) => void;
}) {
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
          aria-label={`Change icon for ${item.name}`}
        >
          <Current className="h-4 w-4" />
          <span className="text-xs text-muted-foreground truncate max-w-[80px]">{currentKey}</span>
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

export function NavIconStyleSettings() {
  const { overrides, isLoading, setIcon, resetAll } = useNavIconOverrides();
  const [busy, setBusy] = useState(false);

  const handlePick = async (navId: string, key: string) => {
    try {
      await setIcon(navId, key);
    } catch {
      toast.error('Could not save icon');
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await resetAll();
      toast.success('Icons reset to defaults');
    } catch {
      toast.error('Failed to reset icons');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Icon style
        </CardTitle>
        <CardDescription>
          Pick a Lucide icon for each sidebar item. Changes sync across every
          browser, device, and the mobile app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Live preview */}
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Live preview</p>
              <div className="flex flex-wrap gap-2">
                {NAV_ITEMS.map((item) => {
                  const Icon = resolveNavIcon(item, overrides);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-item pickers */}
            <div className="grid gap-1 max-h-[420px] overflow-y-auto pr-1">
              {NAV_ITEMS.map((item) => {
                const currentKey = overrides[item.id] ?? item.defaultIconKey;
                const isCustom = !!overrides[item.id] && overrides[item.id] !== item.defaultIconKey;
                const Icon = resolveNavIcon(item, overrides);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.name}</p>
                      {isCustom && (
                        <p className="text-[10px] text-primary">
                          Custom · default was {item.defaultIconKey}
                        </p>
                      )}
                    </div>
                    <IconPicker
                      item={item}
                      currentKey={currentKey}
                      onPick={(k) => handlePick(item.id, k)}
                    />
                    {isCustom && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handlePick(item.id, item.defaultIconKey)}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={busy || Object.keys(overrides).length === 0}
                className="gap-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reset all icons to default
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
