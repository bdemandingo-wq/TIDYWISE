import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
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
import { Search, Plus, MoreHorizontal, Mail, Phone, MapPin, Edit, Trash2, CreditCard, Upload } from 'lucide-react';
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
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
        // First delete quotes referencing this customer
        await supabase.from('quotes').delete().eq('customer_id', customerToDelete.id);
        // Then delete the customer
        await deleteCustomer.mutateAsync(customerToDelete.id);
        setDeleteDialogOpen(false);
        setCustomerToDelete(null);
      } catch (error: any) {
        console.error('Failed to delete customer:', error);
      }
    }
  };

  const filteredCustomers = customers.filter((customer) =>
    `${customer.first_name} ${customer.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.phone?.includes(searchTerm) ?? false)
  );

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
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
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Loading customers...
                </TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No customers found
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-muted/30">
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