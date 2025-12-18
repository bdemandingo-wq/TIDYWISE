import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { mockStaff, mockServices } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

export default function StaffPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredStaff = mockStaff.filter((staff) =>
    staff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    staff.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getServiceNames = (serviceIds: string[]) => {
    return serviceIds.map(id => 
      mockServices.find(s => s.id === id)?.name || ''
    ).filter(Boolean);
  };

  return (
    <AdminLayout
      title="Staff"
      subtitle={`${mockStaff.length} team members`}
      actions={
        <Button className="gap-2">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStaff.map((staff) => (
          <Card key={staff.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback 
                      className="font-medium text-lg"
                      style={{ 
                        backgroundColor: `${staff.color}20`,
                        color: staff.color 
                      }}
                    >
                      {getInitials(staff.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{staff.name}</h3>
                    <p className="text-sm text-muted-foreground">{staff.role}</p>
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
                    <DropdownMenuItem className="gap-2">
                      <Edit className="w-4 h-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 text-destructive">
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
                  <span className="truncate">{staff.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{staff.phone}</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Services</p>
                  <div className="flex flex-wrap gap-1">
                    {getServiceNames(staff.services).map((service) => (
                      <Badge key={service} variant="secondary" className="text-xs">
                        {service}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-sm text-muted-foreground">Active</span>
                  <Switch checked={staff.isActive} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
