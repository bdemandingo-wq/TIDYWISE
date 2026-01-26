import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Crown, TrendingUp, Calendar, DollarSign } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';

interface CustomerChurnIndicatorProps {
  customerId: string;
  compact?: boolean;
}

export function CustomerChurnIndicator({ customerId, compact = false }: CustomerChurnIndicatorProps) {
  const { data: intelligence, isLoading } = useQuery({
    queryKey: ['customer-intelligence-single', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_intelligence')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !intelligence) {
    return null;
  }

  const getChurnBadge = (level: string) => {
    switch (level) {
      case 'critical':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Critical Risk
          </Badge>
        );
      case 'high':
        return (
          <Badge className="bg-orange-500 gap-1">
            <AlertTriangle className="h-3 w-3" />
            High Risk
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="secondary" className="gap-1">
            Medium Risk
          </Badge>
        );
      default:
        return null;
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-2">
          {intelligence.is_vip && (
            <Tooltip>
              <TooltipTrigger>
                <Badge className="bg-purple-500 gap-1 px-1.5">
                  <Crown className="h-3 w-3" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>VIP Customer - {intelligence.vip_reason}</p>
                <p className="text-xs">LTV: ${intelligence.predicted_lifetime_value?.toLocaleString()}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {(intelligence.churn_risk_level === 'critical' || intelligence.churn_risk_level === 'high') && (
            <Tooltip>
              <TooltipTrigger>
                {getChurnBadge(intelligence.churn_risk_level)}
              </TooltipTrigger>
              <TooltipContent>
                <p>{intelligence.days_since_last_contact} days since last contact</p>
                <p className="text-xs">{intelligence.next_booking_probability}% chance of rebooking</p>
              </TooltipContent>
            </Tooltip>
          )}

          {intelligence.upsell_potential_score >= 60 && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="gap-1 text-xs border-green-300 text-green-600">
                  <TrendingUp className="h-3 w-3" />
                  Upsell
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>High upsell potential</p>
                {Array.isArray(intelligence.recommended_services) && 
                  intelligence.recommended_services.slice(0, 2).map((s: any) => (
                    <p key={s.id} className="text-xs">• {s.name}</p>
                  ))}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="p-3 rounded-lg border bg-card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Customer Intelligence</span>
        <div className="flex items-center gap-2">
          {intelligence.is_vip && (
            <Badge className="bg-purple-500 gap-1">
              <Crown className="h-3 w-3" />
              VIP
            </Badge>
          )}
          {getChurnBadge(intelligence.churn_risk_level)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-2 rounded bg-muted/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <DollarSign className="h-3 w-3" />
            Predicted LTV
          </div>
          <p className="font-bold text-green-600">${intelligence.predicted_lifetime_value?.toLocaleString()}</p>
        </div>

        <div className="p-2 rounded bg-muted/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3 w-3" />
            Rebooking Chance
          </div>
          <p className="font-bold">{intelligence.next_booking_probability}%</p>
        </div>

        <div className="p-2 rounded bg-muted/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Calendar className="h-3 w-3" />
            Next Booking
          </div>
          <p className="font-medium text-sm">
            {intelligence.predicted_next_booking_date 
              ? format(new Date(intelligence.predicted_next_booking_date), 'MMM d')
              : '-'}
          </p>
        </div>

        <div className="p-2 rounded bg-muted/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <AlertTriangle className="h-3 w-3" />
            Days Inactive
          </div>
          <p className="font-medium text-sm">{intelligence.days_since_last_contact}</p>
        </div>
      </div>

      {Array.isArray(intelligence.recommended_services) && intelligence.recommended_services.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-2">Upsell Opportunities:</p>
          <div className="flex flex-wrap gap-1">
            {intelligence.recommended_services.slice(0, 3).map((service: any) => (
              <Badge key={service.id} variant="outline" className="text-xs">
                {service.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {intelligence.vip_reason && (
        <div className="p-2 rounded bg-primary/10 text-sm text-primary">
          <Crown className="h-4 w-4 inline mr-1" />
          {intelligence.vip_reason}
        </div>
      )}
    </div>
  );
}
