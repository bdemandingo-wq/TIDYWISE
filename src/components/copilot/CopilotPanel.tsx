import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useCopilot, type CopilotMessage } from '@/hooks/useCopilot';

const SUGGESTED_PROMPTS = [
  'How do I add my first booking?',
  'How does the recurring booking discount work?',
  'Walk me through getting paid via Stripe',
];

export function CopilotPanel() {
  const {
    isOpen,
    close,
    messages,
    isLoading,
    error,
    sendMessage,
    retryLastMessage,
    clearError,
  } = useCopilot();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Autoscroll to the bottom whenever new content arrives.
  useEffect(() => {
    if (!isOpen) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [isOpen, messages.length, isLoading, error]);

  // Focus the textarea when the panel opens.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || isLoading) return;
    setDraft('');
    if (error) clearError();
    await sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleSuggestion = (text: string) => {
    if (isLoading) return;
    setDraft('');
    void sendMessage(text);
  };

  return (
    <div
      role="dialog"
      aria-label="Tidy chat"
      className={cn(
        'fixed z-[9998] bg-background flex flex-col',
        'animate-in fade-in-0 slide-in-from-bottom-4 duration-200',
        // Mobile: full-screen sheet
        'inset-0',
        // Desktop: floating card bottom-right above the bubble
        'md:inset-auto md:bottom-24 md:right-6 md:w-[400px] md:h-[600px]',
        'md:rounded-2xl md:shadow-2xl md:border',
      )}
    >
      <Header onClose={close} />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-muted/30"
      >
        {messages.length === 0 && !error ? (
          <EmptyState
            onSuggestion={handleSuggestion}
            disabled={isLoading}
          />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}

        {isLoading && <TypingIndicator />}

        {error && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <span>{error}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearError();
                void retryLastMessage();
              }}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try again
            </Button>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3"
      >
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Tidy anything…"
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || isLoading}
            aria-label="Send"
            className="shrink-0"
            style={{ backgroundColor: '#4f46e5' }}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b bg-background px-4 py-3 md:rounded-t-2xl">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: '#4f46e5' }}
      >
        <Sparkles className="w-4 h-4" strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Tidy</p>
        <p className="text-xs text-muted-foreground">Your TidyWise co-pilot</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onClose}
        aria-label="Close Tidy"
        className="shrink-0"
      >
        <X className="w-5 h-5" />
      </Button>
    </header>
  );
}

function EmptyState({
  onSuggestion,
  disabled,
}: {
  onSuggestion: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <div className="flex items-start gap-2 max-w-[85%]">
        <AssistantAvatar />
        <div className="rounded-2xl rounded-tl-sm bg-background border px-3.5 py-2.5 text-sm leading-relaxed">
          <p>
            Hey, I'm Tidy <span aria-hidden>👋</span>
          </p>
          <p className="mt-1.5 text-muted-foreground">
            I can help you set up your account, answer questions about TidyWise,
            or walk you through any feature. What can I help with?
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pl-10 w-full">
        {SUGGESTED_PROMPTS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onSuggestion(s)}
            className={cn(
              'text-left text-xs rounded-xl border bg-background px-3 py-2',
              'hover:bg-accent hover:border-foreground/20 transition-colors',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && <AssistantAvatar />}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'rounded-tr-sm text-white'
            : 'rounded-tl-sm bg-background border',
        )}
        style={isUser ? { backgroundColor: '#4f46e5' } : undefined}
      >
        {message.content}
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div
      aria-hidden
      className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
      style={{ backgroundColor: '#4f46e5' }}
    >
      <Sparkles className="w-4 h-4" strokeWidth={2.25} />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2">
      <AssistantAvatar />
      <div className="rounded-2xl rounded-tl-sm bg-background border px-4 py-3 inline-flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
