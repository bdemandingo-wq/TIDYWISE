import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Bell, Building2, CreditCard, AlertTriangle, Sparkles, CalendarCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { TabsContent } from "@/components/ui/tabs";

interface PlatformNotification {
  id: string;
  org_id: string | null;
  notification_type: string;
  sent_to: string;
  message_preview: string | null;
  metadata: Record<string, unknown> | null;
  sent_at: string;
}

const typeConfig: Record<string, { icon: typeof Bell; label: string; emoji: string; color: string }> = {
  new_org: { icon: Building2, label: "New Org", emoji: "🎉", color: "text-green-500" },
  new_subscription: { icon: CreditCard, label: "Subscription", emoji: "💳", color: "text-blue-500" },
  subscription_cancelled: { icon: AlertTriangle, label: "Cancellation", emoji: "⚠️", color: "text-red-500" },
  trial_started: { icon: Sparkles, label: "Trial", emoji: "🆕", color: "text-amber-500" },
  demo_requested: { icon: CalendarCheck, label: "Demo", emoji: "📅", color: "text-purple-500" },
};

export function PlatformNotificationsLog() {
  const { data: notifications, isLoading } = useQuery({
    queryKey: ["platform-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_notifications")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as PlatformNotification[];
    },
  });

  return (
    <TabsContent value="notifications">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Platform Activity Feed
            <Badge variant="secondary" className="ml-auto">
              {notifications?.length || 0} events
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !notifications?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No platform events yet</p>
              <p className="text-xs mt-1">Events will appear here as organizations sign up</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-2">
                {notifications.map((n) => {
                  const config = typeConfig[n.notification_type] || {
                    icon: Bell,
                    label: n.notification_type,
                    emoji: "📌",
                    color: "text-muted-foreground",
                  };
                  const Icon = config.icon;
                  const meta = n.metadata as Record<string, string> | null;

                  return (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                    >
                      <div className={`p-2 rounded-lg bg-background border ${config.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm">{config.emoji}</span>
                          <span className="font-medium text-sm">{n.message_preview || config.label}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {config.label}
                          </Badge>
                        </div>
                        {meta && (
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            {meta.owner_email && <p>Owner: {meta.owner_email}</p>}
                            {meta.plan && <p>Plan: {meta.plan}</p>}
                            {meta.sms_sent !== undefined && (
                              <p>SMS: {String(meta.sms_sent) === "true" ? "✅ Sent" : "❌ Failed"}</p>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.sent_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
