import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, Users, Building2, CreditCard, TrendingUp, 
  UserPlus, RefreshCw, Trash2, Activity, Calendar,
  ArrowUpRight, ArrowDownRight, Clock, Timer
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';

interface PlatformAnalytics {
  signups: {
    total: number;
    recent: { id: string; email: string; created_at: string }[];
    last30Days: number;
  };
  organizations: {
    total: number;
    recent: { id: string; name: string; created_at: string }[];
    last30Days: number;
  };
  subscriptions: {
    active: number;
    trialing: number;
    canceled: number;
    list: { id: string; customer_email: string; status: string; created: string; current_period_end: string }[];
  };
}

interface UserSessionStats {
  user_id: string;
  user_email: string;
  total_duration_seconds: number;
  session_count: number;
}

// Helper to format seconds into human readable time
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function PlatformAnalyticsPage() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'user' | 'organization'; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch session data for the last 30 days
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
  
  const { data: sessionStats, refetch: refetchSessions } = useQuery({
    queryKey: ['platform-session-stats'],
    queryFn: async () => {
      // IMPORTANT:
      // Client-side querying can silently truncate at 1000 rows.
      // Use a backend function that paginates & aggregates server-side.
      const { data, error } = await supabase.functions.invoke('platform-session-stats', {
        body: { days: 30 },
      });

      if (error) throw error;

      return {
        avgSessionDuration: data?.avgSessionDuration ?? 0,
        totalSessions: data?.totalSessions ?? 0,
        userList: (data?.userList ?? []) as UserSessionStats[],
      };
    },
    enabled: user?.email === 'support@tidywisecleaning.com',
  });

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('platform-analytics');
      if (error) throw error;
      setAnalytics(data);
    } catch (err: any) {
      console.error('Error fetching platform analytics:', err);
      setError(err.message || 'Failed to load analytics');
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-platform-account', {
        body: { userId: itemToDelete.id, type: itemToDelete.type }
      });
      
      if (error || data?.error) {
        const errorMessage = data?.error || error?.message || 'Failed to delete';
        toast.error(errorMessage);
        return;
      }
      
      toast.success(`${itemToDelete.type === 'user' ? 'User' : 'Organization'} deleted successfully`);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchAnalytics();
      refetchSessions();
    } catch (err: any) {
      console.error('Error deleting:', err);
      toast.error(err.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteDialog = (id: string, type: 'user' | 'organization', name: string) => {
    setItemToDelete({ id, type, name });
    setDeleteDialogOpen(true);
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Check if user is platform admin
  if (user?.email !== 'support@tidywisecleaning.com') {
    return (
      <AdminLayout title="Unauthorized" subtitle="You don't have access to this page">
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">This page is only accessible to platform administrators.</p>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  if (loading) {
    return (
      <AdminLayout title="Platform Analytics" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading platform data...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Platform Analytics" subtitle="Error loading data">
        <Card className="border-destructive/20">
          <CardContent className="py-12 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchAnalytics}>Try Again</Button>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  const conversionRate = analytics?.signups.total 
    ? Math.round(((analytics.subscriptions.active + analytics.subscriptions.trialing) / analytics.signups.total) * 100) 
    : 0;

  return (
    <AdminLayout
      title="Platform Analytics"
      subtitle="Monitor signups, organizations, and subscriptions"
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <span className="text-sm text-muted-foreground">
              Last updated: {format(new Date(), 'MMM d, h:mm a')}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchAnalytics(); refetchSessions(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Signups</CardTitle>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{analytics?.signups.total || 0}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowUpRight className="w-3 h-3 text-green-500" />
                <span className="text-xs text-green-500 font-medium">+{analytics?.signups.last30Days || 0}</span>
                <span className="text-xs text-muted-foreground">last 30 days</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-bl-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Organizations</CardTitle>
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Building2 className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{analytics?.organizations.total || 0}</div>
              <div className="flex items-center gap-1 mt-1">
                <ArrowUpRight className="w-3 h-3 text-green-500" />
                <span className="text-xs text-green-500 font-medium">+{analytics?.organizations.last30Days || 0}</span>
                <span className="text-xs text-muted-foreground">last 30 days</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-green-500/10 to-transparent rounded-bl-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscriptions</CardTitle>
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CreditCard className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{analytics?.subscriptions.active || 0}</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-blue-500 font-medium">{analytics?.subscriptions.trialing || 0} trialing</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-red-500">{analytics?.subscriptions.canceled || 0} canceled</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{conversionRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Signups → Subscriptions
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="signups" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="signups" className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Signups ({analytics?.signups.recent?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="organizations" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Organizations ({analytics?.organizations.recent?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Subscriptions ({analytics?.subscriptions.list?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              User Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signups">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  Recent Signups
                  <Badge variant="secondary" className="ml-auto">Last 30 days</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  {analytics?.signups.recent && analytics.signups.recent.length > 0 ? (
                    <div className="space-y-2">
                      {analytics.signups.recent.map((signup) => (
                        <div 
                          key={signup.id} 
                          className="group flex items-center justify-between p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-medium text-primary">
                                {signup.email?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">{signup.email}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDistanceToNow(new Date(signup.created_at), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {format(new Date(signup.created_at), 'MMM d')}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => openDeleteDialog(signup.id, 'user', signup.email)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No recent signups</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="organizations">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-500" />
                  Recent Organizations
                  <Badge variant="secondary" className="ml-auto">Last 30 days</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  {analytics?.organizations.recent && analytics.organizations.recent.length > 0 ? (
                    <div className="space-y-2">
                      {analytics.organizations.recent.map((org) => (
                        <div 
                          key={org.id} 
                          className="group flex items-center justify-between p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{org.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {format(new Date(org.created_at), 'MMM d')}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => openDeleteDialog(org.id, 'organization', org.name)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No recent organizations</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscriptions">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-green-500" />
                  All Subscriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Subscription Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <p className="text-2xl font-bold text-green-600">{analytics?.subscriptions.active || 0}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <p className="text-2xl font-bold text-blue-600">{analytics?.subscriptions.trialing || 0}</p>
                    <p className="text-xs text-muted-foreground">Trialing</p>
                  </div>
                  <div className="text-center p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                    <p className="text-2xl font-bold text-red-600">{analytics?.subscriptions.canceled || 0}</p>
                    <p className="text-xs text-muted-foreground">Canceled</p>
                  </div>
                </div>

                <ScrollArea className="h-[320px] pr-4">
                  {analytics?.subscriptions.list && analytics.subscriptions.list.length > 0 ? (
                    <div className="space-y-2">
                      {analytics.subscriptions.list.map((sub) => (
                        <div 
                          key={sub.id} 
                          className="flex items-center justify-between p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              sub.status === 'active' ? 'bg-green-500/10' : 
                              sub.status === 'trialing' ? 'bg-blue-500/10' : 'bg-red-500/10'
                            }`}>
                              <CreditCard className={`w-5 h-5 ${
                                sub.status === 'active' ? 'text-green-500' : 
                                sub.status === 'trialing' ? 'text-blue-500' : 'text-red-500'
                              }`} />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{sub.customer_email}</p>
                              <p className="text-xs text-muted-foreground">
                                Created: {sub.created !== 'Unknown' ? format(new Date(sub.created), 'MMM d, yyyy') : 'Unknown'}
                              </p>
                            </div>
                          </div>
                          <Badge 
                            variant={sub.status === 'active' ? 'default' : sub.status === 'trialing' ? 'secondary' : 'destructive'}
                            className="capitalize"
                          >
                            {sub.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No subscriptions found</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-500" />
                  User Activity Tracking
                  <Badge variant="secondary" className="ml-auto">Live</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Activity Stats */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                      <p className="text-2xl font-bold text-purple-600">{analytics?.signups.last30Days || 0}</p>
                      <p className="text-xs text-muted-foreground">Active Users (30d)</p>
                    </div>
                    <div className="text-center p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <p className="text-2xl font-bold text-blue-600">
                        {Math.round(((analytics?.subscriptions.active || 0) / Math.max(1, analytics?.signups.total || 1)) * 100)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Engagement Rate</p>
                    </div>
                    <div className="text-center p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                      <div className="flex items-center justify-center gap-1">
                        <Timer className="w-4 h-4 text-green-600" />
                        <p className="text-2xl font-bold text-green-600">
                          {formatDuration(sessionStats?.avgSessionDuration || 0)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">Avg Session Duration</p>
                    </div>
                    <div className="text-center p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <p className="text-2xl font-bold text-amber-600">
                        {sessionStats?.totalSessions || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Sessions (30d)</p>
                    </div>
                  </div>

                  {/* Most Active Users */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      Most Active Users
                      <span className="text-xs text-muted-foreground ml-auto">By time spent (30 days)</span>
                    </h4>
                    <ScrollArea className="h-[280px] pr-4">
                      {sessionStats?.userList && sessionStats.userList.length > 0 ? (
                        <div className="space-y-2">
                          {sessionStats.userList.slice(0, 15).map((userStat, index) => (
                            <div 
                              key={userStat.user_id} 
                              className="flex items-center justify-between p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  index === 0 ? 'bg-yellow-500/20 text-yellow-600' :
                                  index === 1 ? 'bg-gray-300/30 text-gray-600' :
                                  index === 2 ? 'bg-amber-600/20 text-amber-700' :
                                  'bg-primary/10 text-primary'
                                }`}>
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{userStat.user_email}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {userStat.session_count} session{userStat.session_count !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDuration(userStat.total_duration_seconds)}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>No session data available yet</p>
                          <p className="text-xs mt-1">Sessions are tracked as users browse the app</p>
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {itemToDelete?.type === 'user' ? 'User' : 'Organization'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{itemToDelete?.name}</strong>? 
              This action cannot be undone and will permanently remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
