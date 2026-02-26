import { useState, useEffect, useRef } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  MessageSquare, 
  Send, 
  Search, 
  Plus, 
  Phone, 
  User,
  Loader2,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  HardHat,
  CheckSquare,
  Square,
  X,
  PanelLeftClose,
  PanelLeft,
  Check,
  Mail,
  Link,
  Paperclip,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { handleSmsError } from '@/lib/smsErrorHandler';
import { useIsMobile } from '@/hooks/use-mobile';
import { MessageTemplatesPicker } from '@/components/admin/MessageTemplatesPicker';

interface Conversation {
  id: string;
  customer_id: string | null;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  unread_count: number;
  conversation_type?: string;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  sent_at: string;
  status: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  type: 'client' | 'cleaner';
}

type ConversationTab = 'all' | 'clients' | 'cleaners';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showConversationList, setShowConversationList] = useState(false);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<{ name: string; content: string; type: string }[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const emailBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Fetch contacts (customers and staff) for the contact picker
  const fetchContacts = async () => {
    if (!organizationId) return;
    
    const [customersRes, staffRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id, first_name, last_name, phone')
        .eq('organization_id', organizationId)
        .not('phone', 'is', null),
      supabase
        .from('staff')
        .select('id, name, phone')
        .eq('organization_id', organizationId)
        .not('phone', 'is', null)
    ]);

    const customerContacts: Contact[] = (customersRes.data || [])
      .filter(c => c.phone)
      .map(c => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        phone: c.phone!,
        type: 'client' as const
      }));

    const staffContacts: Contact[] = (staffRes.data || [])
      .filter(s => s.phone)
      .map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone!,
        type: 'cleaner' as const
      }));

    setContacts([...customerContacts, ...staffContacts]);
  };

  useEffect(() => {
    if (organizationId) {
      fetchConversations();
      fetchContacts();

      // Subscribe to realtime updates for incoming messages
      const channel = supabase
        .channel('sms-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'sms_messages',
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            console.log('New message received:', payload);
            const newMsg = payload.new as any;
            
            // If it's for the selected conversation, add to messages
            if (selectedConversation && newMsg.conversation_id === selectedConversation.id) {
              setMessages(prev => [...prev, {
                id: newMsg.id,
                direction: newMsg.direction as 'inbound' | 'outbound',
                content: newMsg.content,
                sent_at: newMsg.sent_at,
                status: newMsg.status,
              }]);
            }
            
            // Show in-app notification for inbound messages (client texted)
            if (newMsg.direction === 'inbound') {
              toast.info('New message received', {
                description: newMsg.content?.substring(0, 50) + (newMsg.content?.length > 50 ? '...' : ''),
                action: {
                  label: 'View',
                  onClick: () => {
                    // Find and select the conversation
                    const conv = conversations.find(c => c.id === newMsg.conversation_id);
                    if (conv) setSelectedConversation(conv);
                  }
                }
              });
            }
            
            // Refresh conversations to update unread counts
            fetchConversations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [organizationId, selectedConversation?.id]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sms_conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      toast.error('Failed to load conversations');
    } else {
      setConversations(data || []);
    }
    setLoading(false);
  };

  const fetchMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages((data || []).map(msg => ({
        ...msg,
        direction: msg.direction as 'inbound' | 'outbound'
      })));
      
      // Mark as read
      await supabase
        .from('sms_conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !organizationId) return;

    setSending(true);
    try {
      // Send via edge function
      const response = await supabase.functions.invoke('send-openphone-sms', {
        body: {
          to: selectedConversation.customer_phone,
          message: newMessage.trim(),
          organizationId
        }
      });

      // Handle SMS-specific errors with user-friendly messages
      if (handleSmsError(response)) {
        return;
      }

      // Save to database
      const { error: insertError } = await supabase
        .from('sms_messages')
        .insert({
          conversation_id: selectedConversation.id,
          organization_id: organizationId,
          direction: 'outbound',
          content: newMessage.trim(),
          status: 'sent',
          openphone_message_id: response.data?.messageId
        });

      if (insertError) throw insertError;

      // Update conversation
      await supabase
        .from('sms_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedConversation.id);

      setNewMessage('');
      fetchMessages(selectedConversation.id);
      toast.success('Message sent');
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStartNewConversation = async () => {
    const phoneToUse = selectedContact?.phone || newPhone.trim();
    const nameToUse = selectedContact?.name || newName.trim();
    const typeToUse = selectedContact?.type || conversationType;
    
    if (!phoneToUse || !organizationId) return;

    // Format phone number
    const formattedPhone = phoneToUse.replace(/\D/g, '');
    const phoneWithCountry = formattedPhone.startsWith('1') ? `+${formattedPhone}` : `+1${formattedPhone}`;

    // Check if conversation exists
    const { data: existing } = await supabase
      .from('sms_conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('customer_phone', phoneWithCountry)
      .maybeSingle();

    if (existing) {
      setSelectedConversation(existing);
      resetNewConversationState();
      return;
    }

    // Create new conversation
    const { data, error } = await supabase
      .from('sms_conversations')
      .insert({
        organization_id: organizationId,
        customer_phone: phoneWithCountry,
        customer_name: nameToUse || null,
        conversation_type: typeToUse
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create conversation');
      return;
    }

    setConversations([data, ...conversations]);
    setSelectedConversation(data);
    resetNewConversationState();
  };

  const resetNewConversationState = () => {
    setNewConversationOpen(false);
    setNewPhone('');
    setNewName('');
    setConversationType('client');
    setSelectedContact(null);
    setContactSearch('');
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setNewPhone(contact.phone);
    setNewName(contact.name);
    setConversationType(contact.type);
  };

  const filteredContacts = contacts.filter(c => {
    const matchesType = conversationType === 'client' ? c.type === 'client' : c.type === 'cleaner';
    const matchesSearch = contactSearch === '' || 
      c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.phone.includes(contactSearch);
    return matchesType && matchesSearch;
  });

  const handleUpdateCustomerName = async () => {
    if (!selectedConversation) return;
    
    const { error } = await supabase
      .from('sms_conversations')
      .update({ customer_name: editingName.trim() || null })
      .eq('id', selectedConversation.id);
    
    if (error) {
      toast.error('Failed to update name');
      return;
    }
    
    setConversations(prev => prev.map(c => 
      c.id === selectedConversation.id 
        ? { ...c, customer_name: editingName.trim() || null }
        : c
    ));
    setSelectedConversation(prev => prev ? { ...prev, customer_name: editingName.trim() || null } : null);
    setEditNameOpen(false);
    toast.success('Name updated');
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!confirm('Delete this conversation and all messages?')) return;
    
    // Delete messages first
    await supabase.from('sms_messages').delete().eq('conversation_id', convId);
    // Then delete conversation
    const { error } = await supabase.from('sms_conversations').delete().eq('id', convId);
    
    if (error) {
      toast.error('Failed to delete conversation');
      return;
    }
    
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selectedConversation?.id === convId) {
      setSelectedConversation(null);
      setMessages([]);
    }
    toast.success('Conversation deleted');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} conversation(s) and all their messages?`)) return;
    
    setBulkDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);
      
      // Delete messages first
      await supabase.from('sms_messages').delete().in('conversation_id', idsArray);
      // Then delete conversations
      const { error } = await supabase.from('sms_conversations').delete().in('id', idsArray);
      
      if (error) throw error;
      
      setConversations(prev => prev.filter(c => !selectedIds.has(c.id)));
      if (selectedConversation && selectedIds.has(selectedConversation.id)) {
        setSelectedConversation(null);
        setMessages([]);
      }
      setSelectedIds(new Set());
      toast.success(`${idsArray.length} conversation(s) deleted`);
    } catch (error) {
      console.error('Error bulk deleting:', error);
      toast.error('Failed to delete conversations');
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelectConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
      } else {
        next.add(convId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredConversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredConversations.map(c => c.id)));
    }
  };

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.customer_phone.includes(searchQuery);
    
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'clients') return matchesSearch && conv.conversation_type !== 'cleaner';
    if (activeTab === 'cleaners') return matchesSearch && conv.conversation_type === 'cleaner';
    return matchesSearch;
  });

  const handleSendEmail = async () => {
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim() || !organizationId) return;

    setEmailSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-direct-email', {
        body: {
          organizationId,
          to: emailTo.trim(),
          subject: emailSubject.trim(),
          body: getEmailHtmlBody(),
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast.success('Email sent successfully');
      setEmailOpen(false);
      setEmailTo('');
      setEmailSubject('');
      setEmailBody('');
      setEmailAttachments([]);
      if (emailBodyRef.current) emailBodyRef.current.innerHTML = '';
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  };

  const handleInsertLink = () => {
    if (!linkUrl.trim()) return;
    const display = linkText.trim() || linkUrl.trim();
    
    const editor = emailBodyRef.current;
    if (editor) {
      editor.focus();
      // Insert a styled anchor element at cursor
      const linkEl = `<a href="${linkUrl.trim()}" style="color: hsl(var(--primary)); text-decoration: underline;" contenteditable="false">${display}</a>&nbsp;`;
      document.execCommand('insertHTML', false, linkEl);
      // Sync state
      setEmailBody(editor.innerHTML);
    }
    
    setLinkUrl('');
    setLinkText('');
    setLinkPopoverOpen(false);
  };

  /** Extract the HTML content from the editable div for sending */
  const getEmailHtmlBody = (): string => {
    if (!emailBodyRef.current) return emailBody;
    // Get the innerHTML which already has proper <a> tags
    let html = emailBodyRef.current.innerHTML;
    // Remove contenteditable="false" from links for the final email
    html = html.replace(/\s*contenteditable="false"/g, '');
    // Convert line breaks
    html = html.replace(/<div><br><\/div>/g, '<br>');
    html = html.replace(/<div>/g, '<br>');
    html = html.replace(/<\/div>/g, '');
    return html;
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`File "${file.name}" is too large (max 10MB)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setEmailAttachments(prev => [...prev, { 
          name: file.name, 
          content: base64, 
          type: file.type 
        }]);
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setEmailAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return phone.slice(-2);
  };

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowConversationList(false);
  };

  const renderConversationList = () => (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ConversationTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="clients" className="gap-1">
              <Users className="h-3 w-3" />
              Clients
            </TabsTrigger>
            <TabsTrigger value="cleaners" className="gap-1">
              <HardHat className="h-3 w-3" />
              Cleaners
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      
      {/* Bulk Delete Bar */}
      {selectedIds.size > 0 && (
        <div className="p-2 border-b bg-muted/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Checkbox 
              checked={selectedIds.size === filteredConversations.length}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Delete
            </Button>
          </div>
        </div>
      )}
      
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start a new message to begin</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "w-full p-3 text-left hover:bg-muted/50 transition-colors flex items-start gap-2",
                  selectedConversation?.id === conv.id && "bg-muted"
                )}
              >
                <div 
                  className="pt-1"
                  onClick={(e) => toggleSelectConversation(conv.id, e)}
                >
                  <Checkbox 
                    checked={selectedIds.has(conv.id)}
                    onCheckedChange={() => {}}
                  />
                </div>
                <button
                  onClick={() => handleSelectConversation(conv)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={cn(
                        "text-sm",
                        conv.conversation_type === 'cleaner' 
                          ? "bg-amber-100 text-amber-700" 
                          : "bg-primary/10 text-primary"
                      )}>
                        {conv.conversation_type === 'cleaner' 
                          ? <HardHat className="h-4 w-4" />
                          : getInitials(conv.customer_name, conv.customer_phone)
                        }
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {conv.customer_name ? (
                            <p className="font-medium truncate">
                              {conv.customer_name}
                            </p>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="text-muted-foreground truncate">
                                {conv.customer_phone}
                              </p>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-5 px-2 text-[10px] border-primary/50 text-primary hover:bg-primary/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedConversation(conv);
                                  setEditingName('');
                                  setEditNameOpen(true);
                                }}
                              >
                                Set Name
                              </Button>
                            </div>
                          )}
                          {conv.conversation_type === 'cleaner' && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              Cleaner
                            </Badge>
                          )}
                        </div>
                        {conv.unread_count > 0 && (
                          <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                            {conv.unread_count}
                          </Badge>
                        )}
                      </div>
                      {conv.customer_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.customer_phone}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(conv.last_message_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <AdminLayout 
      title="Messages" 
      subtitle="Text & email your customers"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchConversations}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Message
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start New Conversation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label className="text-sm font-medium">Contact Type</Label>
                  <Tabs 
                    value={conversationType} 
                    onValueChange={(v) => {
                      setConversationType(v as 'client' | 'cleaner');
                      setSelectedContact(null);
                    }} 
                    className="mt-2"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="client" className="gap-2">
                        <Users className="h-4 w-4" />
                        Client
                      </TabsTrigger>
                      <TabsTrigger value="cleaner" className="gap-2">
                        <HardHat className="h-4 w-4" />
                        Cleaner
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                
                {/* Contact Picker */}
                <div>
                  <Label className="text-sm font-medium">
                    Select {conversationType === 'client' ? 'Customer' : 'Staff Member'}
                  </Label>
                  <Command className="border rounded-md mt-2">
                    <CommandInput 
                      placeholder={`Search ${conversationType === 'client' ? 'customers' : 'staff'}...`}
                      value={contactSearch}
                      onValueChange={setContactSearch}
                    />
                    <CommandList className="max-h-40">
                      <CommandEmpty>
                        No {conversationType === 'client' ? 'customers' : 'staff'} found.
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredContacts.slice(0, 10).map((contact) => (
                          <CommandItem
                            key={contact.id}
                            value={`${contact.name} ${contact.phone}`}
                            onSelect={() => handleSelectContact(contact)}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className={cn(
                                  "text-xs",
                                  contact.type === 'cleaner' 
                                    ? "bg-amber-100 text-amber-700" 
                                    : "bg-primary/10 text-primary"
                                )}>
                                  {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{contact.name}</p>
                                <p className="text-xs text-muted-foreground">{contact.phone}</p>
                              </div>
                              {selectedContact?.id === contact.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or enter manually</span>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Phone Number</Label>
                  <Input
                    placeholder="(555) 123-4567"
                    value={newPhone}
                    onChange={(e) => {
                      setNewPhone(e.target.value);
                      setSelectedContact(null);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Name (optional)</Label>
                  <Input
                    placeholder="Contact name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={handleStartNewConversation} 
                  className="w-full"
                  disabled={!newPhone.trim() && !selectedContact}
                >
                  Start Conversation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Compose Email</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>To</Label>
                  <Input
                    type="email"
                    placeholder="recipient@example.com"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Subject</Label>
                  <Input
                    placeholder="Email subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Message</Label>
                    <div className="flex items-center gap-1">
                      {organizationId && (
                        <MessageTemplatesPicker
                          organizationId={organizationId}
                          onSelect={(content) => {
                            setEmailBody(content);
                            if (emailBodyRef.current) emailBodyRef.current.innerText = content;
                          }}
                        />
                      )}
                      <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Insert link">
                            <Link className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 space-y-3" align="end">
                          <p className="text-sm font-medium">Insert Link</p>
                          <div className="space-y-2">
                            <Input
                              placeholder="https://example.com"
                              value={linkUrl}
                              onChange={(e) => setLinkUrl(e.target.value)}
                            />
                            <Input
                              placeholder="Display text (optional)"
                              value={linkText}
                              onChange={(e) => setLinkText(e.target.value)}
                            />
                          </div>
                          <Button size="sm" className="w-full" onClick={handleInsertLink} disabled={!linkUrl.trim()}>
                            Insert
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div
                    ref={emailBodyRef}
                    contentEditable
                    onInput={() => {
                      if (emailBodyRef.current) {
                        setEmailBody(emailBodyRef.current.innerHTML);
                      }
                    }}
                    className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 overflow-y-auto whitespace-pre-wrap"
                    style={{ maxHeight: '200px' }}
                    data-placeholder="Type your email message..."
                     suppressContentEditableWarning
                   />
                </div>
                {/* Attachments */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileAttach}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="h-4 w-4" />
                    Attach File
                  </Button>
                  {emailAttachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {emailAttachments.map((att, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
                          <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{att.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 shrink-0"
                            onClick={() => removeAttachment(i)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={emailSending || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()}
                  className="gap-2"
                >
                  {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Email
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex h-[calc(100vh-12rem)] border rounded-lg overflow-hidden bg-card">
        {/* Conversation List - Hidden on mobile, shown in sheet */}
        {isMobile ? (
          <Sheet open={showConversationList} onOpenChange={setShowConversationList}>
            <SheetTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="absolute top-4 left-4 z-10 md:hidden"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Conversations
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[320px] p-0">
              {renderConversationList()}
            </SheetContent>
          </Sheet>
        ) : (
          <div className={cn(
            "border-r flex flex-col transition-all duration-300 relative",
            isListCollapsed ? "w-0 overflow-hidden" : "w-80"
          )}>
            {renderConversationList()}
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border bg-background shadow-sm z-10"
              onClick={() => setIsListCollapsed(true)}
            >
              <PanelLeftClose className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Expand button when collapsed */}
        {!isMobile && isListCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border bg-background shadow-sm z-10"
            onClick={() => setIsListCollapsed(false)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={cn(
                      "text-primary",
                      selectedConversation.conversation_type === 'cleaner' 
                        ? "bg-amber-100" 
                        : "bg-primary/10"
                    )}>
                      {selectedConversation.conversation_type === 'cleaner' 
                        ? <HardHat className="h-5 w-5 text-amber-600" />
                        : getInitials(selectedConversation.customer_name, selectedConversation.customer_phone)
                      }
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    {selectedConversation.customer_name ? (
                      <p className="font-medium">
                        {selectedConversation.customer_name}
                      </p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-muted-foreground">Unknown Contact</p>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-6 px-2 text-xs border-amber-400 text-amber-600 hover:bg-amber-50"
                          onClick={() => {
                            setEditingName('');
                            setEditNameOpen(true);
                          }}
                        >
                          Set Name
                        </Button>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedConversation.customer_phone}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      setEditingName(selectedConversation.customer_name || '');
                      setEditNameOpen(true);
                    }}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Name
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => handleDeleteConversation(selectedConversation.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Conversation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Edit Name Dialog */}
              <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Contact Name</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <Label>Name</Label>
                    <Input 
                      value={editingName} 
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder="Enter contact name"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditNameOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateCustomerName}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg px-4 py-2",
                          msg.direction === 'outbound'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={cn(
                          "text-xs mt-1",
                          msg.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        )}>
                          {format(new Date(msg.sent_at), 'h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  {organizationId && (
                    <MessageTemplatesPicker
                      organizationId={organizationId}
                      onSelect={(content) => setNewMessage(content)}
                    />
                  )}
                  <Textarea
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="min-h-[44px] max-h-32 resize-none"
                    rows={1}
                  />
                  <Button 
                    onClick={handleSendMessage} 
                    disabled={!newMessage.trim() || sending}
                    size="icon"
                    className="h-11 w-11"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Choose a conversation from the list or start a new one to begin messaging your customers.
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
