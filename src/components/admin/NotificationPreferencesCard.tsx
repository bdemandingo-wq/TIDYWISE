import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotificationPreferences';
import {
  NOTIFICATION_TYPES,
  CATEGORIES,
  CHANNELS,
  isChannelEnabled,
  isMasterChannelOn,
  masterChannelKey,
  type NotificationChannel,
} from '@/lib/notificationCatalog';
import { useOrgRole } from '@/hooks/useOrgRole';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const CHANNEL_ICON: Record<NotificationChannel, any> = {
  sidebar: LayoutGrid,
  bell: Bell,
  browser_push: Globe,
  native_push: Smartphone,
  email: Mail,
  sms: MessageSquare,
};

export function NotificationPreferencesCard() {
  const prefs = useNotificationPreferences();
  const { save, setChannel, snoozeType, clearSnooze, resetToDefaults, saving } =
    useUpdateNotificationPreferences();
  const { hasFinancialAccess } = useOrgRole();
  const [resetting, setResetting] = useState(false);

  const visibleTypes = useMemo(
    () => NOTIFICATION_TYPES.filter(t => !t.managerLocked || hasFinancialAccess),
    [hasFinancialAccess]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof NOTIFICATION_TYPES>();
    for (const c of CATEGORIES) map.set(c, [] as any);
    visibleTypes.forEach(t => map.get(t.category)?.push(t));
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [visibleTypes]);

  const handleToggle = async (
    typeKey: string,
    channel: NotificationChannel,
    value: boolean
  ) => {
    const res = await setChannel(typeKey, channel, value);
    if (res.error) toast.error(res.error);
  };

  const handleReset = async () => {
    setResetting(true);
    const res = await resetToDefaults();
    setResetting(false);
    if (res.error) toast.error(res.error);
    else toast.success('Reset to recommended defaults');
  };

  const isSnoozed = (typeKey: string) => {
    const iso = prefs.snoozed_until?.[typeKey];
    return !!iso && new Date(iso).getTime() > Date.now();
  };

  return (
    <TooltipProvider delayDuration={100}>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Notification Center
              </CardTitle>
              <CardDescription>
                Every notification type has an independent toggle for each delivery
                channel. Turning a channel off hides it — nothing is deleted.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={resetting || saving}
              className="gap-2 shrink-0"
            >
              {resetting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Reset to defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Master channel toggles — flip a channel off across every event. */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Master channels
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {CHANNELS.map(ch => {
                const Icon = CHANNEL_ICON[ch.key];
                const on = isMasterChannelOn(ch.key, prefs.channels);
                return (
                  <div key={ch.key} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm truncate">{ch.short}</span>
                    </div>
                    <Switch
                      checked={on}
                      disabled={saving}
                      onCheckedChange={async v => {
                        const r = await save({
                          channels: { [masterChannelKey(ch.key)]: v },
                        });
                        if (r.error) toast.error(r.error);
                      }}
                      aria-label={`Master toggle — ${ch.label}`}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Turning a master channel off silences it for every notification below,
              even ones toggled on individually.
            </p>
          </div>

          {grouped.map(([category, types]) => (
            <div key={category}>
              <div className="text-sm font-semibold mb-3 text-foreground/90">
                {category}
              </div>

              {/* Column headers (channels) */}
              <div className="hidden md:grid gap-2 items-center pb-2 border-b text-[10px] uppercase tracking-wide text-muted-foreground"
                   style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${CHANNELS.length}, 56px) 80px` }}>
                <div>Notification</div>
                {CHANNELS.map(ch => {
                  const Icon = CHANNEL_ICON[ch.key];
                  return (
                    <Tooltip key={ch.key}>
                      <TooltipTrigger asChild>
                        <div className="flex justify-center">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{ch.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
                <div className="text-right">Snooze</div>
              </div>

              <div className="divide-y">
                {types.map(t => {
                  const snoozed = isSnoozed(t.key);
                  return (
                    <div
                      key={t.key}
                      className="md:grid md:gap-2 md:items-center py-3"
                      style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${CHANNELS.length}, 56px) 80px` }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm truncate">{t.label}</span>
                        {snoozed && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Clock className="w-3 h-3" />
                            Snoozed
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 md:contents mt-2 md:mt-0">
                        {CHANNELS.map(ch => {
                          const on = isChannelEnabled(
                            t.key,
                            ch.key,
                            prefs.notification_matrix,
                            prefs.snoozed_until
                          );
                          const Icon = CHANNEL_ICON[ch.key];
                          return (
                            <div
                              key={ch.key}
                              className="flex items-center gap-1 md:justify-center"
                            >
                              <Icon className="w-3.5 h-3.5 text-muted-foreground md:hidden" />
                              <Switch
                                checked={on}
                                disabled={snoozed}
                                onCheckedChange={v => handleToggle(t.key, ch.key, v)}
                                aria-label={`${t.label} — ${ch.label}`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex md:justify-end mt-2 md:mt-0">
                        {snoozed ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={async () => {
                              const r = await clearSnooze(t.key);
                              if (r.error) toast.error(r.error);
                              else toast.success('Snooze cleared');
                            }}
                          >
                            Un-snooze
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={async () => {
                              const r = await snoozeType(t.key, 24);
                              if (r.error) toast.error(r.error);
                              else toast.success('Snoozed for 24 hours');
                            }}
                          >
                            24h
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
