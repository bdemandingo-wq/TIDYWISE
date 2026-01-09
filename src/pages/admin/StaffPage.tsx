import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useStaff, useServices } from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, MoreHorizontal, Mail, Phone, Edit, Trash2, Calendar, KeyRound, Copy, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { AddStaffDialog } from '@/components/admin/AddStaffDialog';
import { EditStaffDialog } from '@/components/admin/EditStaffDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTestMode } from '@/contexts/TestModeContext';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  hourly_rate: number | null;
  bio: string | null;
  is_active: boolean;
  tax_classification?: string | null;
  base_wage?: number | null;
}

export default function StaffPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permanentDeleteDialogOpen, setPermanentDeleteDialogOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);
  const [resendLinkDialogOpen, setResendLinkDialogOpen] = useState(false);
  const [resendLinkData, setResendLinkData] = useState<{ name: string; email: string; link: string } | null>(null);
  const [isResendingLink, setIsResendingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeletingPermanently, setIsDeletingPermanently] = useState(false);
  
  const { data: staff = [], isLoading } = useStaff();
  const { data: services = [] } = useServices();
  const queryClient = useQueryClient();
  const { isTestMode, maskName, maskEmail, maskPhone } = useTestMode();

  const filteredStaff = staff.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActiveFilter = showInactive ? true : s.is_active;
    return matchesSearch && matchesActiveFilter;
  });

  const activeCount = staff.filter(s => s.is_active).length;
  const inactiveCount = staff.filter(s => !s.is_active).length;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getColorFromName = (name: string) => {
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const handleEditClick = (member: StaffMember) => {
    setSelectedStaff(member);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (member: StaffMember) => {
    setStaffToDelete(member);
    setDeleteDialogOpen(true);
  };

  const handlePermanentDeleteClick = (member: StaffMember) => {
    setStaffToDelete(member);
    setPermanentDeleteDialogOpen(true);
  };

  const handleConfirmPermanentDelete = async () => {
    if (!staffToDelete) return;

    setIsDeletingPermanently(true);
    try {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffToDelete.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member permanently deleted');
      setPermanentDeleteDialogOpen(false);
      setStaffToDelete(null);
    } catch (error: any) {
      console.error('Error permanently deleting staff:', error);
      toast.error(error.message || 'Failed to delete staff member. They may have associated bookings.');
    } finally {
      setIsDeletingPermanently(false);
    }
  };

  const handleReactivateStaff = async (member: StaffMember) => {
    try {
      const { error } = await supabase
        .from('staff')
        .update({ is_active: true })
        .eq('id', member.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member reactivated');
    } catch (error) {
      console.error('Error reactivating staff:', error);
      toast.error('Failed to reactivate staff member');
    }
  };

  const handleResendPasswordLink = async (member: StaffMember) => {
    setIsResendingLink(true);
    try {
      const response = await supabase.functions.invoke('resend-staff-password-link', {
        body: {
          staffId: member.id,
          redirectUrl: `${window.location.origin}/staff/reset-password`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate password link');
      }

      const data = response.data;
      
      if (data.error) {
        throw new Error(data.error);
      }

      setResendLinkData({
        name: data.staffName,
        email: data.staffEmail,
        link: data.resetLink,
      });
      setResendLinkDialogOpen(true);
      toast.success('Password reset link generated');
    } catch (error) {
      console.error('Error generating password link:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate password link');
    } finally {
      setIsResendingLink(false);
    }
  };

  const copyLink = () => {
    if (resendLinkData) {
      navigator.clipboard.writeText(resendLinkData.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleResendLinkDialogClose = () => {
    setResendLinkDialogOpen(false);
    setResendLinkData(null);
    setCopied(false);
  };

  const handleConfirmDelete = async () => {
    if (!staffToDelete) return;

    try {
      const { error } = await supabase
        .from('staff')
        .update({ is_active: false })
        .eq('id', staffToDelete.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member deactivated');
      setDeleteDialogOpen(false);
      setStaffToDelete(null);
    } catch (error) {
      console.error('Error deleting staff:', error);
      toast.error('Failed to delete staff member');
    }
  };

  return (
    <AdminLayout
      title="Staff"
      subtitle={`${staff.length} team members`}
      actions={
        <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Staff
        </Button>
      }
    >
      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showInactive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="gap-2"
          >
            {showInactive ? 'Showing All' : 'Show Inactive'}
            {inactiveCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {inactiveCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-4">
        <Badge variant="outline" className="text-sm py-1 px-3">
          Active: {activeCount}
        </Badge>
        {inactiveCount > 0 && (
          <Badge variant="secondary" className="text-sm py-1 px-3">
            Inactive: {inactiveCount}
          </Badge>
        )}
      </div>

      {/* Staff Grid */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading staff...</div>
      ) : filteredStaff.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? 'No staff found matching your search' : 'No staff members yet. Add your first team member!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStaff.map((member) => {
            const color = getColorFromName(member.name);
            return (
              <Card key={member.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback 
                          className="font-medium text-lg"
                          style={{ 
                            backgroundColor: `${color}20`,
                            color: color 
                          }}
                        >
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold">{maskName(member.name)}</h3>
                        <div className="flex items-center gap-2">
                          {(member.base_wage || member.hourly_rate) && (
                            <span className="text-sm text-muted-foreground">
                              {isTestMode ? '$XX/hr' : `$${member.base_wage || member.hourly_rate}/hr`}
                            </span>
                          )}
                          <Badge variant={member.tax_classification === '1099' ? 'secondary' : 'default'} className="text-xs">
                            {member.tax_classification === '1099' ? '1099' : 'W-2'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <Calendar className="w-4 h-4" /> View Schedule
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="gap-2"
                          onClick={() => handleEditClick(member)}
                        >
                          <Edit className="w-4 h-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="gap-2"
                          onClick={() => handleResendPasswordLink(member)}
                          disabled={isResendingLink}
                        >
                          <KeyRound className="w-4 h-4" /> Resend Password Link
                        </DropdownMenuItem>
                        {!member.is_active && (
                          <DropdownMenuItem 
                            className="gap-2 text-green-600"
                            onClick={() => handleReactivateStaff(member)}
                          >
                            <Edit className="w-4 h-4" /> Reactivate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          className="gap-2 text-destructive"
                          onClick={() => member.is_active ? handleDeleteClick(member) : handlePermanentDeleteClick(member)}
                        >
                          <Trash2 className="w-4 h-4" /> {member.is_active ? 'Deactivate' : 'Delete Permanently'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="truncate">{maskEmail(member.email)}</span>
                    </div>
                    {member.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{maskPhone(member.phone)}</span>
                      </div>
                    )}
                    {member.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{member.bio}</p>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-sm text-muted-foreground">Active</span>
                      <Switch 
                        checked={member.is_active} 
                        onCheckedChange={async (checked) => {
                          try {
                            const { error } = await supabase
                              .from('staff')
                              .update({ is_active: checked })
                              .eq('id', member.id);
                            if (error) throw error;
                            queryClient.invalidateQueries({ queryKey: ['staff'] });
                            toast.success(`Staff member ${checked ? 'activated' : 'deactivated'}`);
                          } catch (error) {
                            console.error('Error updating staff status:', error);
                            toast.error('Failed to update staff status');
                          }
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddStaffDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
      <EditStaffDialog 
        open={editDialogOpen} 
        onOpenChange={setEditDialogOpen} 
        staff={selectedStaff}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {staffToDelete?.name}? They won't be able to log in, but their records will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={permanentDeleteDialogOpen} onOpenChange={setPermanentDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently Delete Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-destructive">Warning:</strong> This will permanently delete {staffToDelete?.name} from the database. 
              This action cannot be undone. All associated data will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPermanently}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPermanentDelete}
              disabled={isDeletingPermanently}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingPermanently ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resendLinkDialogOpen} onOpenChange={handleResendLinkDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Setup Link</DialogTitle>
          </DialogHeader>
          {resendLinkData && (
            <div className="space-y-4 py-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 dark:bg-green-950 dark:border-green-800">
                <p className="text-sm text-green-800 dark:text-green-200 font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Send this link to {resendLinkData.name}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Share this password setup link with the staff member. They'll use it to create or reset their password and access the staff portal.
              </p>
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="font-mono text-sm">{resendLinkData.email}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Password Setup Link</Label>
                  <p className="font-mono text-xs break-all bg-background p-2 rounded border mt-1">
                    {resendLinkData.link}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={copyLink}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Setup Link'}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                The link will expire after use. You can generate a new one if needed.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleResendLinkDialogClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
