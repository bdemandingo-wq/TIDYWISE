import { useState } from 'react';
import { Sparkles, Loader2, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface Suggestion { label: string; text: string }

interface Props {
  organizationId: string;
  conversationId: string;
  onPick: (text: string) => void;
}

export function AISuggestReplyButton({ organizationId, conversationId, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-message-assist', {
        body: { mode: 'suggest_reply', organizationId, conversationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestions(data?.suggestions || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to get suggestions';
      toast.error(msg);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && suggestions.length === 0) void fetchSuggestions();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0 text-indigo-500 hover:bg-indigo-500/10"
          aria-label="AI suggested replies"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> AI suggestions
          </p>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void fetchSuggestions()} disabled={loading} aria-label="Regenerate">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Thinking...</span>
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No suggestions available.</p>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onPick(s.text); setOpen(false); }}
                className="w-full text-left rounded-lg border border-border bg-background px-3 py-2 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500 mb-0.5">{s.label}</p>
                <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">{s.text}</p>
              </button>
            ))}
            <p className="text-[10px] text-muted-foreground text-center pt-1">Tap to use • AI-generated, review before sending</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
