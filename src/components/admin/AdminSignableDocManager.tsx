import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, FileText, Upload, Trash2, Loader2, PenLine, Eye, GripVertical } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrgId } from '@/hooks/useOrgId';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

interface SignableDoc {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

function SortableDocItem({
  doc,
  onToggle,
  onPreview,
  onDelete,
}: {
  doc: SignableDoc;
  onToggle: (id: string, isActive: boolean) => void;
  onPreview: (filePath: string) => void;
  onDelete: (doc: SignableDoc) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: doc.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-3 flex items-center gap-2 bg-background">
      <button type="button" className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground min-w-[28px] min-h-[44px] flex items-center justify-center" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {doc.file_name} · {format(new Date(doc.created_at), 'MMM d, yyyy')}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Switch checked={doc.is_active} onCheckedChange={(checked) => onToggle(doc.id, checked)} />
        <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px] h-11 w-11" onClick={() => onPreview(doc.file_path)}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px] h-11 w-11 text-destructive" onClick={() => onDelete(doc)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AdminSignableDocManager() {
  const { organizationId } = useOrgId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['admin-signable-docs', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_signable_documents')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SignableDoc[];
    },
    enabled: !!organizationId,
  });

  const processFile = async (file: File) => {
    if (!user || !organizationId) return;
    if (!title.trim()) {
      toast.error('Please enter a document title');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB');
      return;
    }
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    const allowedExts = ['.pdf', '.doc', '.docx'];
    if (!allowedExts.includes(ext)) {
      toast.error('Only PDF, DOC, and DOCX files are supported');
      return;
    }

    setUploading(true);
    try {
      const safeName = `${Date.now()}${ext}`;
      const path = `signable/${organizationId}/${safeName}`;

      const { error: uploadError } = await supabase.storage.from('staff-documents').upload(path, file);
      if (uploadError) throw uploadError;

      const maxOrder = docs.length > 0 ? Math.max(...docs.map((d) => d.sort_order)) : -1;

      const { error: insertError } = await supabase.from('staff_signable_documents').insert({
        organization_id: organizationId,
        title: title.trim(),
        description: description.trim() || null,
        file_path: path,
        file_name: file.name,
        created_by: user.id,
        sort_order: maxOrder + 1,
      });
      if (insertError) throw insertError;

      queryClient.invalidateQueries({ queryKey: ['admin-signable-docs', organizationId] });
      toast.success('Signable document uploaded');
      setTitle('');
      setDescription('');
      setShowForm(false);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
      e.target.value = '';
    }
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('staff_signable_documents').update({ is_active: isActive }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-signable-docs', organizationId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: SignableDoc) => {
      await supabase.storage.from('staff-documents').remove([doc.file_path]);
      const { error } = await supabase.from('staff_signable_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-signable-docs', organizationId] });
      toast.success('Document removed');
    },
    onError: () => toast.error('Failed to delete document'),
  });

  const handlePreview = async (filePath: string) => {
    // Pre-open window BEFORE async call to avoid iOS Safari popup blocker
    const newTab = window.open('about:blank', '_blank');

    const { data, error } = await supabase.storage.from('staff-documents').createSignedUrl(filePath, 300);
    if (error || !data?.signedUrl) {
      if (newTab) newTab.close();
      toast.error('Failed to preview');
      return;
    }

    if (newTab) {
      newTab.location.href = data.signedUrl;
    } else {
      window.location.href = data.signedUrl;
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = docs.findIndex((d) => d.id === active.id);
    const newIndex = docs.findIndex((d) => d.id === over.id);
    const reordered = arrayMove(docs, oldIndex, newIndex);

    // Optimistic update
    queryClient.setQueryData(['admin-signable-docs', organizationId], reordered);

    // Persist new order
    try {
      await Promise.all(
        reordered.map((doc, i) =>
          supabase.from('staff_signable_documents').update({ sort_order: i }).eq('id', doc.id)
        )
      );
    } catch {
      queryClient.invalidateQueries({ queryKey: ['admin-signable-docs', organizationId] });
      toast.error('Failed to save order');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <PenLine className="w-4 h-4" />
          Signable Documents
        </Label>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5" />
          Add Document
        </Button>
      </div>

      {showForm && (
        <div className="border rounded-lg p-3 space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Document Title *</Label>
            <Input placeholder="e.g. Independent Contractor Agreement" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea placeholder="Brief description of what this document is..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleUpload} disabled={uploading} />
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 hover:border-primary/50'
            } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (uploading) return;
              const file = e.dataTransfer.files?.[0];
              if (file) processFile(file);
            }}
            onClick={() => {
              if (uploading) return;
              fileInputRef.current?.click();
            }}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drag & drop your PDF here</p>
                <p className="text-xs text-muted-foreground">or click to browse · PDF, DOC, DOCX · Max 10MB</p>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setTitle(''); setDescription(''); }}>
            Cancel
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-4">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No signable documents yet. Upload contracts or agreements for staff to sign.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
          <SortableContext items={docs.map((d) => d.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {docs.map((doc) => (
                <SortableDocItem
                  key={doc.id}
                  doc={doc}
                  onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
                  onPreview={handlePreview}
                  onDelete={(d) => deleteMutation.mutate(d)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
