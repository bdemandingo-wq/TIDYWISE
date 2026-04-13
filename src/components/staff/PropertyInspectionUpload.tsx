import { useRef, useState } from 'react';
import { Camera, X, CheckCircle, Loader2, ImageIcon, AlertTriangle, Package, BarChart2, Plus, Send } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useNativeCamera } from '@/hooks/useNativeCamera';

interface InspectionItem {
  file: File;
  previewUrl: string;
  category: 'broken' | 'missing' | 'low_inventory' | 'general';
  note: string;
}

interface PropertyInspectionUploadProps {
  bookingId: string;
  staffId: string;
  organizationId: string;
  onSubmitted?: () => void;
}

const CATEGORY_CONFIG = {
  broken: { label: 'Broken', icon: AlertTriangle, color: 'bg-red-100 text-red-700 border-red-200' },
  missing: { label: 'Missing', icon: Package, color: 'bg-orange-100 text-orange-700 border-orange-200' },
  low_inventory: { label: 'Low Inventory', icon: BarChart2, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  general: { label: 'General Note', icon: Camera, color: 'bg-blue-100 text-blue-700 border-blue-200' },
} as const;

const PICKER_CLASS = 'absolute left-0 top-0 h-px w-px opacity-0 pointer-events-none';
const PHOTO_MAX_SIZE = 10 * 1024 * 1024;

export function PropertyInspectionUpload({ bookingId, staffId, organizationId, onSubmitted }: PropertyInspectionUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<InspectionItem['category']>('broken');
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const [pendingNote, setPendingNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { isNative, takePicture, pickFromGallery } = useNativeCamera();

  const clearPending = () => {
    if (pendingFile?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
    setPendingNote('');
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > PHOTO_MAX_SIZE) { toast.error('Photo must be under 10MB'); return; }
    setPendingFile({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleNativeCamera = async () => {
    const result = await takePicture('camera');
    if (result?.file && result.dataUrl) setPendingFile({ file: result.file, previewUrl: result.dataUrl });
  };

  const handleNativeGallery = async () => {
    const result = await pickFromGallery();
    if (result?.file && result.dataUrl) setPendingFile({ file: result.file, previewUrl: result.dataUrl });
  };

  const addItem = () => {
    if (!pendingFile) return;
    setItems(prev => [...prev, {
      file: pendingFile.file,
      previewUrl: pendingFile.previewUrl,
      category: activeCategory,
      note: pendingNote.trim(),
    }]);
    setPendingFile(null);
    setPendingNote('');
  };

  const removeItem = (index: number) => {
    setItems(prev => {
      const item = prev[index];
      if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (items.length === 0) { toast.error('Add at least one photo to submit the report'); return; }
    setSubmitting(true);
    setUploadProgress(0);

    try {
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('id, organization_id')
        .eq('id', bookingId)
        .maybeSingle();

      if (!bookingData) throw new Error('Booking not found');
      const resolvedOrgId = bookingData.organization_id || organizationId;

      const step = 100 / items.length;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const ext = item.file.name.split('.').pop() || 'jpg';
        const filePath = `${resolvedOrgId}/${bookingId}/${staffId}/inspection/${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('booking-photos')
          .upload(filePath, item.file, { upsert: false });

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from('booking_photos')
          .insert({
            booking_id: bookingId,
            photo_url: filePath,
            photo_type: 'inspection',
            media_type: 'photo',
            staff_id: staffId,
            organization_id: resolvedOrgId,
            inspection_note: item.note || null,
            issue_category: item.category,
          });

        if (dbError) throw dbError;
        setUploadProgress(Math.round((i + 1) * step));
      }

      toast.success(`Inspection report submitted (${items.length} photo${items.length === 1 ? '' : 's'})`);
      setItems([]);
      setIsOpen(false);
      onSubmitted?.();
    } catch (err) {
      console.error('Inspection submit error:', err);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  const close = () => {
    clearPending();
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); setIsOpen(open); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <AlertTriangle className="w-4 h-4" />
          Inspection Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Property Inspection Report</DialogTitle>
          <p className="text-sm text-muted-foreground">Document anything broken, missing, or low on inventory. Photos go to the client and admin.</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category selector */}
          <div>
            <p className="text-sm font-medium mb-2">Issue type</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CATEGORY_CONFIG) as InspectionItem['category'][]).map((cat) => {
                const { label, icon: Icon, color } = CATEGORY_CONFIG[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      activeCategory === cat ? color + ' ring-2 ring-offset-1 ring-current' : 'border-border bg-background hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photo capture */}
          {!pendingFile ? (
            <div>
              <p className="text-sm font-medium mb-2">Take a photo</p>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" tabIndex={-1} className={PICKER_CLASS} onChange={handleFileSelect} />
              <input ref={galleryRef} type="file" accept="image/*" tabIndex={-1} className={PICKER_CLASS} onChange={handleFileSelect} />
              <div className="flex gap-2">
                {isNative && Capacitor.isNativePlatform() ? (
                  <>
                    <Button type="button" variant="outline" className="flex-1 h-20 flex flex-col gap-1" onClick={handleNativeCamera}>
                      <Camera className="w-6 h-6" />
                      <span className="text-xs">Camera</span>
                    </Button>
                    <Button type="button" variant="outline" className="flex-1 h-20 flex flex-col gap-1" onClick={handleNativeGallery}>
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs">Gallery</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" className="flex-1 h-20 flex flex-col gap-1" onClick={() => cameraRef.current?.click()}>
                      <Camera className="w-6 h-6" />
                      <span className="text-xs">Camera</span>
                    </Button>
                    <Button type="button" variant="outline" className="flex-1 h-20 flex flex-col gap-1" onClick={() => galleryRef.current?.click()}>
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs">Gallery</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <img src={pendingFile.previewUrl} alt="Preview" className="w-full h-40 object-cover rounded-lg" />
                <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 w-7 h-7" onClick={clearPending}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                placeholder={`Describe what's ${CATEGORY_CONFIG[activeCategory].label.toLowerCase()}... (optional)`}
                value={pendingNote}
                onChange={(e) => setPendingNote(e.target.value)}
                className="resize-none min-h-[80px]"
              />
              <Button type="button" className="w-full gap-2" onClick={addItem}>
                <Plus className="w-4 h-4" />
                Add to Report
              </Button>
            </div>
          )}

          {/* Items queued */}
          {items.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Report items ({items.length})</p>
              <div className="space-y-2">
                {items.map((item, i) => {
                  const { label, color } = CATEGORY_CONFIG[item.category];
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30">
                      <img src={item.previewUrl} alt="" className="w-14 h-14 object-cover rounded-md shrink-0" />
                      <div className="flex-1 min-w-0">
                        <Badge variant="outline" className={`text-xs mb-1 ${color}`}>{label}</Badge>
                        {item.note && <p className="text-xs text-muted-foreground line-clamp-2">{item.note}</p>}
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="w-7 h-7 shrink-0" onClick={() => removeItem(i)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {submitting && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Uploading... {uploadProgress}%</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={close} disabled={submitting}>Cancel</Button>
            <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={submitting || items.length === 0}>
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</> : <><Send className="w-4 h-4" />Send Report ({items.length})</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
