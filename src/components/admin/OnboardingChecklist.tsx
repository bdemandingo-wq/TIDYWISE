import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Check, ChevronRight } from 'lucide-react';
import { useOnboardingChecklist } from '@/hooks/useOnboardingChecklist';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const HIDE_CHECKLIST_EMAILS = ['support@tidywisecleaning.com', 'applereview@tidywise.com'];

export function OnboardingChecklist() {
  const { data: items = [], isLoading } = useOnboardingChecklist();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Hide for owner/free accounts
  if (user?.email && HIDE_CHECKLIST_EMAILS.includes(user.email.toLowerCase())) return null;

  if (isLoading || items.length === 0) return null;

  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length;
  const allComplete = completedCount === totalCount;

  // Hide once all complete
  if (allComplete) return null;

  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          🚀 Complete your setup
          <span className="text-sm font-normal text-muted-foreground ml-auto">
            {completedCount}/{totalCount} complete
          </span>
        </CardTitle>
        <Progress value={progressPercent} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => navigate(item.link)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
              item.completed
                ? 'bg-primary/5 opacity-60'
                : 'hover:bg-accent cursor-pointer'
            )}
          >
            <span className="text-xl flex-shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-medium',
                item.completed && 'line-through text-muted-foreground'
              )}>
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {item.description}
              </p>
            </div>
            {item.completed ? (
              <Check className="w-5 h-5 text-primary flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
