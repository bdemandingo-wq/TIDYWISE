import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Search, Plus, Mail, Phone, Edit, Trash2, CreditCard, Upload, Users,
  UserX, RefreshCw, MapPin, Download, AlertTriangle, ArrowUpDown,
  ArrowUp, ArrowDown, CalendarDays, DollarSign, FileText, Eye, UserPlus,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCustomers, useDeleteCustomer } from '@/hooks/useBookings';
import { AddCustomerDialog } from '@/components/admin/AddCustomerDialog';
import { EditCustomerDialog } from '@/components/admin/EditCustomerDialog';
import { PaymentHistoryDialog } from '@/components/admin/PaymentHistoryDialog';
import { ImportDialog, FieldMapping } from '@/components/admin/ImportDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SwipeableRow } from '@/components/mobile/SwipeableRow';
import { hapticImpact } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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

type SortField = 'name' | 'status' | 'created_at' | 'revenue' | 'last_booking';
type SortDir = 'asc' | 'desc';
type TabFilter = 'all' | 'customers' | 'leads';

interface BookingStats {
  customer_id: string;
  total_bookings: number;
  total_revenue: number;
  last_booking_date: string | null;
}

export default function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'delete' | 'inactive' | 'remove_campaigns' | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data: customers = [], isLoading } = useCustomers();
  const deleteCustomer = useDeleteCustomer();
  const { maskName, maskEmail, maskPhone, maskAddress, isTestMode, maskAmount } = useTestMode();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [batchMode, setBatchMode] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const customersQueryKey = useMemo(() => ['customers', organization?.id], [organization?.id]);

  // Fetch booking stats per customer
  const { data: bookingStats = [] } = useQuery({
    queryKey: ['customer-booking-stats', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('customer_id, total_amount, scheduled_at')
        .eq('organization_id', organization.id)
        .neq('status', 'cancelled');
      if (error) throw error;

      const statsMap = new Map<string, BookingStats>();
      for (const b of data || []) {
        if (!b.customer_id) continue;
        const existing = statsMap.get(b.customer_id);
        if (existing) {
          existing.total_bookings++;
          existing.total_revenue += Number(b.total_amount) || 0;
          if (!existing.last_booking_date || b.scheduled_at > existing.last_booking_date) {
            existing.last_booking_date = b.scheduled_at;
          }
        } else {
          statsMap.set(b.customer_id, {
            customer_id: b.customer_id,
            total_bookings: 1,
            total_revenue: Number(b.total_amount) || 0,
            last_booking_date: b.scheduled_at,
          });
        }
      }
      return Array.from(statsMap.values());
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 5,
  });

  const statsMap = useMemo(() => {
    const m = new Map<string, BookingStats>();
    bookingStats.forEach(s => m.set(s.customer_id, s));
    return m;
  }, [bookingStats]);

  // Duplicate detection: same email or phone
  const duplicates = useMemo(() => {
    const emailMap = new Map<string, string[]>();
    const phoneMap = new Map<string, string[]>();
    const dupeIds = new Set<string>();

    customers.forEach(c => {
      const email = c.email?.toLowerCase().trim();
      if (email) {
        if (!emailMap.has(email)) emailMap.set(email, []);
        emailMap.get(email)!.push(c.id);
      }
      const phone = c.phone?.replace(/\D/g, '');
      if (phone && phone.length >= 7) {
        if (!phoneMap.has(phone)) phoneMap.set(phone, []);
        phoneMap.get(phone)!.push(c.id);
      }
    });

    emailMap.forEach(ids => { if (ids.length > 1) ids.forEach(id => dupeIds.add(id)); });
    phoneMap.forEach(ids => { if (ids.length > 1) ids.forEach(id => dupeIds.add(id)); });

    return dupeIds;
  }, [customers]);

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
        const { error } = await supabase.from('customers').update({ customer_status: 'inactive' }).in('id', ids);
        if (error) throw error;
        toast.success(`Moved ${ids.length} customers to Inactive`);
      } else if (bulkAction === 'remove_campaigns') {
        const { error } = await supabase.from('customers').update({ marketing_status: 'opted_out' }).in('id', ids);
        if (error) throw error;
        toast.success(`Removed ${ids.length} customers from campaigns`);
      } else if (bulkAction === 'delete') {
        for (const id of ids) {
          await supabase.from('quotes').delete().eq('customer_id', id);
          await deleteCustomer.mutateAsync(id);
        }
        toast.success(`Deleted ${ids.length} customers`);
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
    if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const filteredCustomers = useMemo(() => {
    let list = customers.filter((customer) => {
      const matchesSearch =
        `${customer.first_name} ${customer.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.phone?.includes(searchTerm) ?? false);

      let matchesTab = true;
      if (tabFilter === 'customers') matchesTab = customer.customer_status === 'active';
      else if (tabFilter === 'leads') matchesTab = customer.customer_status === 'lead' || (!customer.customer_status || customer.customer_status === '');

      return matchesSearch && matchesTab;
    });

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      const statsA = statsMap.get(a.id);
      const statsB = statsMap.get(b.id);

      switch (sortField) {
        case 'name': cmp = nameA.localeCompare(nameB); break;
        case 'status': cmp = (a.customer_status || '').localeCompare(b.customer_status || ''); break;
        case 'created_at': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
        case 'revenue': cmp = (statsA?.total_revenue || 0) - (statsB?.total_revenue || 0); break;
        case 'last_booking': {
          const dateA = statsA?.last_booking_date ? new Date(statsA.last_booking_date).getTime() : 0;
          const dateB = statsB?.last_booking_date ? new Date(statsB.last_booking_date).getTime() : 0;
          cmp = dateA - dateB;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [customers, searchTerm, tabFilter, sortField, sortDir, statsMap]);

  const getInitials = (firstName: string, lastName: string) =>
    `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();

  const getStatusBadge = (status: string) => {
    if (status === 'active') return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">Customer</Badge>;
    if (status === 'inactive') return <Badge variant="secondary" className="text-xs">Inactive</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs">Lead</Badge>;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
      : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  const exportToCsv = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Status', 'Total Bookings', 'Lifetime Revenue', 'Last Booking'];
    const rows = filteredCustomers.map(c => {
      const s = statsMap.get(c.id);
      return [
        c.first_name, c.last_name, c.email, c.phone || '',
        c.address || '', c.city || '', c.state || '', c.zip_code || '',
        c.customer_status || 'lead',
        s?.total_bookings || 0,
        s?.total_revenue?.toFixed(2) || '0.00',
        s?.last_booking_date ? format(new Date(s.last_booking_date), 'yyyy-MM-dd') : '',
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
  };

  // Mobile helpers
  const startLongPress = (id: string) => {
    if (!isMobile) return;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      setBatchMode(true);
      hapticImpact('medium');
      toggleSelect(id);
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const onRefresh = async () => {
    hapticImpact('light');
    await queryClient.invalidateQueries({ queryKey: customersQueryKey });
  };

  const pullState = useRef({ startY: 0, pulling: false, dist: 0 });
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => { if (!isMobile) { setBatchMode(false); setExpandedId(null); } }, [isMobile]);

  const onListTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || !listRef.current || listRef.current.scrollTop > 0) return;
    pullState.current = { startY: e.touches[0].clientY, pulling: true, dist: 0 };
  };
  const onListTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !pullState.current.pulling) return;
    const dist = Math.max(0, Math.min(96, e.touches[0].clientY - pullState.current.startY));
    pullState.current.dist = dist;
    setPullDistance(dist);
  };
  const onListTouchEnd = async () => {
    if (!isMobile || !pullState.current.pulling) return;
    const dist = pullState.current.dist;
    pullState.current.pulling = false;
    setPullDistance(0);
    if (dist >= 64) await onRefresh();
  };

  const rowVirtualizer = useVirtualizer({
    count: filteredCustomers.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  const customerCount = customers.filter(c => c.customer_status === 'active').length;
  const leadCount = customers.filter(c => c.customer_status === 'lead' || !c.customer_status || c.customer_status === '').length;

  return (
    <AdminLayout
      title="Customers"
      subtitle={`${customers.length} total`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={exportToCsv}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Customer</span>
          </Button>
        </div>
      }
    >
      {/* Tabs + Search + Bulk Actions */}
      <div className="space-y-4 mb-4">
        <Tabs value={tabFilter} onValueChange={(v) => setTabFilter(v as TabFilter)} className="w-full">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all" className="flex-1 sm:flex-none gap-1.5">
              All <Badge variant="secondary" className="text-xs px-1.5 py-0">{customers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex-1 sm:flex-none gap-1.5">
              Customers <Badge variant="secondary" className="text-xs px-1.5 py-0">{customerCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex-1 sm:flex-none gap-1.5">
              Leads <Badge variant="secondary" className="text-xs px-1.5 py-0">{leadCount}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {selectedIds.size > 0 && (
            <div className="flex gap-2 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    Actions ({selectedIds.size})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => { setBulkAction('inactive'); setBulkActionDialogOpen(true); }}>
                    <Users className="w-4 h-4 mr-2" /> Move to Inactive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setBulkAction('remove_campaigns'); setBulkActionDialogOpen(true); }}>
                    <UserX className="w-4 h-4 mr-2" /> Remove from Campaigns
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportToCsv}>
                    <Download className="w-4 h-4 mr-2" /> Export Selected
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => { setBulkAction('delete'); setBulkActionDialogOpen(true); }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: Virtualized card list */}
      {isMobile ? (
        <div className="relative">
          <div
            className="sticky top-0 z-10 -mt-2 mb-2"
            style={{ transform: `translate3d(0, ${pullDistance ? pullDistance - 24 : 0}px, 0)` }}
          >
            <div className="flex items-center justify-center text-xs text-muted-foreground gap-2 py-2">
              <RefreshCw className={cn('h-4 w-4 transition-transform', pullDistance >= 64 ? 'rotate-180' : 'rotate-0')} aria-hidden="true" />
              <span>{pullDistance >= 64 ? 'Release to refresh' : 'Pull to refresh'}</span>
            </div>
          </div>

          <div
            ref={listRef}
            className="h-[calc(100vh-16rem)] overflow-auto overscroll-contain"
            onTouchStart={onListTouchStart}
            onTouchMove={onListTouchMove}
            onTouchEnd={onListTouchEnd}
          >
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="p-4 animate-pulse"><div className="h-4 w-1/2 bg-muted rounded" /><div className="mt-3 h-3 w-2/3 bg-muted rounded" /></Card>
                ))}
              </div>
            ) : filteredCustomers.length === 0 ? (
              <EmptyState onAdd={() => setAddDialogOpen(true)} />
            ) : (
              <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                  const customer = filteredCustomers[vRow.index];
                  const isExpanded = expandedId === customer.id;
                  const isSelected = selectedIds.has(customer.id);
                  const cStats = statsMap.get(customer.id);
                  const isDupe = duplicates.has(customer.id);

                  return (
                    <div key={customer.id} className="absolute left-0 top-0 w-full" style={{ transform: `translate3d(0, ${vRow.start}px, 0)` }}>
                      <SwipeableRow
                        className="mb-3"
                        rightAction={{ label: 'Delete', variant: 'destructive', onAction: () => handleDeleteClick(customer) }}
                      >
                        <button
                          type="button"
                          className={cn('w-full text-left bg-card border border-border shadow-sm rounded-xl p-3 transition-transform active:scale-[0.99] will-change-transform')}
                          onPointerDown={() => startLongPress(customer.id)}
                          onPointerUp={cancelLongPress}
                          onPointerCancel={cancelLongPress}
                          onClick={() => {
                            cancelLongPress();
                            if (batchMode) { hapticImpact('light'); toggleSelect(customer.id); return; }
                            setExpandedId(prev => prev === customer.id ? null : customer.id);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            {batchMode && (
                              <div className="pt-1"><Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(customer.id)} /></div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-medium text-sm truncate">{maskName(`${customer.first_name} ${customer.last_name}`)}</p>
                                    {isDupe && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">{maskPhone(customer.phone || '')}</p>
                                </div>
                                <div className="flex flex-col items-end gap-0.5 shrink-0">
                                  {getStatusBadge(customer.customer_status)}
                                  {isDupe && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">Possible Duplicate</Badge>}
                                </div>
                              </div>
                              {cStats && (
                                <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                                  <span>{cStats.total_bookings} bookings</span>
                                  <span>{maskAmount(cStats.total_revenue)}</span>
                                  {cStats.last_booking_date && <span>Last: {format(new Date(cStats.last_booking_date), 'MMM d')}</span>}
                                </div>
                              )}

                              {isExpanded && (
                                <div className="mt-3 space-y-2 animate-fade-in">
                                  {customer.address && (
                                    <div className="text-sm flex items-center gap-1 text-muted-foreground">
                                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span>{[customer.address, customer.city, customer.state, customer.zip_code].filter(Boolean).join(', ')}</span>
                                    </div>
                                  )}
                                  <div className="flex gap-2 pt-2">
                                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={e => { e.preventDefault(); e.stopPropagation(); hapticImpact('light'); setSelectedCustomer(customer); setEditDialogOpen(true); }}>
                                      <Edit className="h-4 w-4 mr-2" /> Edit
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={e => { e.preventDefault(); e.stopPropagation(); hapticImpact('light'); setSelectedCustomer(customer); setPaymentHistoryOpen(true); }}>
                                      <CreditCard className="h-4 w-4 mr-2" /> Payments
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </SwipeableRow>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => { hapticImpact('medium'); setAddDialogOpen(true); }}
            className={cn('fixed right-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center transition-transform active:scale-[0.96] will-change-transform')}
            aria-label="Add customer"
          >
            <Plus className="h-6 w-6" aria-hidden="true" />
          </button>

          {batchMode && (
            <div className="fixed left-4 right-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom))]">
              <Button type="button" variant="secondary" className="w-full" onClick={() => { hapticImpact('light'); setBatchMode(false); setSelectedIds(new Set()); }}>
                Exit batch mode
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Desktop Table */
        <>
          {!isLoading && filteredCustomers.length === 0 ? (
            <EmptyState onAdd={() => setAddDialogOpen(true)} />
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
              <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedIds.size === filteredCustomers.length && filteredCustomers.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="min-w-[200px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort('name')}>
                          Customer <SortIcon field="name" />
                        </button>
                      </TableHead>
                      <TableHead className="w-[120px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort('status')}>
                          Status <SortIcon field="status" />
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[200px]">Contact</TableHead>
                      <TableHead className="min-w-[180px]">Address</TableHead>
                      <TableHead className="w-[90px] text-center">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors mx-auto" onClick={() => handleSort('revenue')}>
                          Revenue <SortIcon field="revenue" />
                        </button>
                      </TableHead>
                      <TableHead className="w-[80px] text-center">Bookings</TableHead>
                      <TableHead className="w-[110px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort('last_booking')}>
                          Last Job <SortIcon field="last_booking" />
                        </button>
                      </TableHead>
                      <TableHead className="w-[130px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading customers...</TableCell></TableRow>
                    ) : (
                      filteredCustomers.map((customer) => {
                        const cStats = statsMap.get(customer.id);
                        const isDupe = duplicates.has(customer.id);
                        return (
                          <TableRow key={customer.id} className="hover:bg-muted/30 group">
                            <TableCell>
                              <Checkbox checked={selectedIds.has(customer.id)} onCheckedChange={() => toggleSelect(customer.id)} />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                                    {getInitials(customer.first_name, customer.last_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-medium text-sm truncate">{maskName(`${customer.first_name} ${customer.last_name}`)}</p>
                                    {isDupe && (
                                      <Tooltip>
                                        <TooltipTrigger><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></TooltipTrigger>
                                        <TooltipContent>Possible duplicate (shared email or phone)</TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Since {format(new Date(customer.created_at), 'MMM d, yyyy')}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {getStatusBadge(customer.customer_status)}
                                {isDupe && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">Duplicate</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                                  <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                  <span className="truncate">{maskEmail(customer.email)}</span>
                                </a>
                                {customer.phone && (
                                  <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                                    <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                    {maskPhone(customer.phone)}
                                  </a>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {customer.address ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground cursor-default max-w-[220px]">
                                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                                      <span className="truncate">{customer.address}{customer.city ? `, ${customer.city}` : ''}</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    {[customer.address, customer.city, customer.state, customer.zip_code].filter(Boolean).join(', ')}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-sm font-medium">{isTestMode ? '$XXX' : `$${(cStats?.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-sm">{isTestMode ? 'X' : (cStats?.total_bookings || 0)}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {cStats?.last_booking_date
                                  ? format(new Date(cStats.last_booking_date), 'MMM d, yyyy')
                                  : '—'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedCustomer(customer); setEditDialogOpen(true); }}>
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedCustomer(customer); setPaymentHistoryOpen(true); }}>
                                      <DollarSign className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Payment History</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteClick(customer)}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
          )}
        </>
      )}

      <AddCustomerDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />

      {selectedCustomer && (
        <>
          <EditCustomerDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} customer={selectedCustomer} />
          <PaymentHistoryDialog open={paymentHistoryOpen} onOpenChange={setPaymentHistoryOpen} customerId={selectedCustomer.id} customerName={`${selectedCustomer.first_name} ${selectedCustomer.last_name}`} />
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
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === 'inactive' ? 'Move to Inactive' : bulkAction === 'delete' ? 'Delete Customers' : 'Remove from Campaigns'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'inactive'
                ? `Are you sure you want to mark ${selectedIds.size} customer(s) as Inactive?`
                : bulkAction === 'delete'
                ? `Are you sure you want to delete ${selectedIds.size} customer(s)? This cannot be undone.`
                : `Are you sure you want to remove ${selectedIds.size} customer(s) from all campaigns?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAction} className={bulkAction === 'delete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <UserPlus className="w-10 h-10 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No customers yet</h3>
      <p className="text-muted-foreground text-sm text-center max-w-sm mb-6">
        Start building your client list by adding your first customer or importing from a spreadsheet.
      </p>
      <Button onClick={onAdd} className="gap-2">
        <Plus className="w-4 h-4" />
        Add Your First Customer
      </Button>
    </div>
  );
}
