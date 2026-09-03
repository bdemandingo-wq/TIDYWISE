import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Bell,
  LayoutGrid,
  Mail,
  MessageSquare,
  RotateCcw,
  Loader2,
  Zap,
  Smartphone,
  Globe,
  Clock,
  ChevronDown,
  Settings2,
  Check,
  MoreVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  SIDEBAR_DEFAULTS,
  BELL_DEFAULTS,
  CHANNEL_DEFAULTS,
  type ChannelMatrix,
  type SnoozeMap,
  type PrefFlags,
} from '@/hooks/useNotificationPreferences';
import {
  NOTIFICATION_TYPES,
  CATEGORIES,
  CHANNELS,
  isChannelEnabled,
  isMasterChannelOn,
  masterChannelKey,
  type NotificationChannel,
  type NotificationTypeDef,
} from '@/lib/notificationCatalog';
import { useOrgRole } from '@/hooks/useOrgRole';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const CHANNEL_ICON: Record<NotificationChannel, any> = {
  sidebar: LayoutGrid,
  bell: Bell,
  browser_push: Globe,
  native_push: Smartphone,
  email: Mail,
  sms: MessageSquare,
};

type Preset = 'action' | 'balanced' | 'everything' | 'custom';

const PRESETS: { key: Preset; label: string; description: string }[] = [
  { key: 'action', label: 'Action required only', description: 'Only alerts that need a response.' },
  { key: 'balanced', label: 'Balanced', description: 'Recommended: key events across sensible channels.' },
  { key: 'everything', label: 'Everything', description: 'Notify me on every event, on every channel.' },
  { key: 'custom', label: 'Custom', description: 'Your own per-event configuration.' },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function effectiveChannelOn(
  type: NotificationTypeDef,
  channel: NotificationChannel,
  matrix: ChannelMatrix,
  snoozed: SnoozeMap,
  channels: PrefFlags
): boolean {
  return isChannelEnabled(type.key, channel, matrix, snoozed, channels);
}

function typeHasAnyChannelOn(
  type: NotificationTypeDef,
  matrix: ChannelMatrix,
  channels: PrefFlags
): boolean {
  return CHANNELS.some(ch =>
    isChannelEnabled(type.key, ch.key, matrix, {}, channels)
  );
}

function activeChannelCountForType(
  type: NotificationTypeDef,
  matrix: ChannelMatrix,
  channels: PrefFlags
): number {
  return CHANNELS.reduce(
    (n, ch) => n + (isChannelEnabled(type.key, ch.key, matrix, {}, channels) ? 1 : 0),
    0
  );
}

function activeMasterChannelCount(channels: PrefFlags): number {
  return CHANNELS.reduce((n, ch) => n + (isMasterChannelOn(ch.key, channels) ? 1 : 0), 0);
}

function buildPresetMatrix(
  preset: Preset,
  types: NotificationTypeDef[]
): { matrix: ChannelMatrix; channels: PrefFlags } {
  const matrix: ChannelMatrix = {};
  const channelsOn: PrefFlags = {};
  for (const ch of CHANNELS) channelsOn[masterChannelKey(ch.key)] = true;

  if (preset === 'balanced') {
    // defaults live in catalog; empty overrides means "use defaults"
    return { matrix: {}, channels: channelsOn };
  }
  if (preset === 'everything') {
    for (const t of types) {
      const row: Record<string, boolean> = {};
      for (const ch of CHANNELS) row[ch.key] = true;
      matrix[t.key] = row;
    }
    return { matrix, channels: channelsOn };
  }
  if (preset === 'action') {
    for (const t of types) {
      const actionable = !!t.sidebarKey;
      const row: Record<string, boolean> = {};
      for (const ch of CHANNELS) row[ch.key] = false;
      if (actionable) {
        row.sidebar = true;
        row.bell = true;
      }
      matrix[t.key] = row;
    }
    return { matrix, channels: channelsOn };
  }
  return { matrix: {}, channels: channelsOn };
}

function shallowEqualMatrix(a: ChannelMatrix, b: ChannelMatrix): boolean {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const ra = a?.[k] || {};
    const rb = b?.[k] || {};
    const ck = new Set([...Object.keys(ra), ...Object.keys(rb)]);
    for (const c of ck) if (ra[c] !== rb[c]) return false;
  }
  return true;
}

