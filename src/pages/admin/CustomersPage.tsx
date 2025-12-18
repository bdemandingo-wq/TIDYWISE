import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { mockCustomers } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Plus, MoreHorizontal, Mail, Phone, MapPin, Eye, Edit, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = mockCustomers.filter((customer) =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <AdminLayout
      title="Customers"
      subtitle={`${mockCustomers.length} total customers`}
      actions={
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add Customer
        </Button>
      }
    >
      {/* Search */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Bookings</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>Last Booking</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map((customer) => (
              <TableRow key={customer.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {getInitials(customer.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Since {new Date(customer.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      {customer.email}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      {customer.phone}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm max-w-[200px]">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{customer.address}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{customer.totalBookings}</TableCell>
                <TableCell className="font-semibold text-success">
                  ${customer.totalSpent.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {customer.lastBooking
                    ? new Date(customer.lastBooking).toLocaleDateString()
                    : '-'}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2">
                        <Eye className="w-4 h-4" /> View Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2">
                        <Edit className="w-4 h-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-destructive">
                        <Trash2 className="w-4 h-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}
