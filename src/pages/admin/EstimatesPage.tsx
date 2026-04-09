import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, FileText, ArrowRight, Trash2, Send, Eye } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { SwipeableRow } from '@/components/mobile/SwipeableRow';
import { cn } from '@/lib/utils';
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

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  quote_sent: { label: 'Quote Sent', variant: 'default' },
  converted: { label: 'Converted', variant: 'outline' },
  declined: { label: 'Declined', variant: 'destructive' },
};

export default function EstimatesPage() {
  const { organizationId } = useOrgId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ['estimates', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estimates')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('estimates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      toast.success('Estimate deleted');
      setDeleteId(null);
    },
  });

  const filtered = estimates.filter((e: any) => {
    const matchesSearch = !search || 
      e.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.client_address?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleNewEstimate = () => navigate('/dashboard/estimates/new');

  const renderCard = (estimate: any) => {
    const status = STATUS_MAP[estimate.status] || STATUS_MAP.draft;
    const content = (
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => navigate(`/dashboard/estimates/${estimate.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{estimate.client_name || 'Untitled Estimate'}</p>
              <p className="text-sm text-muted-foreground truncate">{estimate.client_address || 'No address'}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(estimate.created_at), 'MMM d, yyyy')}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge variant={status.variant}>{status.label}</Badge>
              <p className="text-sm font-semibold">
                ${Number(estimate.estimated_total || 0).toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );

    if (isMobile) {
      return (
        <SwipeableRow
          key={estimate.id}
          rightActions={[
            { label: 'Convert', variant: 'default', onAction: () => navigate(`/dashboard/estimates/${estimate.id}?action=convert`) },
            { label: 'Delete', variant: 'destructive', onAction: () => setDeleteId(estimate.id) },
          ]}
        >
          {content}
        </SwipeableRow>
      );
    }

    return <div key={estimate.id}>{content}</div>;
  };

  return (
    <AdminLayout title="Estimates">
      <div className="space-y-4 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl md:text-2xl font-bold">Estimates</h1>
          <Button onClick={handleNewEstimate} size={isMobile ? 'sm' : 'default'}>
            <Plus className="w-4 h-4 mr-1" />
            New Estimate
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search estimates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {['all', 'draft', 'quote_sent', 'converted', 'declined'].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s)}
                className="shrink-0"
              >
                {s === 'all' ? 'All' : STATUS_MAP[s]?.label || s}
              </Button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No estimates yet</p>
            <Button className="mt-4" onClick={handleNewEstimate}>
              <Plus className="w-4 h-4 mr-1" /> Create your first estimate
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(renderCard)}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
