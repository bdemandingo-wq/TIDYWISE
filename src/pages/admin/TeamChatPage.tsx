import { useState, useEffect, useRef } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Users, Hash } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface Message {
  id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  channel: string;
  created_at: string;
}

const CHANNELS = [
  { id: 'general', name: 'General', icon: Hash },
  { id: 'jobs', name: 'Jobs', icon: Hash },
  { id: 'announcements', name: 'Announcements', icon: Hash },
];

export default function TeamChatPage() {
  const [activeChannel, setActiveChannel] = useState('general');
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['team-messages', activeChannel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_messages')
        .select('*')
        .eq('channel', activeChannel)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return data as Message[];
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, user_id')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const { error } = await supabase.from('team_messages').insert({
        sender_id: user?.id || '',
        sender_type: 'admin',
        message,
        channel: activeChannel,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-messages', activeChannel] });
      setNewMessage('');
    },
  });

  // Subscribe to realtime messages
  useEffect(() => {
    const channel = supabase
      .channel('team-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
          filter: `channel=eq.${activeChannel}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['team-messages', activeChannel] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannel, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    sendMutation.mutate(newMessage);
  };

  const getSenderName = (senderId: string, senderType: string) => {
    if (senderType === 'admin') return 'Admin';
    const staff = staffList.find(s => s.user_id === senderId);
    return staff?.name || 'Staff';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <AdminLayout
      title="Team Chat"
      subtitle="Real-time team communication"
    >
      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* Channels Sidebar */}
        <Card className="w-64 flex-shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Channels
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeChannel === channel.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <channel.icon className="w-4 h-4" />
                {channel.name}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Hash className="w-5 h-5" />
              {CHANNELS.find(c => c.id === activeChannel)?.name}
            </CardTitle>
          </CardHeader>
          
          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {isLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No messages yet. Start the conversation!
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  const senderName = getSenderName(msg.sender_id, msg.sender_type);
                  const isOwn = msg.sender_id === user?.id;
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className={isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'}>
                          {getInitials(senderName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`max-w-[70%] ${isOwn ? 'text-right' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{senderName}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(msg.created_at), 'h:mm a')}
                          </span>
                        </div>
                        <div
                          className={`inline-block px-3 py-2 rounded-lg ${
                            isOwn
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          {msg.message}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Message #${CHANNELS.find(c => c.id === activeChannel)?.name.toLowerCase()}`}
                className="flex-1"
              />
              <Button type="submit" disabled={!newMessage.trim() || sendMutation.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}