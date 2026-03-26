import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { FileText, Upload, Trash2, Loader2, Download, CheckCircle2, AlertCircle, Clock, Eye, RefreshCw, Shield } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

const DOCUMENT_TYPES = [
  { value: 'insurance', label: 'Insurance Certificate', icon: Shield, required: false },
  { value: 'w9', label: 'W-9 Form', icon: FileText, required: true },
  { value: 'id', label: 'Government ID', icon: FileText, required: true },
  { value: 'certification', label: 'Certification', icon: FileText, required: false },
  { value: 'other', label: 'Other', icon: FileText, required: false },
];

interface StaffDocument {
  id: string;
  staff_id: string;
  user_id: string;
  organization_id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  uploaded_at: string;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
}

interface Props {
  staffId: string;
  organizationId: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  pending: { label: 'Pending Review', variant: 'secondary', icon: Clock },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  rejected: { label: 'Rejected', variant: 'destructive', icon: AlertCircle },
};

export function StaffDocumentUpload({ staffId, organizationId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('insurance');
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['staff-documents', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_documents')
        .select('*')
        .eq('staff_id', staffId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data || []) as StaffDocument[];
    },
    enabled: !!staffId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: { id: string; file_path: string }) => {
      await supabase.storage.from('staff-documents').remove([doc.file_path]);
      const { error } = await supabase.from('staff_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-documents', staffId] });
      toast.success('Document deleted');
    },
    onError: () => toast.error('Failed to delete document'),
  });

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    const fileArray = Array.from(files);
    const oversized = fileArray.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`${oversized.length} file(s) exceed 10MB limit`);
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    let uploaded = 0;

    try {
      for (const file of fileArray) {
        const ext = file.name.split('.').pop();
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `documents/${user.id}/${docType}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('staff-documents')
          .upload(path, file);
        if (uploadError) throw uploadError;

        const { error: metaError } = await supabase.from('staff_documents').insert({
          staff_id: staffId,
          user_id: user.id,
          organization_id: organizationId,
          file_name: file.name,
          file_path: path,
          document_type: docType,
        });
        if (metaError) throw metaError;

        uploaded++;
        setUploadProgress(Math.round((uploaded / fileArray.length) * 100));
      }

      queryClient.invalidateQueries({ queryKey: ['staff-documents', staffId] });
      toast.success(`${uploaded} document(s) uploaded successfully`);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Failed to upload document');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
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

  const handlePreview = async (filePath: string, fileName: string) => {
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

  const typeLabel = (type: string) =>
    DOCUMENT_TYPES.find((t) => t.value === type)?.label || type;

  // Calculate profile completion
  const requiredTypes = DOCUMENT_TYPES.filter(t => t.required);
  const uploadedRequiredTypes = requiredTypes.filter(rt => 
    documents.some(d => d.document_type === rt.value)
  );
  const completionPercent = requiredTypes.length > 0 
    ? Math.round((uploadedRequiredTypes.length / requiredTypes.length) * 100) 
    : 100;

  // Group documents by type
  const groupedDocs = DOCUMENT_TYPES.map(type => ({
    ...type,
    documents: documents.filter(d => d.document_type === type.value),
  }));

  const StatusBadge = ({ status }: { status: string }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1 text-xs">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Profile Completion Tracker */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Document Completion</h3>
            <span className="text-sm font-bold text-primary">{completionPercent}%</span>
          </div>
          <Progress value={completionPercent} className="h-2.5" />
          <div className="flex flex-wrap gap-2 mt-3">
            {requiredTypes.map(rt => {
              const hasDoc = documents.some(d => d.document_type === rt.value);
              const approved = documents.some(d => d.document_type === rt.value && d.status === 'approved');
              return (
                <Badge 
                  key={rt.value} 
                  variant={approved ? 'default' : hasDoc ? 'secondary' : 'outline'}
                  className="gap-1 text-xs"
                >
                  {approved ? <CheckCircle2 className="h-3 w-3" /> : hasDoc ? <Clock className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {rt.label}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
          <CardDescription>
            Upload insurance, W-9, government ID, certifications, or other documents. You can select multiple files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={handleFileChange}
            disabled={uploading}
            multiple
          />

          <div className="flex flex-col gap-3">
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} {t.required && <span className="text-destructive">*</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="default"
              className="gap-2 w-full h-12 text-base"
              disabled={uploading}
              onClick={handleButtonClick}
              type="button"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              {uploading ? 'Uploading...' : 'Choose Files'}
            </Button>
          </div>

          {uploading && uploadProgress > 0 && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{uploadProgress}% complete</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents by Category */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading documents...</p>
          </CardContent>
        </Card>
      ) : (
        groupedDocs.filter(g => g.documents.length > 0).map(group => (
          <Card key={group.value}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {group.label}
                {group.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                <span className="text-xs text-muted-foreground ml-auto">{group.documents.length} file(s)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.documents.map((doc) => (
                <div key={doc.id} className="flex flex-col gap-2 p-3 rounded-lg border bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                      </p>
                      {doc.admin_note && doc.status === 'rejected' && (
                        <p className="text-xs text-destructive mt-1">Note: {doc.admin_note}</p>
                      )}
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 flex-1 h-9"
                      onClick={() => handlePreview(doc.file_path, doc.file_name)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 flex-1 h-9"
                      onClick={() => handleDownload(doc.file_path, doc.file_name)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-9"
                      onClick={() => {
                        setDocType(doc.document_type);
                        setTimeout(() => handleButtonClick(), 100);
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-destructive"
                      onClick={() => deleteMutation.mutate({ id: doc.id, file_path: doc.file_path })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {/* Empty state for categories with no docs */}
      {!isLoading && documents.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No documents uploaded yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload your required documents above to complete your profile.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
