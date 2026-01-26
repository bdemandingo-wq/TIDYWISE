import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Flame, Clock, TrendingUp, Phone, Mail, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LeadScoreCardProps {
  leadId: string;
  compact?: boolean;
}

export function LeadScoreCard({ leadId, compact = false }: LeadScoreCardProps) {
  const { data: intelligence, isLoading } = useQuery({
    queryKey: ['lead-intelligence-single', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_intelligence')
        .select('*')
        .eq('lead_id', leadId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading || !intelligence) {
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
  };

  const getContactIcon = (method: string) => {
    switch (method) {
      case 'call': return <Phone className="h-3 w-3" />;
      case 'sms': return <MessageSquare className="h-3 w-3" />;
      default: return <Mail className="h-3 w-3" />;
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-2">
          {intelligence.is_hot_lead && (
            <Tooltip>
              <TooltipTrigger>
                <Badge className="bg-orange-500 gap-1 px-1.5">
                  <Flame className="h-3 w-3" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Hot Lead - {intelligence.conversion_score}% conversion score</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          <Tooltip>
            <TooltipTrigger>
              <div className={`text-xs font-medium px-2 py-0.5 rounded ${getScoreColor(intelligence.conversion_score)}`}>
                {intelligence.conversion_score}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>AI Conversion Score</p>
              <p className="text-xs text-muted-foreground">{intelligence.predicted_conversion_rate}% likely to convert</p>
            </TooltipContent>
          </Tooltip>

          {intelligence.recommended_followup_time && new Date(intelligence.recommended_followup_time) <= new Date() && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="gap-1 text-xs border-blue-300 text-blue-600">
                  <Clock className="h-3 w-3" />
                  Now
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Follow up recommended now via {intelligence.preferred_contact_method}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">AI Lead Score</span>
          {intelligence.is_hot_lead && (
            <Badge className="bg-orange-500 gap-1">
              <Flame className="h-3 w-3" />
              Hot
            </Badge>
          )}
        </div>
        <div className={`text-lg font-bold px-3 py-1 rounded-full ${getScoreColor(intelligence.conversion_score)}`}>
          {intelligence.conversion_score}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 rounded bg-muted/50">
          <p className="text-xs text-muted-foreground">Conversion</p>
          <p className="font-medium">{intelligence.predicted_conversion_rate}%</p>
        </div>
        <div className="text-center p-2 rounded bg-muted/50">
          <p className="text-xs text-muted-foreground">Urgency</p>
          <p className="font-medium">{intelligence.urgency_score}</p>
        </div>
        <div className="text-center p-2 rounded bg-muted/50">
          <p className="text-xs text-muted-foreground">Engagement</p>
          <p className="font-medium">{intelligence.engagement_score}</p>
        </div>
      </div>

      {intelligence.recommended_followup_time && (
        <div className="flex items-center justify-between p-2 rounded bg-blue-50 dark:bg-blue-950/30 text-sm">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Clock className="h-4 w-4" />
            <span>Follow up {formatDistanceToNow(new Date(intelligence.recommended_followup_time), { addSuffix: true })}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600">
            {getContactIcon(intelligence.preferred_contact_method)}
            <span className="capitalize text-xs">{intelligence.preferred_contact_method}</span>
          </div>
        </div>
      )}

      {intelligence.ai_insights && 
       typeof intelligence.ai_insights === 'object' && 
       !Array.isArray(intelligence.ai_insights) &&
       'action_items' in intelligence.ai_insights &&
       Array.isArray((intelligence.ai_insights as Record<string, unknown>).action_items) &&
       ((intelligence.ai_insights as Record<string, unknown>).action_items as string[]).length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-1">AI Recommendations:</p>
          {((intelligence.ai_insights as Record<string, unknown>).action_items as string[]).map((item: string, i: number) => (
            <p key={i} className="text-xs text-primary flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {item}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