function shallowEqualFlags(a: PrefFlags, b: PrefFlags): boolean {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) if (!!a?.[k] !== !!b?.[k]) return false;
  return true;
}

// ── Component ────────────────────────────────────────────────────────────

export function NotificationPreferencesCard() {
  const prefs = useNotificationPreferences();
  const { save, snoozeType, clearSnooze, resetToDefaults, saving } =
    useUpdateNotificationPreferences();
  const { hasFinancialAccess } = useOrgRole();
  const isMobile = useIsMobile();

  const [resetting, setResetting] = useState(false);
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [mobileEditType, setMobileEditType] = useState<NotificationTypeDef | null>(null);

  // Local draft state — edits stage here until the user hits Save.
  const [draftMatrix, setDraftMatrix] = useState<ChannelMatrix>(prefs.notification_matrix);
  const [draftChannels, setDraftChannels] = useState<PrefFlags>(prefs.channels);
  const [draftSnoozed, setDraftSnoozed] = useState<SnoozeMap>(prefs.snoozed_until);
  const [dirty, setDirty] = useState(false);

  // Sync draft with server state when it changes and nothing is pending.
  useEffect(() => {
    if (dirty) return;
    setDraftMatrix(prefs.notification_matrix);
    setDraftChannels(prefs.channels);
    setDraftSnoozed(prefs.snoozed_until);
  }, [prefs, dirty]);

  const visibleTypes = useMemo(
    () => NOTIFICATION_TYPES.filter(t => !t.managerLocked || hasFinancialAccess),
    [hasFinancialAccess]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, NotificationTypeDef[]>();
    for (const c of CATEGORIES) map.set(c, []);
    visibleTypes.forEach(t => map.get(t.category)?.push(t));
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [visibleTypes]);

  // Open the first category by default.
  useEffect(() => {
    if (openCategories.length === 0 && grouped.length > 0) {
      setOpenCategories([grouped[0][0]]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.length]);

  // Detect which preset the current draft matches.
  const currentPreset: Preset = useMemo(() => {
    for (const p of ['balanced', 'everything', 'action'] as Preset[]) {
      const built = buildPresetMatrix(p, visibleTypes);
      if (
        shallowEqualMatrix(built.matrix, draftMatrix) &&
        shallowEqualFlags(built.channels, draftChannels)
      ) {
        return p;
      }
    }
    return 'custom';
  }, [draftMatrix, draftChannels, visibleTypes]);

  // ── Mutators (draft-only) ──
  const mutateChannel = (
    typeKey: string,
    channel: NotificationChannel,
    value: boolean
  ) => {
    setDraftMatrix(prev => ({
      ...prev,
      [typeKey]: { ...(prev[typeKey] || {}), [channel]: value },
    }));
    setDirty(true);
  };

  const mutateType = (type: NotificationTypeDef, value: boolean) => {
    setDraftMatrix(prev => {
      const row: Record<string, boolean> = { ...(prev[type.key] || {}) };
      if (value) {
        // Restore default channels for this type, or fall back to sidebar+bell.
        const def = type.defaults || { sidebar: true, bell: true };
        for (const ch of CHANNELS) row[ch.key] = !!def[ch.key];
      } else {
        for (const ch of CHANNELS) row[ch.key] = false;
      }
      return { ...prev, [type.key]: row };
    });
    setDirty(true);
  };

  const mutateCategory = (types: NotificationTypeDef[], value: boolean) => {
    setDraftMatrix(prev => {
      const next = { ...prev };
      for (const t of types) {
        const row: Record<string, boolean> = { ...(next[t.key] || {}) };
        if (value) {
          const def = t.defaults || { sidebar: true, bell: true };
          for (const ch of CHANNELS) row[ch.key] = !!def[ch.key];
        } else {
          for (const ch of CHANNELS) row[ch.key] = false;
        }
        next[t.key] = row;
      }
      return next;
    });
    setDirty(true);
  };

  const mutateMaster = (channel: NotificationChannel, value: boolean) => {
    setDraftChannels(prev => ({ ...prev, [masterChannelKey(channel)]: value }));
    setDirty(true);
  };

  const applyPreset = (preset: Preset) => {
    if (preset === 'custom') return;
    const built = buildPresetMatrix(preset, visibleTypes);
    setDraftMatrix(built.matrix);
    setDraftChannels(built.channels);
    setDirty(true);
    toast.message(`Preset applied: ${PRESETS.find(p => p.key === preset)?.label}`, {
      description: 'Review and Save to apply.',
    });
  };

  const handleSave = async () => {
    const res = await save({
      notification_matrix: draftMatrix,
      channels: draftChannels,
      snoozed_until: draftSnoozed,
    });
    if (res.error) toast.error(res.error);
    else {
      toast.success('Notification preferences saved');
      setDirty(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    const res = await resetToDefaults();
    setResetting(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success('Reset to recommended defaults');
      setDirty(false);
    }
  };

  const handleDiscard = () => {
    setDraftMatrix(prefs.notification_matrix);
    setDraftChannels(prefs.channels);
    setDraftSnoozed(prefs.snoozed_until);
    setDirty(false);
  };

  // ── Snooze (persists immediately — no "unsaved" state for snoozes) ──
  const isSnoozed = (typeKey: string) => {
    const iso = draftSnoozed?.[typeKey];
    return !!iso && new Date(iso).getTime() > Date.now();
  };

  const doSnooze = async (typeKey: string, hours: number) => {
    const iso = new Date(Date.now() + hours * 3600_000).toISOString();
    setDraftSnoozed(prev => ({ ...prev, [typeKey]: iso }));
    const r = await snoozeType(typeKey, hours);
    if (r.error) toast.error(r.error);
    else toast.success(`Snoozed for ${hours}h`);
  };

  const doUnsnooze = async (typeKey: string) => {
    setDraftSnoozed(prev => ({ ...prev, [typeKey]: new Date(0).toISOString() }));
    const r = await clearSnooze(typeKey);
    if (r.error) toast.error(r.error);
    else toast.success('Snooze cleared');
  };

  // Totals for summary
  const enabledTypes = useMemo(
    () =>
      visibleTypes.filter(t =>
        typeHasAnyChannelOn(t, draftMatrix, draftChannels)
      ).length,
    [visibleTypes, draftMatrix, draftChannels]
  );
  const enabledMasterChannels = activeMasterChannelCount(draftChannels);

  return (
    <TooltipProvider delayDuration={100}>
      <Card className="mb-6 pb-24 md:pb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Notification Center
          </CardTitle>
          <CardDescription>
            Choose a setup, then customize any event. Turning things off never
            deletes data.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ── Preset picker ─────────────────────────────────────────── */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Notification setup
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {PRESETS.map(p => {
                const active = currentPreset === p.key;
                const isCustom = p.key === 'custom';
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    disabled={isCustom}
                    className={cn(
                      'text-left rounded-lg border p-3 transition min-h-[76px]',
                      'focus:outline-none focus:ring-2 focus:ring-primary/40',
                      active
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                        : 'border-border bg-background hover:bg-muted/40',
                      isCustom && 'cursor-default opacity-90'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{p.label}</span>
                      {active && <Check className="w-4 h-4 text-primary" />}
                      {p.key === 'balanced' && !active && (
                        <Badge variant="secondary" className="text-[10px]">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Summary ─────────────────────────────────────────────── */}
          <div className="text-sm text-muted-foreground rounded-md bg-muted/40 border px-3 py-2">
            <strong className="text-foreground">{enabledTypes}</strong> notifications
            enabled across{' '}
            <strong className="text-foreground">{enabledMasterChannels}</strong>{' '}
            of {CHANNELS.length} delivery channels.
          </div>

          {/* ── Delivery channels (collapsible master toggles) ─────── */}
          <Collapsible open={channelsOpen} onOpenChange={setChannelsOpen}>
            <div className="rounded-lg border bg-muted/20">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold">Delivery channels</div>
                    <div className="text-xs text-muted-foreground">
                      Turning off a channel disables that delivery method for all
                      notifications. It does not delete notification data.
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-muted-foreground transition-transform',
                      channelsOpen && 'rotate-180'
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 px-4 pb-4">
                  {CHANNELS.map(ch => {
                    const Icon = CHANNEL_ICON[ch.key];
                    const on = isMasterChannelOn(ch.key, draftChannels);
                    return (
                      <label
                        key={ch.key}
                        className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-3 min-h-[52px] cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm">{ch.label}</span>
                        </div>
                        <Switch
                          checked={on}
                          onCheckedChange={v => mutateMaster(ch.key, v)}
                          aria-label={`Master toggle — ${ch.label}`}
                        />
                      </label>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* ── Category accordions ─────────────────────────────────── */}
          <Accordion
            type="multiple"
            value={openCategories}
            onValueChange={setOpenCategories}
            className="space-y-2"
          >
            {grouped.map(([category, types]) => {
              const totalOn = types.filter(t =>
                typeHasAnyChannelOn(t, draftMatrix, draftChannels)
              ).length;
              const allOn = totalOn === types.length;

              return (
                <AccordionItem
                  key={category}
                  value={category}
                  className="border rounded-lg bg-card overflow-hidden"
                >
                  <div className="flex items-center gap-2 pr-3">
                    <AccordionTrigger className="flex-1 px-4 py-3 hover:no-underline">
                      <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-semibold">{category}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          {totalOn} of {types.length} active
                        </span>
                      </div>
                    </AccordionTrigger>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          onClick={e => e.stopPropagation()}
                          className="shrink-0"
                        >
                          <Switch
                            checked={allOn}
                            onCheckedChange={v => mutateCategory(types, v)}
                            aria-label={`Enable all ${category}`}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Enable all in this category</TooltipContent>
                    </Tooltip>
                  </div>

                  <AccordionContent className="pb-2">
                    <div className="divide-y border-t">
                      {types.map(t => {
                        const snoozed = isSnoozed(t.key);
                        const notifyOn = typeHasAnyChannelOn(
                          t,
                          draftMatrix,
                          draftChannels
                        );
                        const activeCount = activeChannelCountForType(
                          t,
                          draftMatrix,
                          draftChannels
                        );
                        return (
                          <div
                            key={t.key}
                            className="flex items-center gap-2 px-4 py-3 min-h-[56px]"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{t.label}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {snoozed && (
                                  <Badge
                                    variant="secondary"
                                    className="gap-1 text-[10px]"
                                  >
                                    <Clock className="w-3 h-3" />
                                    Snoozed
                                  </Badge>
                                )}
                                <span className="text-[11px] text-muted-foreground truncate">
                                  {activeCount === 0
                                    ? 'No channels'
                                    : `${activeCount} channel${activeCount === 1 ? '' : 's'}`}
                                </span>
                              </div>
                            </div>

                            <Switch
                              checked={notifyOn}
                              disabled={snoozed}
                              onCheckedChange={v => mutateType(t, v)}
                              aria-label={`Notify me — ${t.label}`}
                            />

                            {/* Channels button — popover on desktop, sheet on mobile */}
                            {isMobile ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 gap-1.5"
                                onClick={() => setMobileEditType(t)}
                                disabled={!notifyOn}
                              >
                                <Settings2 className="w-3.5 h-3.5" />
                                <span className="text-xs">{activeCount}</span>
                              </Button>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 gap-1.5"
                                    disabled={!notifyOn}
                                  >
                                    <Settings2 className="w-3.5 h-3.5" />
                                    <span className="text-xs">
                                      Channels · {activeCount}
                                    </span>
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72" align="end">
                                  <ChannelEditor
                                    type={t}
                                    matrix={draftMatrix}
                                    channels={draftChannels}
                                    snoozed={draftSnoozed}
                                    onChange={mutateChannel}
                                  />
                                </PopoverContent>
                              </Popover>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  aria-label="More"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {snoozed ? (
                                  <DropdownMenuItem onClick={() => doUnsnooze(t.key)}>
                                    Un-snooze
                                  </DropdownMenuItem>
                                ) : (
                                  <>
                                    <DropdownMenuItem onClick={() => doSnooze(t.key, 1)}>
                                      Snooze 1 hour
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => doSnooze(t.key, 24)}>
                                      Snooze 24 hours
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => doSnooze(t.key, 24 * 7)}>
                                      Snooze 1 week
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* ── Sticky action bar ───────────────────────────────────── */}
      <div
        className={cn(
          'fixed bottom-0 inset-x-0 z-[60] border-t bg-background/95 backdrop-blur',
          'px-4 py-3 md:px-6',
          'flex items-center justify-between gap-3',
          // safe-area + clear the mobile bottom nav (~64px) on small screens
          'pb-[calc(env(safe-area-inset-bottom)+12px)]',
          'mb-[calc(64px+env(safe-area-inset-bottom))] md:mb-0'
        )}
      >
        <div className="text-sm min-w-0">
          {dirty ? (
            <span className="inline-flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Unsaved changes
            </span>
          ) : (
            <span className="text-muted-foreground hidden sm:inline">
              All changes saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={resetting || saving}
            className="gap-2"
          >
            {resetting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Reset to defaults</span>
            <span className="sm:hidden">Reset</span>
          </Button>
          {dirty && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              disabled={saving}
            >
              Discard
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="gap-2 min-w-[110px]"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>

      {/* ── Mobile bottom sheet for channel editing ───────────────── */}
      <Sheet
        open={!!mobileEditType}
        onOpenChange={o => !o && setMobileEditType(null)}
      >
        <SheetContent
          side="bottom"
          className="pb-[calc(env(safe-area-inset-bottom)+16px)] max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader className="text-left">
            <SheetTitle>{mobileEditType?.label}</SheetTitle>
            <SheetDescription>Choose where you're notified.</SheetDescription>
          </SheetHeader>
          {mobileEditType && (
            <div className="mt-4">
              <ChannelEditor
                type={mobileEditType}
                matrix={draftMatrix}
                channels={draftChannels}
                snoozed={draftSnoozed}
                onChange={mutateChannel}
                dense
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

interface ChannelEditorProps {
  type: NotificationTypeDef;
  matrix: ChannelMatrix;
  channels: PrefFlags;
  snoozed: SnoozeMap;
  onChange: (typeKey: string, channel: NotificationChannel, value: boolean) => void;
  dense?: boolean;
}

function ChannelEditor({ type, matrix, channels, snoozed, onChange, dense }: ChannelEditorProps) {
  return (
    <div className="space-y-1">
      {CHANNELS.map(ch => {
        const Icon = CHANNEL_ICON[ch.key];
        const masterOn = isMasterChannelOn(ch.key, channels);
        const on = isChannelEnabled(type.key, ch.key, matrix, snoozed, channels);
        return (
          <label
            key={ch.key}
            className={cn(
              'flex items-center justify-between gap-3 rounded-md px-2 cursor-pointer',
              dense ? 'py-3 min-h-[48px]' : 'py-2 min-h-[44px]',
              !masterOn && 'opacity-60'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-sm">{ch.label}</div>
                {!masterOn && (
                  <div className="text-[10px] text-muted-foreground">
                    Channel disabled globally
                  </div>
                )}
              </div>
            </div>
            <Switch
              checked={on}
              disabled={!masterOn}
              onCheckedChange={v => onChange(type.key, ch.key, v)}
              aria-label={`${type.label} — ${ch.label}`}
            />
          </label>
        );
      })}
    </div>
  );
}

// Prevent unused-import warnings while keeping public exports stable.
void SIDEBAR_DEFAULTS;
void BELL_DEFAULTS;
void CHANNEL_DEFAULTS;
