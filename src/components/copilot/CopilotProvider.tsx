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
  const [conversationId, setConversationId] = useState<string | null>(null);
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

  // Clear unread badge when the user opens the panel.
  useEffect(() => {
    if (isOpen && hasUnread) setHasUnread(false);
  }, [isOpen, hasUnread]);

  // Load the most recent conversation from copilot_conversations on first
  // mount per (user, org). Keyed by `${userId}:${orgId}` so a context switch
  // re-fetches; the sentinel prevents redundant fetches across re-renders.
  //
  // The generated Supabase types don't yet include copilot_conversations
  // (table was just added in 20260505095823_copilot_phase_1.sql), so we route
  // through an untyped client until `npm run gen:types` regenerates them.
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
        const { data: latest, error: latestErr } = await db
          .from('copilot_conversations')
          .select('conversation_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestErr) throw latestErr;
        if (!latest?.conversation_id) return;
        if (cancelled) return;

        const { data: rows, error: rowsErr } = await db
          .from('copilot_conversations')
          .select('id, message_role, message_content, created_at')
          .eq('user_id', user.id)
          .eq('conversation_id', latest.conversation_id)
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

        setConversationId(latest.conversation_id as string);
        setMessages(loaded);
      } catch (err) {
        // History load failures are non-fatal — just start fresh.
        console.warn('[copilot] Failed to load history:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
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
        const msg =
          err instanceof Error
            ? err.message
            : 'Something went wrong. Try again in a sec.';
        // Distinguish network failures from server errors for better copy.
        const isNetwork =
          err instanceof TypeError && /fetch|network/i.test(msg);
        setError(
          isNetwork
            ? "Can't reach the server. Check your connection."
            : msg.includes('hit a snag')
              ? msg
              : 'Tidy hit a snag. Try again in a sec.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, isOpen, organizationId],
  );

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
    ],
  );

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  );
}
