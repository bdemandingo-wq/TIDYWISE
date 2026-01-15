import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Plus, MoreHorizontal, Mail, Phone, MapPin, Edit, Trash2, CreditCard, Upload, Users, UserX } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCustomers, useDeleteCustomer } from '@/hooks/useBookings';
import { AddCustomerDialog } from '@/components/admin/AddCustomerDialog';
import { EditCustomerDialog } from '@/components/admin/EditCustomerDialog';
import { PaymentHistoryDialog } from '@/components/admin/PaymentHistoryDialog';
import { ImportDialog, FieldMapping } from '@/components/admin/ImportDialog';
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
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const CUSTOMER_FIELDS: FieldMapping[] = [
  { dbField: 'first_name', label: 'First Name', required: true },
  { dbField: 'last_name', label: 'Last Name', required: true },
  { dbField: 'email', label: 'Email', required: true, type: 'email' },
  { dbField: 'phone', label: 'Phone' },
  { dbField: 'address', label: 'Address' },
  { dbField: 'city', label: 'City' },
  { dbField: 'state', label: 'State' },
  { dbField: 'zip_code', label: 'Zip Code' },
  { dbField: 'notes', label: 'Notes' },
];

const CUSTOMER_SAMPLE = `first_name,last_name,email,phone,address,city,state,zip_code
John,Doe,john@example.com,555-1234,123 Main St,New York,NY,10001
Jane,Smith,jane@example.com,555-5678,456 Oak Ave,Los Angeles,CA,90001`;

export default function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'inactive' | 'remove_campaigns' | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const { data: customers = [], isLoading } = useCustomers();
  const deleteCustomer = useDeleteCustomer();
  const { maskName, maskEmail, maskPhone, maskAddress } = useTestMode();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const handleImportCustomers = async (records: Record<string, any>[]) => {
    if (!organization?.id) throw new Error('No organization found');
    
    const customersToInsert = records.map(record => ({
      first_name: record.first_name || '',
      last_name: record.last_name || '',
      email: record.email || '',
      phone: record.phone || null,
      address: record.address || null,
      city: record.city || null,
      state: record.state || null,
      zip_code: record.zip_code || null,
      notes: record.notes || null,
      organization_id: organization.id,
    }));
    
    const { error } = await supabase.from('customers').insert(customersToInsert);
    if (error) throw error;
    
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const handleDeleteClick = (customer: { id: string; first_name: string; last_name: string }) => {
    setCustomerToDelete({ id: customer.id, name: `${customer.first_name} ${customer.last_name}` });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (customerToDelete) {
      try {
        await supabase.from('quotes').delete().eq('customer_id', customerToDelete.id);
        await deleteCustomer.mutateAsync(customerToDelete.id);
        setDeleteDialogOpen(false);
        setCustomerToDelete(null);
      } catch (error: any) {
        console.error('Failed to delete customer:', error);
      }
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    
    const ids = Array.from(selectedIds);
    
    try {
      if (bulkAction === 'inactive') {
        const { error } = await supabase
          .from('customers')
          .update({ customer_status: 'inactive' })
          .in('id', ids);
        if (error) throw error;
        toast.success(`Moved ${ids.length} customers to Inactive`);
      } else if (bulkAction === 'remove_campaigns') {
        const { error } = await supabase
          .from('customers')
          .update({ marketing_status: 'opted_out' })
          .in('id', ids);
        if (error) throw error;
        toast.success(`Removed ${ids.length} customers from campaigns`);
      }
      
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setSelectedIds(new Set());
      setBulkActionDialogOpen(false);
      setBulkAction(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update customers');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCustomers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCustomers.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch = 
      `${customer.first_name} ${customer.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.phone?.includes(searchTerm) ?? false);
    
    const matchesStatus = statusFilter === 'all' || 
      (customer as any).customer_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active':
        return <Badge className="bg-green-500 text-xs">Active</Badge>;
      case 'lead':
        return <Badge className="bg-blue-500 text-xs">Lead</Badge>;
      case 'inactive':
        return <Badge variant="secondary" className="text-xs">Inactive</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status || 'Lead'}</Badge>;
    }
  };

  return (
    <AdminLayout
      title="Customers"
      subtitle={`${customers.length} total customers`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Customer
          </Button>
        </div>
      }
    >
      {/* Filters & Bulk Actions */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="lead">Leads Only</SelectItem>
            <SelectItem value="active">Active Clients</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBulkAction('inactive');
                setBulkActionDialogOpen(true);
              }}
              className="gap-1"
            >
              <Users className="w-4 h-4" />
              Move to Inactive ({selectedIds.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBulkAction('remove_campaigns');
                setBulkActionDialogOpen(true);
              }}
              className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <UserX className="w-4 h-4" />
              Remove from Campaigns ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox 
                  checked={selectedIds.size === filteredCustomers.length && filteredCustomers.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading customers...
                </TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No customers found
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(customer.id)}
                      onCheckedChange={() => toggleSelect(customer.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {getInitials(customer.first_name, customer.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{maskName(`${customer.first_name} ${customer.last_name}`)}</p>
                        <p className="text-sm text-muted-foreground">
                          Since {new Date(customer.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {getStatusBadge((customer as any).customer_status)}
                      {(customer as any).marketing_status === 'opted_out' && (
                        <Badge variant="destructive" className="text-xs">No Campaigns</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                        {maskEmail(customer.email)}
                      </div>
                      {customer.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                          {maskPhone(customer.phone)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {customer.address ? (
                      <div className="flex items-center gap-2 text-sm max-w-[200px]">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">
                          {maskAddress(`${customer.address}${customer.city ? `, ${customer.city}` : ''}${customer.state ? `, ${customer.state}` : ''}`)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          className="gap-2"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setPaymentHistoryOpen(true);
                          }}
                        >
                          <CreditCard className="w-4 h-4" /> Payment History
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="gap-2"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setEditDialogOpen(true);
                          }}
                        >
                          <Edit className="w-4 h-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="gap-2 text-destructive"
                          onClick={() => handleDeleteClick(customer)}
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddCustomerDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />

      {selectedCustomer && (
        <>
          <EditCustomerDialog 
            open={editDialogOpen} 
            onOpenChange={setEditDialogOpen} 
            customer={selectedCustomer}
          />
          <PaymentHistoryDialog
            open={paymentHistoryOpen}
            onOpenChange={setPaymentHistoryOpen}
            customerId={selectedCustomer.id}
            customerName={`${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
          />
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {customerToDelete?.name}? This action cannot be undone.
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

      <AlertDialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === 'inactive' ? 'Move to Inactive' : 'Remove from Campaigns'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'inactive' 
                ? `Are you sure you want to mark ${selectedIds.size} customer(s) as Inactive?`
                : `Are you sure you want to remove ${selectedIds.size} customer(s) from all campaigns? They will no longer receive marketing messages.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAction}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title="Import Customers"
        entityName="customers"
        fields={CUSTOMER_FIELDS}
        onImport={handleImportCustomers}
        sampleData={CUSTOMER_SAMPLE}
      />
    </AdminLayout>
  );
}