import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { FileText, CheckCircle2, XCircle, Clock, Eye, Download, Loader2, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrgId } from '@/hooks/useOrgId';
import { format } from 'date-fns';

const DOCUMENT_TYPES: Record<string, string> = {
  insurance: 'Insurance Certificate',
  w9: 'W-9 Form',
  id: 'Government ID',
  certification: 'Certification',
  other: 'Other',
};

interface StaffDocument {
  id: string;
  staff_id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  uploaded_at: string;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  staff?: { name: string } | null;
}

export function PendingDocumentsReview() {
  const { organizationId } = useOrgId();
  const queryClient = useQueryClient();
  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['admin-pending-documents', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_documents')
        .select('*, staff(name)')
        .eq('organization_id', organizationId!)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data || []) as StaffDocument[];
    },
    enabled: !!organizationId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ docId, status, note }: { docId: string; status: string; note: string }) => {
      const { error } = await supabase
        .from('staff_documents')
        .update({
          status,
          admin_note: note || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', docId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-documents'] });
      queryClient.invalidateQueries({ queryKey: ['admin-staff-documents'] });
      queryClient.invalidateQueries({ queryKey: ['staff-event-notifications'] });
      toast.success(`Document ${variables.status}`);
      setReviewingDocId(null);
      setAdminNote('');
    },
    onError: () => toast.error('Failed to update document status'),
  });

  const handlePreview = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('staff-documents')
      .download(filePath);
    if (error || !data) {
      toast.error('Failed to preview');
      return;
    }
    const url = URL.createObjectURL(data);
    window.open(url, '_blank');
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage
      .from('staff-documents')
      .download(filePath);
    if (error || !data) {
      toast.error('Failed to download');
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pending = documents.filter(d => d.status === 'pending');
  const approved = documents.filter(d => d.status === 'approved');
  const rejected = documents.filter(d => d.status === 'rejected');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Document Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No documents uploaded by staff yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Document Review
          </CardTitle>
          <div className="flex gap-2">
            {pending.length > 0 && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {pending.length} pending
              </Badge>
            )}
            {approved.length > 0 && (
              <Badge variant="default" className="gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                {approved.length} approved
              </Badge>
            )}
            {rejected.length > 0 && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <XCircle className="h-3 w-3" />
                {rejected.length} rejected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Show pending first, then rest */}
        {[...pending, ...rejected, ...approved].map((doc) => (
          <div key={doc.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{doc.file_name}</p>
                  <Badge
                    variant={
                      doc.status === 'approved' ? 'default' :
                      doc.status === 'rejected' ? 'destructive' : 'secondary'
                    }
                    className="text-xs capitalize shrink-0"
                  >
                    {doc.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {doc.staff?.name || 'Unknown staff'} · {DOCUMENT_TYPES[doc.document_type] || doc.document_type} · {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => handlePreview(doc.file_path)}>
                <Eye className="h-3 w-3" /> Preview
              </Button>
              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => handleDownload(doc.file_path, doc.file_name)}>
                <Download className="h-3 w-3" /> Download
              </Button>

              {doc.status === 'pending' && reviewingDocId !== doc.id && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1 h-7 text-xs ml-auto"
                    onClick={() => updateStatusMutation.mutate({ docId: doc.id, status: 'approved', note: '' })}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1 h-7 text-xs"
                    onClick={() => setReviewingDocId(doc.id)}
                  >
                    <XCircle className="h-3 w-3" /> Reject
                  </Button>
                </>
              )}

              {doc.status !== 'pending' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 h-7 text-xs ml-auto"
                  onClick={() => updateStatusMutation.mutate({ docId: doc.id, status: 'pending', note: '' })}
                >
                  Reset to Pending
                </Button>
              )}
            </div>

            {reviewingDocId === doc.id && (
              <div className="space-y-2 pt-1">
                <Textarea
                  placeholder="Reason for rejection (optional)..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="text-sm"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs"
                    onClick={() => updateStatusMutation.mutate({ docId: doc.id, status: 'rejected', note: adminNote })}
                  >
                    Confirm Reject
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setReviewingDocId(null); setAdminNote(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {doc.admin_note && doc.status === 'rejected' && reviewingDocId !== doc.id && (
              <p className="text-xs text-destructive">Note: {doc.admin_note}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
