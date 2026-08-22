import { useMemo, useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, Clock, MessageCircle, Ban, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ConvSummary { name: string; lastMessage: string; hoursSinceLastInbound: number }

interface Props {
  organizationId: string;
  getNeedsReplyConversations: () => ConvSummary[];
  /** 'button' (default) — small ghost text button, used on desktop.
   *  'icon' — bare sparkle icon, for the mobile navy header.
   *  'card' — the full inbox-summary card inline in the mobile list (comp 8d). */
  variant?: 'button' | 'icon' | 'card';
}

interface SectionItem {
  name: string;
  detail: string;
  wait?: string;
}
interface Section {
  key: 'urgent' | 'waiting' | 'low' | 'spam';
  title: string;
  items: SectionItem[];
}

const SECTION_META: Record<Section['key'], { title: string; icon: any; tone: string; badge: string }> = {
  urgent: { title: 'Urgent / Action Required', icon: AlertTriangle, tone: 'text-red-600', badge: 'destructive' },
  waiting: { title: 'Waiting Longest', icon: Clock, tone: 'text-amber-600', badge: 'secondary' },
  low: { title: 'Low Priority', icon: MessageCircle, tone: 'text-blue-600', badge: 'outline' },
  spam: { title: 'Likely Spam / Ignore', icon: Ban, tone: 'text-muted-foreground', badge: 'outline' },
};

/** Best-effort parse of the AI markdown into sections. Falls back to a single
 * bucket if the LLM ignored the section format. */
function parseSummary(raw: string): { sections: Section[]; recommendation: string | null } {
  const clean = raw.replace(/\r/g, '');
  const lines = clean.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;
  let recommendation: string | null = null;

  const sectionOf = (h: string): Section['key'] | null => {
    const s = h.toLowerCase();
    if (/urgent|action/.test(s)) return 'urgent';
    if (/wait|longest|oldest/.test(s)) return 'waiting';
    if (/low|later/.test(s)) return 'low';
    if (/spam|ignore/.test(s)) return 'spam';
    if (/recommend|reply first|top pick/.test(s)) return null;
    return null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const headerMatch = line.match(/^(#{1,3}|\*\*)\s*(.+?)(\*\*)?\s*:?$/);
    if (headerMatch) {
      const title = headerMatch[2].replace(/\*/g, '').trim();
      if (/recommend|reply first|top pick/i.test(title)) {
        current = null;
        continue;
      }
      const key = sectionOf(title);
      if (key) {
        current = { key, title: SECTION_META[key].title, items: [] };
        sections.push(current);
        continue;
      }
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      const body = bullet[1].replace(/\*\*/g, '').trim();
      const nameMatch = body.match(/^([^:—-]+)[:—-]\s*(.+)$/);
      const item: SectionItem = nameMatch
        ? { name: nameMatch[1].trim(), detail: nameMatch[2].trim() }
        : { name: 'Conversation', detail: body };
      const waitMatch = body.match(/(\d+\s*(?:h|hr|hour|d|day)s?)/i);
      if (waitMatch) item.wait = waitMatch[1];
      if (current) current.items.push(item);
      else if (!recommendation) recommendation = body;
      continue;
    }
    if (!current && !recommendation && line.length > 6) {
      recommendation = line.replace(/\*\*/g, '');
    }
  }

  if (sections.length === 0 && clean.trim()) {
    sections.push({ key: 'urgent', title: SECTION_META.urgent.title, items: [{ name: 'Summary', detail: clean.trim() }] });
  }
  return { sections, recommendation };
}

export function AIInboxSummaryButton({ organizationId, getNeedsReplyConversations, variant = 'button' }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false);

  const parsed = useMemo(() => parseSummary(summary), [summary]);

  const run = async () => {
    setLoading(true);
    setOpen(true);
    setSummary('');
    setShowRaw(false);
    try {
      const items = getNeedsReplyConversations();
      const { data, error } = await supabase.functions.invoke('ai-message-assist', {
        body: { mode: 'inbox_summary', organizationId, unreadConversations: items },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSummary(data?.summary || 'No summary available.');
    } catch (e) {
      const { handlePossibleAiCreditError } = await import('@/components/ai-credits/AiCreditLimitModal');
      const handled = await handlePossibleAiCreditError(e);
      if (!handled) {
        const msg = e instanceof Error ? e.message : 'Failed to generate summary';
        toast.error(msg);
      }
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const urgentCount = parsed.sections.find(s => s.key === 'urgent')?.items.length ?? 0;

  const trigger = variant === 'icon' ? (
    <button
      type="button"
      onClick={() => void run()}
      aria-label="AI inbox summary"
      className="h-[34px] w-[34px] rounded-[10px] bg-white/10 flex items-center justify-center text-white"
    >
      <Sparkles className="h-4 w-4" />
    </button>
  ) : variant === 'card' ? (
    <button
      type="button"
      onClick={() => void run()}
      className="w-full text-left bg-[hsl(var(--pv-surface))] border border-[hsl(var(--pv-border))] rounded-2xl px-[18px] py-4"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--pv-ai))]" />
        <span className="text-[13.5px] font-extrabold text-[hsl(var(--pv-ink))]">AI inbox summary</span>
        {urgentCount > 0 && (
          <span className="ml-auto text-[10px] font-bold text-[hsl(var(--pv-danger))] bg-[hsl(var(--pv-danger-soft))] px-2.5 py-1 rounded-full">
            {urgentCount} urgent
          </span>
        )}
      </div>
      <p className="text-xs text-[hsl(var(--pv-ink-3))] leading-relaxed mt-2">
        {loading
          ? 'Analyzing your inbox…'
          : parsed.recommendation || 'Tap to see which conversations need a reply first.'}
      </p>
    </button>
  ) : (
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
  );

  return (
    <>
      {trigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Inbox summary
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Analyzing your inbox...</span>
              </div>
            ) : (
              <>
                {parsed.recommendation && (
                  <Card className="border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
                            Reply first
                          </div>
                          <div className="text-sm leading-relaxed">{parsed.recommendation}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {parsed.sections.map((section) => {
                  const meta = SECTION_META[section.key];
                  const Icon = meta.icon;
                  if (section.items.length === 0) return null;
                  return (
                    <section key={section.key}>
                      <div className={`flex items-center gap-2 mb-2 ${meta.tone}`}>
                        <Icon className="h-4 w-4" />
                        <h3 className="text-sm font-semibold">{section.title}</h3>
                        <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                          {section.items.length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {section.items.map((item, i) => (
                          <Card key={i} className="border-border/60">
                            <CardContent className="p-3 flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium truncate">{item.name}</span>
                                  {item.wait && (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                      {item.wait}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                                  {item.detail}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </section>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setShowRaw((s) => !s)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
                  {showRaw ? 'Hide' : 'Show'} raw AI output
                </button>
                {showRaw && (
                  <pre className="text-xs whitespace-pre-wrap leading-relaxed text-muted-foreground bg-muted/40 rounded-md p-3 border">
                    {summary}
                  </pre>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
