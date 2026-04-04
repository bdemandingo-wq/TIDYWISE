import { useState, useEffect, useRef, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { toast } from 'sonner';
import { format, isToday, isThisWeek } from 'date-fns';
import {
  MessageSquare, Send, Search, Plus, Phone, Loader2, RefreshCw,
  MoreHorizontal, Pencil, Trash2, Users, HardHat, X,
  Check, Mail, Link, Paperclip, ChevronLeft, Forward,
  Mic, Video, Pin, BellOff, CheckCheck, MessageCircle,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { handleSmsError } from '@/lib/smsErrorHandler';
import { useIsMobile } from '@/hooks/use-mobile';
import { MessageTemplatesPicker } from '@/components/admin/MessageTemplatesPicker';
import { EmailTemplateLibrary } from '@/components/admin/EmailTemplateLibrary';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/admin/PullToRefreshIndicator';
import { BookOpen, Filter } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { hapticImpact } from '@/lib/haptics';

// ─── Types ──────────────────────────────────────────
interface Conversation {
  id: string;
  customer_id: string | null;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  unread_count: number;
  conversation_type?: string;
  last_message_preview?: string;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  sent_at: string;
  status: string;
  media_urls: string[] | null;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  type: 'client' | 'cleaner';
}

type ConversationTab = 'all' | 'clients' | 'cleaners' | 'unread';

// ─── Helpers ────────────────────────────────────────
const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('1') && digits.length === 11 ? digits.substring(1) : digits;
};

const getInitials = (name: string | null, phone: string) => {
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return phone.slice(-2);
};

const formatConversationTime = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isThisWeek(d)) return format(d, 'EEE');
  return format(d, 'M/d/yy');
};

const formatUnreadCount = (count: number) => {
  if (count > 99) return '99+';
  return count;
};

