import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Gift, DollarSign, Send, Copy, Check, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function ReferralsPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [referredEmail, setReferredEmail] = useState('');
  const [referredName, setReferredName] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Fetch referrals
  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['referrals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Fetch customers for dropdown
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email')
        .order('first_name');
      if (error) throw error;
      return data;
    }
  });

  // Create referral mutation
  const createReferral = useMutation({
    mutationFn: async (data: { customerId: string; email: string; name: string }) => {
      const referralCode = `REF${Date.now().toString(36).toUpperCase()}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { data: referral, error } = await supabase
        .from('referrals')
        .insert({
          referrer_customer_id: data.customerId,
          referred_email: data.email,
          referred_name: data.name,
          referral_code: referralCode,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Send invite email
      await supabase.functions.invoke('send-referral-invite', {
        body: { referralId: referral.id }
      });

      return referral;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      toast.success('Referral invite sent!');
      setIsDialogOpen(false);
      setSelectedCustomer('');
      setReferredEmail('');
      setReferredName('');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create referral: ${error.message}`);
    }
  });

  // Stats
  const stats = {
    totalReferrals: referrals.length,
    completedReferrals: referrals.filter(r => r.status === 'completed').length,
    pendingReferrals: referrals.filter(r => r.status === 'pending').length,
    totalCreditsAwarded: referrals
      .filter(r => r.credit_awarded)
      .reduce((sum, r) => sum + Number(r.credit_amount || 0), 0) * 2 // Both referrer and referred get credit
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-warning/20 text-warning',
      signed_up: 'bg-info/20 text-info',
      completed: 'bg-success/20 text-success',
      expired: 'bg-muted text-muted-foreground'
    };
    return <Badge className={styles[status] || ''}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <AdminLayout title="Referral Program" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Referral Program"
      subtitle="Track customer referrals and rewards"
      actions={
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Send className="w-4 h-4" />
              Send Referral Invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Referral Invite</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Referring Customer</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name} ({c.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Friend's Email</Label>
                <Input
                  type="email"
                  placeholder="friend@example.com"
                  value={referredEmail}
                  onChange={e => setReferredEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Friend's Name (optional)</Label>
                <Input
                  placeholder="John Doe"
                  value={referredName}
                  onChange={e => setReferredName(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createReferral.mutate({
                  customerId: selectedCustomer,
                  email: referredEmail,
                  name: referredName
                })}
                disabled={!selectedCustomer || !referredEmail || createReferral.isPending}
              >
                {createReferral.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Send Invite
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Referrals</p>
              <p className="text-2xl font-bold">{stats.totalReferrals}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Check className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{stats.completedReferrals}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <Send className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{stats.pendingReferrals}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10">
              <DollarSign className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Credits Awarded</p>
              <p className="text-2xl font-bold">${stats.totalCreditsAwarded}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* How it works */}
      <Card className="p-6 mb-6 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full bg-primary/20">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-2">How the Referral Program Works</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Customer refers a friend via email with a unique code</li>
              <li>• Friend receives $25 credit on their first booking</li>
              <li>• Referring customer gets $25 credit when friend completes first booking</li>
              <li>• Referral codes expire after 30 days</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Referrals Table */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">All Referrals</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="pb-3 font-medium text-muted-foreground">Referrer</th>
                <th className="pb-3 font-medium text-muted-foreground">Referred</th>
                <th className="pb-3 font-medium text-muted-foreground">Code</th>
                <th className="pb-3 font-medium text-muted-foreground">Status</th>
                <th className="pb-3 font-medium text-muted-foreground text-right">Credit</th>
                <th className="pb-3 font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No referrals yet. Send your first invite!
                  </td>
                </tr>
              ) : (
                  referrals.map(referral => (
                  <tr key={referral.id} className="border-b border-border/50">
                    <td className="py-3">
                      <p className="text-sm text-muted-foreground">
                        Customer ID: {referral.referrer_customer_id?.slice(0, 8)}...
                      </p>
                    </td>
                    <td className="py-3">
                      <div>
                        <p className="font-medium">{referral.referred_name || 'Pending'}</p>
                        <p className="text-sm text-muted-foreground">{referral.referred_email}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-1 rounded text-sm">{referral.referral_code}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyCode(referral.referral_code)}
                        >
                          {copiedCode === referral.referral_code ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </td>
                    <td className="py-3">{getStatusBadge(referral.status)}</td>
                    <td className="py-3 text-right font-semibold text-success">
                      ${referral.credit_amount}
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {format(new Date(referral.created_at), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminLayout>
  );
}
