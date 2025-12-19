import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useStaff, useServices } from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Plus, MoreHorizontal, Mail, Phone, Edit, Trash2, Calendar } from 'lucide-react';
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

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  hourly_rate: number | null;
  bio: string | null;
  is_active: boolean;
}

export default function StaffPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);
  
  const { data: staff = [], isLoading } = useStaff();
  const { data: services = [] } = useServices();
  const queryClient = useQueryClient();

  const filteredStaff = staff.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      {/* Search */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
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
                        <h3 className="font-semibold">{member.name}</h3>
                        {member.hourly_rate && (
                          <p className="text-sm text-muted-foreground">${member.hourly_rate}/hr</p>
                        )}
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
                          className="gap-2 text-destructive"
                          onClick={() => handleDeleteClick(member)}
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="truncate">{member.email}</span>
                    </div>
                    {member.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{member.phone}</span>
                      </div>
                    )}
                    {member.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{member.bio}</p>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-sm text-muted-foreground">Active</span>
                      <Switch checked={member.is_active} disabled />
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
            <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {staffToDelete?.name}? This will deactivate their account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