// ─── Component ──────────────────────────────────────
export default function MessagesPage() {
  const { organizationId } = useOrgId();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [conversationType, setConversationType] = useState<'client' | 'cleaner'>('client');
  const [activeTab, setActiveTab] = useState<ConversationTab>('all');
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailContacts, setEmailContacts] = useState<{ email: string; name: string }[]>([]);
  const [emailToSearch, setEmailToSearch] = useState('');
  const [emailToDropdownOpen, setEmailToDropdownOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ name: string; content: string; type: string }[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [contentSearchResults, setContentSearchResults] = useState<Set<string> | null>(null);
  const [searchingContent, setSearchingContent] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMediaUrl, setForwardMediaUrl] = useState('');
  const [forwardContactSearch, setForwardContactSearch] = useState('');
  const [forwardSelectedContact, setForwardSelectedContact] = useState<Contact | null>(null);
  const [forwardSending, setForwardSending] = useState(false);

  // Bulk edit state
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Long-press context menu state
  const [contextMenuConvId, setContextMenuConvId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Muted conversations
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());
  // Single delete confirmation
  const [deleteConfirmConvId, setDeleteConfirmConvId] = useState<string | null>(null);

  const emailBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  // ─── Pinned contacts persistence ──────────────────
  useEffect(() => {
    if (!organizationId) return;
    const key = `pinned_conversations_${organizationId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try { setPinnedIds(new Set(JSON.parse(stored))); } catch { /* ignore */ }
    }
  }, [organizationId]);

  const togglePin = (convId: string) => {
    hapticImpact('light');
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
      } else {
        if (next.size >= 6) {
          toast.error('You can only pin up to 6 conversations');
          return prev;
        }
        next.add(convId);
      }
      if (organizationId) {
        localStorage.setItem(`pinned_conversations_${organizationId}`, JSON.stringify([...next]));
      }
      return next;
    });
  };

  // ─── Bulk edit handlers ───────────────────────────
  const toggleBulkSelect = (convId: string) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev);
      if (next.has(convId)) next.delete(convId); else next.add(convId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = [...unpinnedConversations, ...pinnedConversations].map(c => c.id);
    if (selectedForBulk.size === allIds.length) {
      setSelectedForBulk(new Set());
    } else {
      setSelectedForBulk(new Set(allIds));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedForBulk.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = [...selectedForBulk];
      await supabase.from('sms_messages').delete().in('conversation_id', ids);
      const { error } = await supabase.from('sms_conversations').delete().in('id', ids);
      if (error) { toast.error('Failed to delete conversations'); return; }
      setConversations(prev => prev.filter(c => !selectedForBulk.has(c.id)));
      if (selectedConversation && selectedForBulk.has(selectedConversation.id)) {
        setSelectedConversation(null);
        setMessages([]);
      }
      // Unpin deleted conversations
      setPinnedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        if (organizationId) {
          localStorage.setItem(`pinned_conversations_${organizationId}`, JSON.stringify([...next]));
        }
        return next;
      });
      toast.success(`Deleted ${ids.length} conversation${ids.length > 1 ? 's' : ''}`);
      setSelectedForBulk(new Set());
      setBulkEditMode(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirmOpen(false);
    }
  };

  // ─── Forward photo ────────────────────────────────
  const handleForwardPhoto = (mediaUrl: string) => {
    setForwardMediaUrl(mediaUrl);
    setForwardSelectedContact(null);
    setForwardContactSearch('');
    setForwardOpen(true);
  };

  const handleSendForward = async () => {
    if (!forwardSelectedContact || !organizationId || !forwardMediaUrl) return;
    setForwardSending(true);
    try {
      const messageText = `📷 Forwarded photo: ${forwardMediaUrl}`;
      const response = await supabase.functions.invoke('send-openphone-sms', {
        body: { to: forwardSelectedContact.phone, message: messageText, organizationId }
      });
      if (handleSmsError(response)) { setForwardSending(false); return; }
      toast.success(`Photo forwarded to ${forwardSelectedContact.name}`);
      setForwardOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to forward photo');
    } finally { setForwardSending(false); }
  };

  // ─── Pull to refresh ─────────────────────────────
  const { refreshing, pullDistance, handlers: pullHandlers } = usePullToRefresh(async () => {
    await fetchConversations();
  });

  // ─── Fetch contacts ──────────────────────────────
  const fetchContacts = async () => {
    if (!organizationId) return;
    const [customersRes, staffRes] = await Promise.all([
      supabase.from('customers').select('id, first_name, last_name, phone').eq('organization_id', organizationId).not('phone', 'is', null),
      supabase.from('staff').select('id, name, phone').eq('organization_id', organizationId).not('phone', 'is', null)
    ]);
    const customerContacts: Contact[] = (customersRes.data || []).filter(c => c.phone).map(c => ({
      id: c.id, name: `${c.first_name} ${c.last_name}`.trim(), phone: c.phone!, type: 'client' as const
    }));
    const staffContacts: Contact[] = (staffRes.data || []).filter(s => s.phone).map(s => ({
      id: s.id, name: s.name, phone: s.phone!, type: 'cleaner' as const
    }));
    setContacts([...customerContacts, ...staffContacts]);
  };

  // ─── Realtime ─────────────────────────────────────
  useEffect(() => {
    if (organizationId) {
      fetchConversations();
      fetchContacts();
      const channel = supabase
        .channel('sms-messages')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'sms_messages',
          filter: `organization_id=eq.${organizationId}`,
        }, (payload) => {
          const newMsg = payload.new as any;
          if (selectedConversation && newMsg.conversation_id === selectedConversation.id) {
            setMessages(prev => [...prev, {
              id: newMsg.id, direction: newMsg.direction as 'inbound' | 'outbound',
              content: newMsg.content, sent_at: newMsg.sent_at, status: newMsg.status,
              media_urls: newMsg.media_urls || null,
            }]);
          }
          if (newMsg.direction === 'inbound') {
            toast.info('New message received', {
              description: newMsg.content?.substring(0, 50) + (newMsg.content?.length > 50 ? '...' : ''),
            });
          }
          fetchConversations();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [organizationId, selectedConversation?.id]);

  useEffect(() => {
    if (selectedConversation) fetchMessages(selectedConversation.id);
  }, [selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Fetch conversations ──────────────────────────
  const fetchConversations = async () => {
    setLoading(true);
    const [convsRes, customersRes, staffRes] = await Promise.all([
      supabase.from('sms_conversations').select('*').eq('organization_id', organizationId).order('last_message_at', { ascending: false }),
      supabase.from('customers').select('phone').eq('organization_id', organizationId).not('phone', 'is', null),
      supabase.from('staff').select('phone').eq('organization_id', organizationId).not('phone', 'is', null),
    ]);
    if (convsRes.error) {
      toast.error('Failed to load conversations');
    } else {
      const convs = (convsRes.data || []) as Conversation[];
      const customerPhones = new Set((customersRes.data || []).map(c => normalizePhone(c.phone!)));
      const staffPhones = new Set((staffRes.data || []).map(s => normalizePhone(s.phone!)));
      convs.forEach(c => {
        const norm = normalizePhone(c.customer_phone);
        if (staffPhones.has(norm)) c.conversation_type = 'cleaner';
        else if (customerPhones.has(norm)) c.conversation_type = 'client';
      });
      if (convs.length > 0) {
        const { data: previews } = await supabase
          .from('sms_messages').select('conversation_id, content')
          .in('conversation_id', convs.map(c => c.id)).order('sent_at', { ascending: false });
        if (previews) {
          const previewMap = new Map<string, string>();
          for (const p of previews) { if (!previewMap.has(p.conversation_id)) previewMap.set(p.conversation_id, p.content); }
          convs.forEach(c => { c.last_message_preview = previewMap.get(c.id) || undefined; });
        }
      }
      setConversations(convs);
    }
    setLoading(false);
  };

  const fetchMessages = async (conversationId: string) => {
    const { data, error } = await supabase.from('sms_messages').select('*').eq('conversation_id', conversationId).order('sent_at', { ascending: true });
    if (!error) {
      setMessages((data || []).map(msg => ({ ...msg, direction: msg.direction as 'inbound' | 'outbound' })));
      await supabase.from('sms_conversations').update({ unread_count: 0 }).eq('id', conversationId);
    }
  };

  // ─── Send message ─────────────────────────────────
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !organizationId) return;
    setSending(true);
    try {
      const response = await supabase.functions.invoke('send-openphone-sms', {
        body: { to: selectedConversation.customer_phone, message: newMessage.trim(), organizationId }
      });
      if (handleSmsError(response)) return;
      await supabase.from('sms_messages').insert({
        conversation_id: selectedConversation.id, organization_id: organizationId,
        direction: 'outbound', content: newMessage.trim(), status: 'sent',
        openphone_message_id: response.data?.messageId
      });
      await supabase.from('sms_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selectedConversation.id);
      setNewMessage('');
      hapticImpact('light');
      fetchMessages(selectedConversation.id);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
    } finally { setSending(false); }
  };

  // ─── New conversation ─────────────────────────────
  const handleStartNewConversation = async () => {
    const phoneToUse = selectedContact?.phone || newPhone.trim();
    const nameToUse = selectedContact?.name || newName.trim();
    const typeToUse = selectedContact?.type || conversationType;
    if (!phoneToUse || !organizationId) return;
    const formattedPhone = phoneToUse.replace(/\D/g, '');
    const phoneWithCountry = formattedPhone.startsWith('1') ? `+${formattedPhone}` : `+1${formattedPhone}`;
    const { data: existing } = await supabase.from('sms_conversations').select('*').eq('organization_id', organizationId).eq('customer_phone', phoneWithCountry).maybeSingle();
    if (existing) { setSelectedConversation(existing); resetNewConversationState(); return; }
    const { data, error } = await supabase.from('sms_conversations').insert({
      organization_id: organizationId, customer_phone: phoneWithCountry, customer_name: nameToUse || null, conversation_type: typeToUse
    }).select().single();
    if (error) { toast.error('Failed to create conversation'); return; }
    setConversations([data, ...conversations]);
    setSelectedConversation(data);
    resetNewConversationState();
  };

  const resetNewConversationState = () => {
    setNewConversationOpen(false); setNewPhone(''); setNewName('');
    setConversationType('client'); setSelectedContact(null); setContactSearch('');
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact); setNewPhone(contact.phone); setNewName(contact.name); setConversationType(contact.type);
  };

  const filteredContacts = contacts.filter(c => {
    const matchesType = conversationType === 'client' ? c.type === 'client' : c.type === 'cleaner';
    const matchesSearch = contactSearch === '' || c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone.includes(contactSearch);
    return matchesType && matchesSearch;
  });

  const handleUpdateCustomerName = async () => {
    if (!selectedConversation) return;
    const { error } = await supabase.from('sms_conversations').update({ customer_name: editingName.trim() || null }).eq('id', selectedConversation.id);
    if (error) { toast.error('Failed to update name'); return; }
    setConversations(prev => prev.map(c => c.id === selectedConversation.id ? { ...c, customer_name: editingName.trim() || null } : c));
    setSelectedConversation(prev => prev ? { ...prev, customer_name: editingName.trim() || null } : null);
    setEditNameOpen(false);
    toast.success('Name updated');
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!confirm('Delete this conversation and all messages?')) return;
    await supabase.from('sms_messages').delete().eq('conversation_id', convId);
    const { error } = await supabase.from('sms_conversations').delete().eq('id', convId);
    if (error) { toast.error('Failed to delete conversation'); return; }
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selectedConversation?.id === convId) { setSelectedConversation(null); setMessages([]); }
    toast.success('Conversation deleted');
  };

  const handleMarkAsRead = async (convId: string) => {
    hapticImpact('light');
    await supabase.from('sms_conversations').update({ unread_count: 0 }).eq('id', convId);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
  };

  // ─── Content search ───────────────────────────────
  useEffect(() => {
    if (searchQuery.length < 3 || !organizationId) { setContentSearchResults(null); return; }
    const timer = setTimeout(async () => {
      setSearchingContent(true);
      const { data } = await supabase.from('sms_messages').select('conversation_id').eq('organization_id', organizationId).ilike('content', `%${searchQuery}%`).limit(100);
      if (data) setContentSearchResults(new Set(data.map(m => m.conversation_id)));
      setSearchingContent(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, organizationId]);

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      const matchesNamePhone = conv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) || conv.customer_phone.includes(searchQuery);
      const matchesContent = contentSearchResults?.has(conv.id) ?? false;
      const matchesSearch = searchQuery.length === 0 || matchesNamePhone || matchesContent;
      if (activeTab === 'clients') return matchesSearch && conv.conversation_type === 'client';
      if (activeTab === 'cleaners') return matchesSearch && conv.conversation_type === 'cleaner';
      if (activeTab === 'unread') return matchesSearch && conv.unread_count > 0;
      return matchesSearch;
    });
  }, [conversations, searchQuery, activeTab, contentSearchResults]);

  // Split pinned / unpinned
  const pinnedConversations = useMemo(() => filteredConversations.filter(c => pinnedIds.has(c.id)), [filteredConversations, pinnedIds]);
  const unpinnedConversations = useMemo(() => filteredConversations.filter(c => !pinnedIds.has(c.id)), [filteredConversations, pinnedIds]);

  // ─── Email ────────────────────────────────────────
  const handleSendEmail = async () => {
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim() || !organizationId) return;
    setEmailSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-direct-email', {
        body: { organizationId, to: emailTo.trim(), subject: emailSubject.trim(), body: getEmailHtmlBody(), attachments: emailAttachments.length > 0 ? emailAttachments : undefined }
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success('Email sent successfully');
      setEmailOpen(false); setEmailTo(''); setEmailToSearch(''); setEmailSubject(''); setEmailBody(''); setEmailAttachments([]);
      if (emailBodyRef.current) emailBodyRef.current.innerHTML = '';
    } catch (err: any) { toast.error(err.message || 'Failed to send email'); }
    finally { setEmailSending(false); }
  };

  const handleInsertLink = () => {
    if (!linkUrl.trim()) return;
    const display = linkText.trim() || linkUrl.trim();
    const editor = emailBodyRef.current;
    if (editor) {
      editor.focus();
      const linkEl = `<a href="${linkUrl.trim()}" style="color: hsl(var(--primary)); text-decoration: underline;" contenteditable="false">${display}</a>&nbsp;`;
      document.execCommand('insertHTML', false, linkEl);
      setEmailBody(editor.innerHTML);
    }
    setLinkUrl(''); setLinkText(''); setLinkPopoverOpen(false);
  };

  const getEmailHtmlBody = (): string => {
    if (!emailBodyRef.current) return emailBody;
    let html = emailBodyRef.current.innerHTML;
    html = html.replace(/\s*contenteditable="false"/g, '');
    html = html.replace(/<div><br><\/div>/g, '<br>').replace(/<div>/g, '<br>').replace(/<\/div>/g, '');
    return html;
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 10 * 1024 * 1024) { toast.error(`File "${file.name}" is too large (max 10MB)`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setEmailAttachments(prev => [...prev, { name: file.name, content: base64, type: file.type }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (index: number) => { setEmailAttachments(prev => prev.filter((_, i) => i !== index)); };

  const handleSelectConversation = (conv: Conversation) => {
    if (bulkEditMode) {
      toggleBulkSelect(conv.id);
      return;
    }
    hapticImpact('light');
    setSelectedConversation(conv);
  };

  // Long-press handlers for context menu
  const handleLongPressStart = (convId: string, e: React.TouchEvent | React.MouseEvent) => {
    if (bulkEditMode) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    longPressTimer.current = setTimeout(() => {
      hapticImpact('medium');
      setContextMenuConvId(convId);
      setContextMenuPosition({ x: clientX, y: clientY });
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleLongPressMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextAction = (action: 'pin' | 'unread' | 'mute' | 'delete') => {
    if (!contextMenuConvId) return;
    switch (action) {
      case 'pin':
        togglePin(contextMenuConvId);
        break;
      case 'unread':
        hapticImpact('light');
        supabase.from('sms_conversations').update({ unread_count: 1 }).eq('id', contextMenuConvId).then(() => {
          setConversations(prev => prev.map(c => c.id === contextMenuConvId ? { ...c, unread_count: Math.max(c.unread_count, 1) } : c));
        });
        break;
      case 'mute':
        hapticImpact('light');
        setMutedIds(prev => {
          const next = new Set(prev);
          if (next.has(contextMenuConvId)) next.delete(contextMenuConvId);
          else next.add(contextMenuConvId);
          return next;
        });
        toast.success(mutedIds.has(contextMenuConvId) ? 'Alerts enabled' : 'Alerts hidden');
        break;
      case 'delete':
        setDeleteConfirmConvId(contextMenuConvId);
        break;
    }
    setContextMenuConvId(null);
    setContextMenuPosition(null);
  };

  const handleBackToList = () => { setSelectedConversation(null); setMessages([]); };

  // ─── Message grouping with timestamps ─────────────
  const groupedMessages = useMemo(() => {
    const groups: { type: 'timestamp' | 'message'; date?: string; msg?: Message; isFirst?: boolean; isLast?: boolean }[] = [];
    let lastDate = '';
    messages.forEach((msg, i) => {
      const msgDate = format(new Date(msg.sent_at), 'MMM d, yyyy');
      if (msgDate !== lastDate) {
        groups.push({ type: 'timestamp', date: msgDate });
        lastDate = msgDate;
      }
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const isFirst = !prev || prev.direction !== msg.direction || (new Date(msg.sent_at).getTime() - new Date(prev.sent_at).getTime() > 60000);
      const isLast = !next || next.direction !== msg.direction || (new Date(next.sent_at).getTime() - new Date(msg.sent_at).getTime() > 60000);
      groups.push({ type: 'message', msg, isFirst, isLast });
    });
    return groups;
  }, [messages]);

  // ─── Textarea auto-resize ─────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [newMessage]);

  // ═══════════════════════════════════════════════════
  // RENDER: Pinned Row
  // ═══════════════════════════════════════════════════
  const renderPinnedRow = () => {
    if (pinnedConversations.length === 0) return null;
    return isMobile ? (
      <div className="px-4 pt-2 pb-3">
        <div className="grid grid-cols-3 gap-y-5 gap-x-3">
          {pinnedConversations.slice(0, 6).map(conv => (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              className="flex flex-col items-center gap-1.5 group relative active:scale-95 transition-transform"
            >
              <div className="relative">
                <Avatar className="h-[68px] w-[68px]">
                  <AvatarFallback className={cn(
                    "text-[22px] font-semibold",
                    conv.conversation_type === 'cleaner' ? "bg-amber-100 text-amber-700" : "bg-[#E5E5EA] text-[#3C3C43]"
                  )}>
                    {conv.conversation_type === 'cleaner'
                      ? <HardHat className="h-7 w-7" />
                      : getInitials(conv.customer_name, conv.customer_phone)}
                  </AvatarFallback>
                </Avatar>
                {conv.unread_count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#007AFF] ring-2 ring-white dark:ring-black text-white text-[10px] font-bold px-1">
                    {formatUnreadCount(conv.unread_count)}
                  </span>
                )}
                {conv.last_message_preview && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 max-w-[110px] bg-[#E5E5EA] dark:bg-[#3A3A3C] rounded-xl px-2.5 py-1 shadow-sm pointer-events-none">
                    <p className="text-[11px] text-[#1C1C1E] dark:text-[#F2F2F7] truncate leading-tight text-center">{conv.last_message_preview.slice(0, 24)}</p>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#E5E5EA] dark:bg-[#3A3A3C] rotate-45" />
                  </div>
                )}
              </div>
              <span className="text-[11px] text-[#3C3C43] dark:text-[#EBEBF5] truncate w-full text-center leading-tight font-medium">
                {conv.customer_name?.split(' ')[0] || conv.customer_phone.slice(-4)}
              </span>
            </button>
          ))}
        </div>
      </div>
    ) : (
      <div className="px-3 pt-3 pb-1">
        <div className="grid grid-cols-3 gap-y-4 gap-x-3 pb-2">
          {pinnedConversations.slice(0, 6).map(conv => (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              onContextMenu={(e) => { e.preventDefault(); handleLongPressStart(conv.id, e); }}
              className="flex flex-col items-center gap-1.5 group relative active:scale-95 transition-transform"
            >
              <div className="relative">
                <Avatar className="h-14 w-14 ring-2 ring-transparent group-hover:ring-[#007AFF]/30 transition-all">
                  <AvatarFallback className={cn(
                    "text-sm font-semibold",
                    conv.conversation_type === 'cleaner' ? "bg-amber-100 text-amber-700" : "bg-[#007AFF]/10 text-[#007AFF]"
                  )}>
                    {conv.conversation_type === 'cleaner'
                      ? <HardHat className="h-5 w-5" />
                      : getInitials(conv.customer_name, conv.customer_phone)}
                  </AvatarFallback>
                </Avatar>
                {conv.unread_count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#007AFF] text-white text-[10px] font-bold px-1 ring-2 ring-background">
                    {formatUnreadCount(conv.unread_count)}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground truncate w-16 text-center font-medium">
                {conv.customer_name?.split(' ')[0] || conv.customer_phone.slice(-4)}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════
  // RENDER: Filter Pills
  // ═══════════════════════════════════════════════════
  const renderFilterPills = () => {
    const tabs: { key: ConversationTab; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'clients', label: 'Clients' },
      { key: 'cleaners', label: 'Cleaners' },
      { key: 'unread', label: 'Unread' },
    ];
    return (
      <div className="flex gap-2 px-4 py-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); hapticImpact('light'); }}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
              activeTab === tab.key
                ? "bg-[#007AFF] text-white shadow-sm"
                : isMobile
                  ? "bg-[#E5E5EA] dark:bg-[#3A3A3C] text-[#3C3C43] dark:text-[#EBEBF5]"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════
  // RENDER: Conversation Row
  // ═══════════════════════════════════════════════════
  const renderConversationRow = (conv: Conversation) => {
    const isUnread = conv.unread_count > 0;
    const isPinned = pinnedIds.has(conv.id);
    const hasMessages = !!conv.last_message_preview;

    const rowContent = (
      <div
        onClick={() => handleSelectConversation(conv)}
        onTouchStart={(e) => handleLongPressStart(conv.id, e)}
        onTouchEnd={handleLongPressEnd}
        onTouchMove={handleLongPressMove}
        onContextMenu={(e) => { e.preventDefault(); handleLongPressStart(conv.id, e); }}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer select-none",
          "bg-white dark:bg-[#1C1C1E] active:bg-[#E5E5EA] dark:active:bg-[#2C2C2E]",
          selectedConversation?.id === conv.id && !isMobile && "bg-muted/50"
        )}
      >
        {/* Bulk edit checkbox */}
        {bulkEditMode && isMobile && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedForBulk.has(conv.id)}
              onCheckedChange={() => toggleBulkSelect(conv.id)}
              className="h-5 w-5 rounded-full border-2 border-[#007AFF] data-[state=checked]:bg-[#007AFF]"
            />
          </div>
        )}
        {/* Unread blue dot — only when actually unread */}
        {!bulkEditMode && (
          <div className="w-[10px] shrink-0 flex justify-center">
            {isUnread && (
              <span className="w-[10px] h-[10px] rounded-full bg-[#007AFF]" />
            )}
          </div>
        )}
        <Avatar className={cn("shrink-0", isMobile ? "h-[52px] w-[52px]" : "h-12 w-12")}>
          <AvatarFallback className={cn(
            "text-lg font-semibold",
            conv.conversation_type === 'cleaner' ? "bg-amber-100 text-amber-700" : "bg-[#E5E5EA] dark:bg-[#3A3A3C] text-[#3C3C43] dark:text-[#EBEBF5]"
          )}>
            {conv.conversation_type === 'cleaner'
              ? <HardHat className="h-5 w-5" />
              : getInitials(conv.customer_name, conv.customer_phone)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-[16px] truncate", isUnread ? "font-semibold text-[#1C1C1E] dark:text-white" : "font-normal text-[#1C1C1E] dark:text-white")}>
              {conv.customer_name || conv.customer_phone}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn("text-[14px]", isUnread ? "text-[#1C1C1E] dark:text-white" : "text-[#8E8E93]")}>
                {formatConversationTime(conv.last_message_at)}
              </span>
              {!bulkEditMode && (
                <ChevronLeft className="h-3.5 w-3.5 text-[#C7C7CC] dark:text-[#48484A] rotate-180" />
              )}
            </div>
          </div>
          <p className={cn("text-[14px] truncate mt-0.5", isUnread ? "font-medium text-[#1C1C1E] dark:text-[#EBEBF5]" : "text-[#8E8E93]")}>
            {hasMessages ? conv.last_message_preview : 'No messages yet'}
          </p>
        </div>
      </div>
    );

    return rowContent;
  };

  // ═══════════════════════════════════════════════════
  // RENDER: Conversation List
  // ═══════════════════════════════════════════════════
  const renderConversationList = () => (
    <div className={cn("flex flex-col h-full", isMobile ? "bg-white dark:bg-[#1C1C1E]" : "bg-background")}>
      {/* iOS Header - mobile only */}
      {isMobile && (
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <button className="text-[#007AFF] text-[17px] font-normal flex items-center gap-0.5">
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </button>
          <h1 className="text-[17px] font-semibold text-[#1C1C1E] dark:text-white">Messages</h1>
          <div className="flex items-center gap-2">
            {bulkEditMode ? (
              <button
                onClick={() => { setBulkEditMode(false); setSelectedForBulk(new Set()); }}
                className="text-[#007AFF] text-[15px] font-medium"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setBulkEditMode(true); setSelectedForBulk(new Set()); }}
                  className="text-[#007AFF]"
                >
                  <Pencil className="h-5 w-5" />
                </button>
                <button onClick={() => setNewConversationOpen(true)} className="text-[#007AFF]">
                  <Plus className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 pt-2 pb-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8E8E93]" />
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "pl-10 pr-10 h-9 rounded-xl border-0 focus-visible:ring-1 text-[15px]",
              isMobile ? "bg-[#E5E5EA]/60 dark:bg-[#3A3A3C] placeholder:text-[#8E8E93]" : "bg-muted/50"
            )}
          />
          {searchingContent ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-[#8E8E93]" />
          ) : isMobile ? (
            <Mic className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8E8E93]" />
          ) : null}
        </div>
      </div>

      {/* Pinned */}
      {!bulkEditMode && renderPinnedRow()}

      {/* Filter pills */}
      {renderFilterPills()}

      {/* Bulk edit: Select All */}
      {bulkEditMode && isMobile && (
        <div className="px-4 py-2 flex items-center justify-between border-b border-[#E5E5EA] dark:border-[#3A3A3C]">
          <button
            onClick={toggleSelectAll}
            className="text-[#007AFF] text-[15px] font-medium"
          >
            {selectedForBulk.size === [...unpinnedConversations, ...pinnedConversations].length ? 'Deselect All' : 'Select All'}
          </button>
          <span className="text-[13px] text-[#8E8E93]">
            {selectedForBulk.size} selected
          </span>
        </div>
      )}

      {/* Conversation rows */}
      <div className="flex-1 overflow-y-auto" {...(bulkEditMode ? {} : pullHandlers)}>
        {!bulkEditMode && <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />}
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#8E8E93]" />
          </div>
        ) : unpinnedConversations.length === 0 && pinnedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <MessageSquare className="h-12 w-12 text-[#C7C7CC] mb-4" />
            <p className="text-[15px] text-[#8E8E93]">No conversations yet</p>
          </div>
        ) : (
          <div>
            {bulkEditMode && pinnedConversations.map(conv => (
              <div key={conv.id}>{renderConversationRow(conv)}</div>
            ))}
            {unpinnedConversations.map(conv => (
              <div key={conv.id}>{renderConversationRow(conv)}</div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk edit bottom bar */}
      {bulkEditMode && isMobile && (
        <div className="px-4 py-3 border-t border-[#E5E5EA] dark:border-[#3A3A3C] bg-white dark:bg-[#1C1C1E] flex items-center gap-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <Button
            variant="destructive"
            className="h-11 text-[15px] font-semibold rounded-xl px-5"
            disabled={selectedForBulk.size === 0}
            onClick={() => setBulkDeleteConfirmOpen(true)}
          >
            Delete
          </Button>
          <div className="flex-1 text-center">
            <span className="text-[13px] text-[#8E8E93] font-medium">
              {selectedForBulk.size} selected
            </span>
          </div>
          <Button
            variant="ghost"
            className="h-11 text-[15px] rounded-xl text-[#007AFF] px-5"
            disabled={selectedForBulk.size === 0}
            onClick={async () => {
              const ids = [...selectedForBulk];
              await Promise.all(ids.map(id => supabase.from('sms_conversations').update({ unread_count: 0 }).eq('id', id)));
              setConversations(prev => prev.map(c => selectedForBulk.has(c.id) ? { ...c, unread_count: 0 } : c));
              toast.success(`Marked ${ids.length} as read`);
              setSelectedForBulk(new Set());
              setBulkEditMode(false);
            }}
          >
            Mark as Read
          </Button>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════
  // RENDER: Chat View
  // ═══════════════════════════════════════════════════
  const renderChatView = () => {
    if (!selectedConversation) return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <MessageSquare className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">Select a conversation</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">Choose from the list to start messaging</p>
        </div>
      </div>
    );

    const isPinned = pinnedIds.has(selectedConversation.id);

    return (
      <div className="flex flex-col h-full bg-background">
        {/* Chat Header — fixed on mobile */}
        <div className={cn(
          "px-3 py-2.5 border-b flex items-center gap-2 bg-background/80 backdrop-blur-xl z-20 shrink-0",
          isMobile ? "fixed top-0 left-0 right-0 pt-[calc(0.625rem+env(safe-area-inset-top,0px))]" : "sticky top-0"
        )}>
          {isMobile && (
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-[#007AFF]" onClick={handleBackToList}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            <Avatar className="h-8 w-8">
              <AvatarFallback className={cn(
                "text-xs font-semibold",
                selectedConversation.conversation_type === 'cleaner' ? "bg-amber-100 text-amber-700" : "bg-[#007AFF]/10 text-[#007AFF]"
              )}>
                {selectedConversation.conversation_type === 'cleaner'
                  ? <HardHat className="h-3.5 w-3.5" />
                  : getInitials(selectedConversation.customer_name, selectedConversation.customer_phone)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate leading-tight">
                {selectedConversation.customer_name || selectedConversation.customer_phone}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {selectedConversation.conversation_type === 'cleaner' ? 'Cleaner' : 'Client'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#007AFF]"
              onClick={() => window.open(`tel:${selectedConversation.customer_phone}`)}>
              <Phone className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => togglePin(selectedConversation.id)}>
                  <Pin className="h-4 w-4 mr-2" />
                  {isPinned ? 'Unpin' : 'Pin'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setEditingName(selectedConversation.customer_name || ''); setEditNameOpen(true); }}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit Name
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteConversation(selectedConversation.id)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages — add top padding on mobile for fixed header */}
        <div className={cn("flex-1 overflow-y-auto px-3 py-4", isMobile && "pt-[calc(3.5rem+env(safe-area-inset-top,0px))]")}>
          <div className="space-y-0.5">
            {groupedMessages.map((item, i) => {
              if (item.type === 'timestamp') {
                return (
                  <div key={`ts-${i}`} className="flex justify-center py-3">
                    <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
                      {item.date}
                    </span>
                  </div>
                );
              }
              const msg = item.msg!;
              const isOutbound = msg.direction === 'outbound';
              return (
                <div key={msg.id} className={cn("flex", isOutbound ? 'justify-end' : 'justify-start', item.isFirst && 'mt-2')}>
                  <div className={cn(
                    "max-w-[75%] px-3.5 py-2 relative",
                    isOutbound ? 'bg-[#007AFF] text-white' : 'bg-muted text-foreground',
                    item.isFirst && item.isLast
                      ? 'rounded-2xl'
                      : item.isFirst
                        ? isOutbound ? 'rounded-2xl rounded-br-lg' : 'rounded-2xl rounded-bl-lg'
                        : item.isLast
                          ? isOutbound ? 'rounded-2xl rounded-tr-lg' : 'rounded-2xl rounded-tl-lg'
                          : isOutbound ? 'rounded-2xl rounded-r-lg' : 'rounded-2xl rounded-l-lg',
                  )}>
                    {msg.media_urls && msg.media_urls.length > 0 && (
                      <div className="space-y-1 mb-1">
                        {msg.media_urls.map((url, idx) => (
                          <div key={idx} className="relative group">
                            <img src={url} alt="MMS" className="max-w-full rounded-lg cursor-pointer"
                              onClick={() => window.open(url, '_blank')}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            <Button variant="secondary" size="sm"
                              className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity gap-1 h-7 text-xs shadow-md"
                              onClick={(e) => { e.stopPropagation(); handleForwardPhoto(url); }}>
                              <Forward className="w-3 h-3" /> Forward
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[15px] leading-snug whitespace-pre-wrap">{msg.content}</p>
                    {item.isLast && (
                      <p className={cn("text-[10px] mt-0.5", isOutbound ? 'text-white/60 text-right' : 'text-muted-foreground')}>
                        {format(new Date(msg.sent_at), 'h:mm a')}
                        {isOutbound && msg.status === 'sent' && <span className="ml-1">Sent</span>}
                        {isOutbound && msg.status === 'delivered' && <span className="ml-1">Delivered</span>}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input bar */}
        <div className="px-3 py-2 border-t bg-background/80 backdrop-blur-xl pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex items-end gap-2">
            {organizationId && (
              <MessageTemplatesPicker organizationId={organizationId} onSelect={(content) => setNewMessage(content)} />
            )}
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                placeholder="iMessage"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                className="min-h-[36px] max-h-[120px] resize-none text-[15px] rounded-2xl bg-muted/40 border border-border/50 py-2 px-3.5 focus-visible:ring-1 focus-visible:ring-[#007AFF]"
                rows={1}
              />
            </div>
            <Button
              onClick={newMessage.trim() ? handleSendMessage : undefined}
              disabled={sending}
              size="icon"
              className={cn(
                "h-9 w-9 rounded-full shrink-0 transition-all",
                newMessage.trim()
                  ? "bg-[#007AFF] hover:bg-[#0066DD] text-white shadow-sm"
                  : "bg-transparent text-[#007AFF] hover:bg-[#007AFF]/10"
              )}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : newMessage.trim() ? <Send className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════
  return (
    <AdminLayout
      title="Messages"
      subtitle="Text & email your customers"
      actions={
        isMobile ? (
          <SEOHead title="Messages | TidyWise" description="View and send messages to clients" noIndex />
        ) : (
          <div className="flex items-center gap-2">
            <SEOHead title="Messages | TidyWise" description="View and send messages to clients" noIndex />
            <Button variant="outline" size="icon" onClick={fetchConversations}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Message</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Start New Conversation</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label className="text-sm font-medium">Contact Type</Label>
                    <Tabs value={conversationType} onValueChange={(v) => { setConversationType(v as 'client' | 'cleaner'); setSelectedContact(null); }} className="mt-2">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="client" className="gap-2"><Users className="h-4 w-4" />Client</TabsTrigger>
                        <TabsTrigger value="cleaner" className="gap-2"><HardHat className="h-4 w-4" />Cleaner</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Select {conversationType === 'client' ? 'Customer' : 'Staff Member'}</Label>
                    <Command className="border rounded-md mt-2">
                      <CommandInput placeholder={`Search ${conversationType === 'client' ? 'customers' : 'staff'}...`} value={contactSearch} onValueChange={setContactSearch} />
                      <CommandList className="max-h-40">
                        <CommandEmpty>No {conversationType === 'client' ? 'customers' : 'staff'} found.</CommandEmpty>
                        <CommandGroup>
                          {filteredContacts.slice(0, 10).map((contact) => (
                            <CommandItem key={contact.id} value={`${contact.name} ${contact.phone}`} onSelect={() => handleSelectContact(contact)} className="cursor-pointer">
                              <div className="flex items-center gap-2 flex-1">
                                <Avatar className="h-6 w-6"><AvatarFallback className={cn("text-xs", contact.type === 'cleaner' ? "bg-amber-100 text-amber-700" : "bg-[#007AFF]/10 text-[#007AFF]")}>{contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{contact.name}</p><p className="text-xs text-muted-foreground">{contact.phone}</p></div>
                                {selectedContact?.id === contact.id && <Check className="h-4 w-4 text-[#007AFF]" />}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>
                  <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or enter manually</span></div></div>
                  <div><Label className="text-sm font-medium">Phone Number</Label><Input placeholder="(555) 123-4567" value={newPhone} onChange={(e) => { setNewPhone(e.target.value); setSelectedContact(null); }} /></div>
                  <div><Label className="text-sm font-medium">Name (optional)</Label><Input placeholder="Contact name" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
                  <Button onClick={handleStartNewConversation} className="w-full" disabled={!newPhone.trim() && !selectedContact}>Start Conversation</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={emailOpen} onOpenChange={async (open) => {
              setEmailOpen(open);
              if (open && organizationId) {
                const { data } = await supabase.from('customers').select('email, first_name, last_name').eq('organization_id', organizationId).not('email', 'is', null).order('first_name');
                const allContacts = (data || []).filter(c => c.email).map(c => ({ email: c.email!, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() }));
                const unique = Array.from(new Map(allContacts.map(c => [c.email.toLowerCase(), c])).values());
                setEmailContacts(unique);
                if (!emailTo && selectedConversation?.customer_id) {
                  const { data: convCustomer } = await supabase.from('customers').select('email').eq('id', selectedConversation.customer_id).maybeSingle();
                  if (convCustomer?.email) { setEmailTo(convCustomer.email); setEmailToSearch(convCustomer.email); }
                }
              }
            }}>
              <DialogTrigger asChild><Button variant="outline"><Mail className="h-4 w-4 mr-2" />Send Email</Button></DialogTrigger>
              <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Compose Email</DialogTitle></DialogHeader>
                <div className="flex justify-end -mt-2"><Button variant="outline" size="sm" className="gap-2" onClick={() => setTemplateLibraryOpen(true)}><BookOpen className="h-4 w-4" />Templates</Button></div>
                <div className="space-y-4 pt-2">
                  <div className="relative">
                    <Label>To</Label>
                    <Input type="email" placeholder="Search or type email..." value={emailToSearch}
                      onChange={(e) => { setEmailToSearch(e.target.value); setEmailTo(e.target.value); setEmailToDropdownOpen(true); }}
                      onFocus={() => setEmailToDropdownOpen(true)} onBlur={() => setTimeout(() => setEmailToDropdownOpen(false), 200)} />
                    {emailToDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md overflow-y-auto" style={{ maxHeight: 200 }}>
                        {emailContacts.filter(c => !emailToSearch || c.email.toLowerCase().includes(emailToSearch.toLowerCase()) || c.name.toLowerCase().includes(emailToSearch.toLowerCase())).slice(0, 30).map(c => (
                          <button key={c.email} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors text-sm"
                            onMouseDown={(e) => e.preventDefault()} onClick={() => { setEmailTo(c.email); setEmailToSearch(c.email); setEmailToDropdownOpen(false); }}>
                            <div className="font-medium">{c.name || 'No name'}</div><div className="text-muted-foreground text-xs">{c.email}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div><Label>Subject</Label><Input placeholder="Email subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} /></div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>Message</Label>
                      <div className="flex items-center gap-1">
                        {organizationId && <MessageTemplatesPicker organizationId={organizationId} showSubject onSelect={(content, subject) => { setEmailBody(content); if (emailBodyRef.current) emailBodyRef.current.innerText = content; if (subject) setEmailSubject(subject); }} />}
                        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
                          <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Insert link"><Link className="h-4 w-4" /></Button></PopoverTrigger>
                          <PopoverContent className="w-72 space-y-3" align="end">
                            <p className="text-sm font-medium">Insert Link</p>
                            <div className="space-y-2"><Input placeholder="https://example.com" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /><Input placeholder="Display text (optional)" value={linkText} onChange={(e) => setLinkText(e.target.value)} /></div>
                            <Button size="sm" className="w-full" onClick={handleInsertLink} disabled={!linkUrl.trim()}>Insert</Button>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div ref={emailBodyRef} contentEditable onInput={() => { if (emailBodyRef.current) setEmailBody(emailBodyRef.current.innerHTML); }}
                      onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
                      className="flex min-h-[120px] sm:min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 overflow-y-auto whitespace-pre-wrap"
                      style={{ maxHeight: '200px' }} suppressContentEditableWarning />
                  </div>
                  <div>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileAttach} />
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-4 w-4" />Attach File</Button>
                    {emailAttachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {emailAttachments.map((att, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" /><span className="truncate flex-1">{att.name}</span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={() => removeAttachment(i)}><X className="h-3 w-3" /></Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
                  <Button onClick={handleSendEmail} disabled={emailSending || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()} className="gap-2">
                    {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send Email
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <EmailTemplateLibrary open={templateLibraryOpen} onOpenChange={setTemplateLibraryOpen} onSelectTemplate={(subject, body) => { setEmailSubject(subject); setEmailBody(body); if (emailBodyRef.current) emailBodyRef.current.innerText = body; }} />
          </div>
        )
      }
    >
      <SubscriptionGate feature="Messages">
        {isMobile ? (
          <div className="flex flex-col h-[100dvh] -mx-1.5 -mt-1.5 bg-white dark:bg-[#1C1C1E]">
            {!selectedConversation ? renderConversationList() : renderChatView()}
          </div>
        ) : (
          <div className="flex border rounded-xl overflow-hidden bg-background relative h-[calc(100vh-12rem)]">
            <div className="w-80 border-r flex flex-col shrink-0">
              {renderConversationList()}
            </div>
            <div className="flex-1 flex flex-col">
              {renderChatView()}
            </div>
          </div>
        )}

        {/* Edit Name Dialog */}
        <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Contact Name</DialogTitle></DialogHeader>
            <div className="py-4"><Label>Name</Label><Input value={editingName} onChange={(e) => setEditingName(e.target.value)} placeholder="Enter contact name" /></div>
            <DialogFooter><Button variant="outline" onClick={() => setEditNameOpen(false)}>Cancel</Button><Button onClick={handleUpdateCustomerName}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Forward Photo Dialog */}
        <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Forward Photo</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {forwardMediaUrl && <img src={forwardMediaUrl} alt="Photo to forward" className="w-full max-h-48 object-cover rounded-lg" />}
              <div>
                <Label className="text-sm font-medium">Send to</Label>
                <Command className="border rounded-md mt-1">
                  <CommandInput placeholder="Search contacts..." value={forwardContactSearch} onValueChange={setForwardContactSearch} />
                  <CommandList className="max-h-48">
                    <CommandEmpty>No contacts found.</CommandEmpty>
                    <CommandGroup>
                      {contacts.filter(c => c.name.toLowerCase().includes(forwardContactSearch.toLowerCase()) || c.phone.includes(forwardContactSearch)).slice(0, 20).map(contact => (
                        <CommandItem key={contact.id} onSelect={() => setForwardSelectedContact(contact)} className={cn("cursor-pointer", forwardSelectedContact?.id === contact.id && "bg-accent")}>
                          <div className="flex items-center gap-2 w-full">
                            <Avatar className="h-6 w-6"><AvatarFallback className="text-xs">{contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{contact.name}</p><p className="text-xs text-muted-foreground">{contact.phone}</p></div>
                            <Badge variant="outline" className="text-xs">{contact.type === 'client' ? 'Client' : 'Staff'}</Badge>
                            {forwardSelectedContact?.id === contact.id && <Check className="w-4 h-4 text-[#007AFF]" />}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {forwardSelectedContact && <p className="text-sm text-muted-foreground mt-2">Sending to <span className="font-medium text-foreground">{forwardSelectedContact.name}</span> ({forwardSelectedContact.phone})</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForwardOpen(false)}>Cancel</Button>
              <Button onClick={handleSendForward} disabled={!forwardSelectedContact || forwardSending} className="gap-2">
                {forwardSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />}{forwardSending ? 'Sending...' : 'Forward'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Confirmation */}
        <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedForBulk.size} conversation{selectedForBulk.size > 1 ? 's' : ''}?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. All messages in the selected conversations will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* New Conversation Dialog (mobile) */}
        {isMobile && (
          <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Start New Conversation</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label className="text-sm font-medium">Contact Type</Label>
                  <Tabs value={conversationType} onValueChange={(v) => { setConversationType(v as 'client' | 'cleaner'); setSelectedContact(null); }} className="mt-2">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="client" className="gap-2"><Users className="h-4 w-4" />Client</TabsTrigger>
                      <TabsTrigger value="cleaner" className="gap-2"><HardHat className="h-4 w-4" />Cleaner</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div>
                  <Label className="text-sm font-medium">Select {conversationType === 'client' ? 'Customer' : 'Staff Member'}</Label>
                  <Command className="border rounded-md mt-2">
                    <CommandInput placeholder={`Search ${conversationType === 'client' ? 'customers' : 'staff'}...`} value={contactSearch} onValueChange={setContactSearch} />
                    <CommandList className="max-h-40">
                      <CommandEmpty>No {conversationType === 'client' ? 'customers' : 'staff'} found.</CommandEmpty>
                      <CommandGroup>
                        {filteredContacts.slice(0, 10).map((contact) => (
                          <CommandItem key={contact.id} value={`${contact.name} ${contact.phone}`} onSelect={() => handleSelectContact(contact)} className="cursor-pointer">
                            <div className="flex items-center gap-2 flex-1">
                              <Avatar className="h-6 w-6"><AvatarFallback className={cn("text-xs", contact.type === 'cleaner' ? "bg-amber-100 text-amber-700" : "bg-[#007AFF]/10 text-[#007AFF]")}>{contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                              <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{contact.name}</p><p className="text-xs text-muted-foreground">{contact.phone}</p></div>
                              {selectedContact?.id === contact.id && <Check className="h-4 w-4 text-[#007AFF]" />}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>
                <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or enter manually</span></div></div>
                <div><Label className="text-sm font-medium">Phone Number</Label><Input placeholder="(555) 123-4567" value={newPhone} onChange={(e) => { setNewPhone(e.target.value); setSelectedContact(null); }} /></div>
                <div><Label className="text-sm font-medium">Name (optional)</Label><Input placeholder="Contact name" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
                <Button onClick={handleStartNewConversation} className="w-full" disabled={!newPhone.trim() && !selectedContact}>Start Conversation</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* iOS-style Long-Press Context Menu */}
        {contextMenuConvId && contextMenuPosition && (
          <>
            <div
              className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
              onClick={() => { setContextMenuConvId(null); setContextMenuPosition(null); }}
            />
            <div
              className="fixed z-[61] bg-white dark:bg-[#2C2C2E] rounded-2xl shadow-2xl overflow-hidden w-[200px]"
              style={{
                left: Math.min(contextMenuPosition.x, window.innerWidth - 220),
                top: Math.min(contextMenuPosition.y, window.innerHeight - 250),
              }}
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-[15px] text-[#1C1C1E] dark:text-white active:bg-[#E5E5EA] dark:active:bg-[#3A3A3C]"
                onClick={() => handleContextAction('pin')}
              >
                <Pin className="h-[18px] w-[18px] text-[#007AFF]" />
                {pinnedIds.has(contextMenuConvId) ? 'Unpin' : 'Pin'}
              </button>
              <div className="h-px bg-[#E5E5EA] dark:bg-[#48484A] mx-4" />
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-[15px] text-[#1C1C1E] dark:text-white active:bg-[#E5E5EA] dark:active:bg-[#3A3A3C]"
                onClick={() => handleContextAction('unread')}
              >
                <MessageCircle className="h-[18px] w-[18px] text-[#007AFF]" />
                Mark as Unread
              </button>
              <div className="h-px bg-[#E5E5EA] dark:bg-[#48484A] mx-4" />
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-[15px] text-[#1C1C1E] dark:text-white active:bg-[#E5E5EA] dark:active:bg-[#3A3A3C]"
                onClick={() => handleContextAction('mute')}
              >
                <BellOff className="h-[18px] w-[18px] text-[#8E8E93]" />
                {mutedIds.has(contextMenuConvId) ? 'Show Alerts' : 'Hide Alerts'}
              </button>
              <div className="h-px bg-[#E5E5EA] dark:bg-[#48484A] mx-4" />
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-[15px] text-[#FF3B30] active:bg-[#E5E5EA] dark:active:bg-[#3A3A3C]"
                onClick={() => handleContextAction('delete')}
              >
                <Trash2 className="h-[18px] w-[18px]" />
                Delete
              </button>
            </div>
          </>
        )}

        {/* Single Delete Confirmation */}
        <AlertDialog open={!!deleteConfirmConvId} onOpenChange={(open) => { if (!open) setDeleteConfirmConvId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. All messages in this conversation will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!deleteConfirmConvId) return;
                  await supabase.from('sms_messages').delete().eq('conversation_id', deleteConfirmConvId);
                  const { error } = await supabase.from('sms_conversations').delete().eq('id', deleteConfirmConvId);
                  if (error) { toast.error('Failed to delete'); return; }
                  setConversations(prev => prev.filter(c => c.id !== deleteConfirmConvId));
                  if (selectedConversation?.id === deleteConfirmConvId) { setSelectedConversation(null); setMessages([]); }
                  setPinnedIds(prev => { const next = new Set(prev); next.delete(deleteConfirmConvId); return next; });
                  toast.success('Conversation deleted');
                  setDeleteConfirmConvId(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SubscriptionGate>
    </AdminLayout>
  );
}
