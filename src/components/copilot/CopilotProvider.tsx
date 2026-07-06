import {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrgId } from '@/hooks/useOrgId';

const OPEN_STATE_KEY = 'tidywise.copilot.isOpen';
const CONVERSATION_ID_KEY = 'tidywise.copilot.conversationId';
const HISTORY_LIMIT = 12;

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  isError?: boolean;
}

interface CopilotContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  messages: CopilotMessage[];
  isLoading: boolean;
  hasUnread: boolean;
  error: string | null;
  conversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  clearError: () => void;
  newChat: () => void;
}

export const CopilotContext = createContext<CopilotContextValue | null>(null);

interface CopilotProviderProps {
  children: ReactNode;
}

export function CopilotProvider({ children }: CopilotProviderProps) {
  const { user } = useAuth();
  const { organizationId } = useOrgId();

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OPEN_STATE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Conversation id is the thread key. Hydrate from localStorage on mount so
  // navigations / new tabs / hard refreshes resume the same thread instead of
  // starting fresh. Server is still the source of truth for messages.
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CONVERSATION_ID_KEY);
    } catch {
      return null;
    }
  });
  const lastUserMessage = useRef<string | null>(null);
  const historyLoadedFor = useRef<string | null>(null);

  // Persist open state across navigations.
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_STATE_KEY, isOpen ? '1' : '0');
    } catch {
      // ignore quota / private mode
    }
  }, [isOpen]);

  // Persist conversation id so a new mount (cross-tab, hard refresh) resumes
  // the same thread. Cleared when null (e.g., user explicitly resets).
  useEffect(() => {
    try {
      if (conversationId) {
        localStorage.setItem(CONVERSATION_ID_KEY, conversationId);
      } else {
        localStorage.removeItem(CONVERSATION_ID_KEY);
      }
    } catch {
      // ignore quota / private mode
    }
  }, [conversationId]);

  // Clear unread badge when the user opens the panel.
  useEffect(() => {
    if (isOpen && hasUnread) setHasUnread(false);
  }, [isOpen, hasUnread]);

  // Load conversation history on first mount per (user, org). Now that the
  // provider is hoisted to the app shell, this fires ONCE per session per
  // (user, org), not on every route change.
  //
  // Resolution order:
  //   1. If localStorage has a conversation_id, try to load that thread first
  //      (with user_id + organization_id RLS guards) so we resume cleanly.
  //   2. Otherwise, fall back to the latest conversation_id from the DB
  //      (filtered by user_id + organization_id) and load that.
  //
  // The generated Supabase types don't yet include copilot_conversations
  // (added in 20260505095823_copilot_phase_1.sql), so we route through an
  // untyped client until `npm run gen:types` regenerates them.
  useEffect(() => {
    if (!user?.id || !organizationId) return;
    const key = `${user.id}:${organizationId}`;
    if (historyLoadedFor.current === key) return;
    historyLoadedFor.current = key;

    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;

        // 1) Prefer the localStorage conversation_id when available.
        let targetConvId: string | null = conversationId;

        // 2) Fallback: ask the DB for the most recent conversation in this
        //    (user, org) scope. Ordered by created_at since the table is
        //    append-only and has no updated_at column.
        if (!targetConvId) {
          const { data: latest, error: latestErr } = await db
            .from('copilot_conversations')
            .select('conversation_id')
            .eq('user_id', user.id)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestErr) throw latestErr;
          targetConvId = latest?.conversation_id ?? null;
        }

        if (!targetConvId || cancelled) return;

        const { data: rows, error: rowsErr } = await db
          .from('copilot_conversations')
          .select('id, message_role, message_content, created_at')
          .eq('user_id', user.id)
          .eq('organization_id', organizationId)
          .eq('conversation_id', targetConvId)
          .order('created_at', { ascending: true })
          .limit(HISTORY_LIMIT);
        if (rowsErr) throw rowsErr;
        if (cancelled) return;

        const rawRows = (rows ?? []) as Array<{
          id: string;
          message_role: string;
          message_content: string;
          created_at: string;
        }>;
        const loaded: CopilotMessage[] = rawRows
          .filter((r) => r.message_role === 'user' || r.message_role === 'assistant')
          .map((r) => ({
            id: r.id,
            role: r.message_role as 'user' | 'assistant',
            content: r.message_content,
            createdAt: r.created_at,
          }));

        // The localStorage conversation_id might be stale (deleted, scoped to
        // a different org the user used to belong to). If we got 0 rows back,
        // re-resolve via the latest-from-DB fallback path on the next mount
        // by clearing the cached id.
        if (loaded.length === 0 && conversationId === targetConvId) {
          setConversationId(null);
          return;
        }

        setConversationId(targetConvId);
        setMessages(loaded);
      } catch (err) {
        // History load failures are non-fatal — just start fresh.
        console.warn('[copilot] Failed to load history:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // conversationId is intentionally NOT a dep — it's read once per
    // (user, org) hydration. Subsequent updates from sendMessage are written
    // by setConversationId without retriggering this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, organizationId]);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      if (!organizationId) {
        setError('No active organization. Try refreshing.');
        return;
      }

      lastUserMessage.current = text;
      const userMsg: CopilotMessage = {
        id: `local-${crypto.randomUUID()}`,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: invokeError } = await supabase.functions.invoke(
          'copilot-chat',
          {
            body: {
              organization_id: organizationId,
              conversation_id: conversationId,
              message: text,
              context: {
                current_page:
                  typeof window !== 'undefined'
                    ? window.location.pathname
                    : null,
              },
            },
          },
        );
        if (invokeError) throw invokeError;
        const payload = data as
          | { success?: boolean; error?: string; conversation_id?: string; response?: string }
          | null;
        if (!payload?.success) {
          throw new Error(payload?.error || 'Tidy hit a snag. Try again in a sec.');
        }
        if (!payload.response) {
          throw new Error('Tidy returned no response.');
        }

        if (payload.conversation_id && !conversationId) {
          setConversationId(payload.conversation_id);
        }
        const assistantMsg: CopilotMessage = {
          id: `local-${crypto.randomUUID()}`,
          role: 'assistant',
          content: payload.response,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        // Show unread indicator if the user replied while the panel was closed.
        setHasUnread((prevUnread) => (prevUnread || !isOpen));
      } catch (err) {
        // Detect and show the shared credit-limit modal for 402 responses.
        const { handlePossibleAiCreditError } = await import(
          '@/components/ai-credits/AiCreditLimitModal'
        );
        const wasCreditLimit = await handlePossibleAiCreditError(err);
        if (wasCreditLimit) {
          setMessages((prev) => prev.slice(0, -1)); // drop the optimistic user msg
          setError(null);
        } else {
          const msg =
            err instanceof Error
              ? err.message
              : 'Something went wrong. Try again in a sec.';
          const isNetwork =
            err instanceof TypeError && /fetch|network/i.test(msg);
          setError(
            isNetwork
              ? "Can't reach the server. Check your connection."
              : msg.includes('hit a snag')
                ? msg
                : 'Tidy hit a snag. Try again in a sec.',
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, isOpen, organizationId],
  );

  const newChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    lastUserMessage.current = null;
  }, []);

  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessage.current) return;
    // Drop the last user message we already optimistically added so we don't
    // double it up; sendMessage will re-add it.
    setMessages((prev) => {
      const lastIdx = [...prev].reverse().findIndex((m) => m.role === 'user');
      if (lastIdx === -1) return prev;
      const realIdx = prev.length - 1 - lastIdx;
      return prev.slice(0, realIdx);
    });
    await sendMessage(lastUserMessage.current);
  }, [sendMessage]);

  const value = useMemo<CopilotContextValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
      messages,
      isLoading,
      hasUnread,
      error,
      conversationId,
      sendMessage,
      retryLastMessage,
      clearError: () => setError(null),
      newChat,
    }),
    [
      isOpen,
      messages,
      isLoading,
      hasUnread,
      error,
      conversationId,
      sendMessage,
      retryLastMessage,
      newChat,
    ],
  );

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  );
}
