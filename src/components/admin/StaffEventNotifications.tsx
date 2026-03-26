import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, FileText, PenLine, Banknote, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export function StaffEventNotifications() {
  const { organizationId } = useOrgId();

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ['staff-event-notifications', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_event_notifications')
        .select('*, staff:staff_id(name)')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  const markAllRead = async () => {
    if (!organizationId) return;
    await supabase
      .from('staff_event_notifications')
      .update({ is_read: true })
      .eq('organization_id', organizationId)
      .eq('is_read', false);
    refetch();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'document_uploaded': return <FileText className="w-4 h-4 text-blue-400" />;
      case 'document_signed': return <PenLine className="w-4 h-4 text-green-400" />;
      case 'payout_setup': return <Banknote className="w-4 h-4 text-amber-400" />;
      case 'booking_claimed': return <Check className="w-4 h-4 text-emerald-400" />;
      default: return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (notifications.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Staff Activity
            {unreadCount > 0 && (
              <Badge variant="default" className="ml-1">{unreadCount}</Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <Check className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {notifications.slice(0, 20).map((n: any) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-2 rounded-md text-sm ${
                !n.is_read ? 'bg-primary/5 border border-primary/10' : ''
              }`}
            >
              <div className="mt-0.5">{getIcon(n.event_type)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{n.title}</p>
                <p className="text-muted-foreground text-xs truncate">{n.message}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {format(new Date(n.created_at), 'MMM d, h:mm a')}
                </p>
              </div>
              {!n.is_read && (
                <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
