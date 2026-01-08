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
import { supabase } from '@/integrations/supabase/client';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (organizationId) {
      fetchConversations();

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
      const { data, error } = await supabase.functions.invoke('send-openphone-sms', {
        body: {
          to: selectedConversation.customer_phone,
          message: newMessage.trim(),
          organizationId
        }
      });

      if (error) throw error;

      // Save to database
      const { error: insertError } = await supabase
        .from('sms_messages')
        .insert({
          conversation_id: selectedConversation.id,
          organization_id: organizationId,
          direction: 'outbound',
          content: newMessage.trim(),
          status: 'sent',
          openphone_message_id: data?.messageId
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
    if (!newPhone.trim() || !organizationId) return;

    // Format phone number
    const formattedPhone = newPhone.replace(/\D/g, '');
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
      setNewConversationOpen(false);
      setNewPhone('');
      setNewName('');
      return;
    }

    // Create new conversation
    const { data, error } = await supabase
      .from('sms_conversations')
      .insert({
        organization_id: organizationId,
        customer_phone: phoneWithCountry,
        customer_name: newName.trim() || null,
        conversation_type: conversationType
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create conversation');
      return;
    }

    setConversations([data, ...conversations]);
    setSelectedConversation(data);
    setNewConversationOpen(false);
    setNewPhone('');
    setNewName('');
    setConversationType('client');
  };

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

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.customer_phone.includes(searchQuery);
    
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'clients') return matchesSearch && conv.conversation_type !== 'cleaner';
    if (activeTab === 'cleaners') return matchesSearch && conv.conversation_type === 'cleaner';
    return matchesSearch;
  });

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return phone.slice(-2);
  };

  return (
    <AdminLayout 
      title="Messages" 
      subtitle="Text your customers via OpenPhone"
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
                  <Tabs value={conversationType} onValueChange={(v) => setConversationType(v as 'client' | 'cleaner')} className="mt-2">
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
                <div>
                  <Label className="text-sm font-medium">Phone Number</Label>
                  <Input
                    placeholder="(555) 123-4567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
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
                <Button onClick={handleStartNewConversation} className="w-full">
                  Start Conversation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="flex h-[calc(100vh-12rem)] border rounded-lg overflow-hidden bg-card">
        {/* Conversation List */}
        <div className="w-80 border-r flex flex-col">
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
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={cn(
                      "w-full p-3 text-left hover:bg-muted/50 transition-colors",
                      selectedConversation?.id === conv.id && "bg-muted"
                    )}
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
                            <p className="font-medium truncate">
                              {conv.customer_name || conv.customer_phone}
                            </p>
                            {conv.conversation_type === 'cleaner' && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-300 text-amber-600">
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
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.customer_phone}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(conv.last_message_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

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
                    <p className="font-medium">
                      {selectedConversation.customer_name || selectedConversation.customer_phone}
                    </p>
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
