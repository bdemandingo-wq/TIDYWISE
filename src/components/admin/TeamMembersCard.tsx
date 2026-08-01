import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgRole } from '@/hooks/useOrgRole';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Trash2, Mail } from 'lucide-react';

type Role = 'owner' | 'manager';

const roleDesc: Record<Role, string> = {
  owner: 'Full access, including billing and financial data',
  manager: 'Operations only — no financial data (payroll, expenses, finance, reports)',
};


export function TeamMembersCard() {
  const { organization } = useOrganization();
  const { canManageTeam } = useOrgRole();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('manager');

  const [busy, setBusy] = useState(false);

  const orgId = organization?.id;

  const { data: members = [] } = useQuery({
    queryKey: ['org-members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_org_members', { _organization_id: orgId! });
      if (error) throw error;
      const rows = (data as { user_id: string; email: string; full_name: string; role: string; joined_at: string }[]) ?? [];
      // Team members = owner/manager only. Cleaners (role='member') are staff,
      // not teammates. Any legacy 'admin' rows are shown as 'manager'.
      return rows
        .filter(r => r.role === 'owner' || r.role === 'admin' || r.role === 'manager')
        .map(r => ({ ...r, role: r.role === 'admin' ? 'manager' : r.role }));

    },
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['org-invites', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_invites')
        .select('id,email,role,expires_at,accepted_at,created_at')
        .eq('organization_id', orgId!)
        .is('accepted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-team-invite', {
        body: { organization_id: orgId, email, role },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Invite sent to ${email}`);
      setEmail('');
      qc.invalidateQueries({ queryKey: ['org-invites', orgId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to send invite'),
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: Role }) => {
      const { error } = await supabase.rpc('update_org_member_role', {
        _organization_id: orgId!, _target_user_id: userId, _new_role: newRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Role updated');
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('remove_org_member', {
        _organization_id: orgId!, _target_user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Member removed');
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('organization_invites').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Invite revoked');
      qc.invalidateQueries({ queryKey: ['org-invites', orgId] });
    },
  });

  return (
    <div className="space-y-6">
      {canManageTeam && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>They'll receive an email to create their account and join this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
              <div>
                <Label>Email</Label>
                <Input type="email" placeholder="coworker@company.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={v => setRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>

              </div>
              <div className="flex items-end">
                <Button
                  disabled={!email || invite.isPending}
                  onClick={() => invite.mutate()}
                  className="w-full"
                >
                  {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4 mr-2" />Send invite</>}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{roleDesc[role]}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>People with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.full_name || m.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {canManageTeam && m.role !== 'member' ? (
                    <Select
                      value={m.role}
                      onValueChange={v => changeRole.mutate({ userId: m.user_id, newRole: v as Role })}
                    >
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>

                  ) : (
                    <Badge variant="secondary">{m.role}</Badge>
                  )}
                  {canManageTeam && m.role !== 'member' && (
                    <Button variant="ghost" size="icon"
                      onClick={() => {
                        if (confirm(`Remove ${m.email} from this workspace?`)) removeMember.mutate(m.user_id);
                      }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invites.map(i => (
                <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {/* eslint-disable-next-line local/no-device-local-dates -- viewer-local display of a stored instant, not a business-day boundary */}
                      {i.role} · expires {new Date(i.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  {canManageTeam && (
                    <Button variant="ghost" size="sm" onClick={() => revokeInvite.mutate(i.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
