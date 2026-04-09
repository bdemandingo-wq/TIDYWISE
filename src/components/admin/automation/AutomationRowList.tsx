import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Star, Clock, RotateCcw, Repeat, UserX, PhoneMissed, Bot, type LucideIcon,
} from 'lucide-react';

export interface AutomationRow {
  id: string;
  automation_type: string;
  is_enabled: boolean;
}

const automationMeta: Record<string, {
  icon: LucideIcon;
  description: string;
  color: string;
  bgColor: string;
}> = {
  review_request: {
    icon: Star,
    description: 'Fires 30 min after booking marked complete — sends review request SMS to the client.',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  appointment_reminder: {
    icon: Clock,
    description: 'Fires 24 hrs before scheduled booking — sends reminder SMS to client and/or cleaner.',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  rebooking_reminder: {
    icon: RotateCcw,
    description: 'Fires 28 days after completed job with no future booking — sends rebooking nudge.',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  recurring_upsell: {
    icon: Repeat,
    description: 'Fires 2 hrs after completion — offers recurring service plan to one-time clients.',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  winback_60day: {
    icon: UserX,
    description: 'Fires when a customer is inactive 60+ days — sends a win-back re-engagement message.',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  missed_call_textback: {
    icon: PhoneMissed,
    description: 'Fires on missed inbound call — instantly texts caller that you\'ll follow up soon.',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  ai_sms_reply: {
    icon: Bot,
    description: 'Fires on incoming SMS — AI reads past messages & calls, then replies in your style 24/7.',
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
  },
};

function formatName(type: string) {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace('60day', '(60 Days)');
}

interface AutomationRowListProps {
  automations: AutomationRow[];
  isLoading: boolean;
  onToggle: (id: string, enabled: boolean) => void;
}

export function AutomationRowList({ automations, isLoading, onToggle }: AutomationRowListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl border bg-card">
            <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="w-10 h-5 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {automations.map((auto) => {
        const meta = automationMeta[auto.automation_type];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <div
            key={auto.id}
            className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors"
          >
            {/* Icon */}
            <div className={`p-2.5 rounded-lg flex-shrink-0 ${meta.bgColor}`}>
              <Icon className={`w-5 h-5 ${meta.color}`} />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground">
                  {formatName(auto.automation_type)}
                </span>
                <Badge
                  variant={auto.is_enabled ? 'default' : 'secondary'}
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  {auto.is_enabled ? 'Active' : 'Off'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {meta.description}
              </p>
            </div>

            {/* Toggle */}
            <Switch
              checked={auto.is_enabled}
              onCheckedChange={(checked) => onToggle(auto.id, checked)}
              className="flex-shrink-0"
            />
          </div>
        );
      })}
    </div>
  );
}
