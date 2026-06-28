import { useState } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ConvSummary { name: string; lastMessage: string; hoursSinceLastInbound: number }

interface Props {
  organizationId: string;
  getNeedsReplyConversations: () => ConvSummary[];
}

export function AIInboxSummaryButton({ organizationId, getNeedsReplyConversations }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string>('');

  const run = async () => {
    setLoading(true);
    setOpen(true);
    setSummary('');
    try {
      const items = getNeedsReplyConversations();
      const { data, error } = await supabase.functions.invoke('ai-message-assist', {
        body: { mode: 'inbox_summary', organizationId, unreadConversations: items },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSummary(data?.summary || 'No summary available.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate summary';
      toast.error(msg);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => void run()}
        className="h-8 gap-1.5 text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">AI Summary</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Inbox summary
            </DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Analyzing your inbox...</span>
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">{summary}</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
