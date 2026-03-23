import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileText, Upload, Trash2, Loader2, Download } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

const DOCUMENT_TYPES = [
  { value: 'insurance', label: 'Insurance Certificate' },
  { value: 'w9', label: 'W-9 Form' },
  { value: 'id', label: 'Government ID' },
  { value: 'certification', label: 'Certification' },
  { value: 'other', label: 'Other' },
];

interface Props {
  staffId: string;
  organizationId: string;
}

export function StaffDocumentUpload({ staffId, organizationId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('other');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
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
      return data || [];
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
    // Programmatically trigger the hidden file input – works on mobile WebViews
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB');
      e.target.value = '';
      return;
    }

    setSelectedFileName(file.name);
    setUploading(true);

    try {
      const ext = file.name.split('.').pop();
      const safeName = `${Date.now()}.${ext}`;
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

      queryClient.invalidateQueries({ queryKey: ['staff-documents', staffId] });
      toast.success('Document uploaded successfully');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Failed to upload document');
    } finally {
      setUploading(false);
      setSelectedFileName(null);
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

  const typeLabel = (type: string) =>
    DOCUMENT_TYPES.find((t) => t.value === type)?.label || type;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
        </CardTitle>
        <CardDescription>
          Upload insurance, W-9, certifications, or other documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hidden native file input – rendered outside the button for mobile compatibility */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={handleFileChange}
          disabled={uploading}
        />

        {/* Upload section */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Document type" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            className="gap-2"
            disabled={uploading}
            onClick={handleButtonClick}
            type="button"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading...' : 'Upload File'}
          </Button>
        </div>

        {/* Selected file indicator */}
        {selectedFileName && (
          <p className="text-sm text-muted-foreground">Selected: {selectedFileName}</p>
        )}

        {/* Documents list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(doc.document_type)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(doc.file_path, doc.file_name)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteMutation.mutate({ id: doc.id, file_path: doc.file_path })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
