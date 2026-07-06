import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOrgId } from "@/hooks/useOrgId";
import { useAiCreditStatus } from "@/hooks/useAiCreditStatus";
import { BuyAiCreditsButton } from "@/components/ai-credits/BuyAiCreditsButton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface Props {
  compact?: boolean;
  showBuy?: boolean;
}

/**
 * Small chip showing "AI credits: X left today". Purchased balance shown
 * separately when > 0. Drop into Copilot header and AI Intelligence page.
 */
export function AiCreditsMeter({ compact = false, showBuy = true }: Props) {
  const { organizationId } = useOrgId();
  const { data: status, isLoading } = useAiCreditStatus(organizationId);

  if (isLoading || !status) return null;

  const remaining = Math.max(0, status.daily_limit - status.used_today);
  const purchased = status.purchased_balance;
  const isLow = remaining <= 3 && purchased === 0;

  const label = compact
    ? `${remaining} left`
    : `${remaining} AI credits left today`;

  return (
    <TooltipProvider>
      <div className="inline-flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={isLow ? "destructive" : "secondary"}
              className="gap-1.5 font-medium"
            >
              <Sparkles className="h-3 w-3" />
              {label}
              {purchased > 0 && (
                <span className="ml-1 opacity-80">· +{purchased} bought</span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            <div className="space-y-1">
              <div>
                <b>{status.used_today} / {status.daily_limit}</b> daily free AI actions used
              </div>
              {purchased > 0 && (
                <div><b>{purchased}</b> purchased credits available (never expire)</div>
              )}
              <div className="text-muted-foreground">
                Plan: <span className="capitalize">{status.plan_tier}</span> · Resets at midnight UTC
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
        {showBuy && isLow && (
          <BuyAiCreditsButton size="sm" variant="outline" />
        )}
      </div>
    </TooltipProvider>
  );
}
