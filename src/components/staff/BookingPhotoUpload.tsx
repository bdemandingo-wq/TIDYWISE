import { useState } from 'react';
import { Camera, Upload, X, CheckCircle, Loader2, ImageIcon } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useNativeCamera } from '@/hooks/useNativeCamera';

interface BookingPhotoUploadProps {
  bookingId: string;
  staffId: string;
  organizationId: string;
  onPhotoUploaded?: () => void;
}

export function BookingPhotoUpload({ bookingId, staffId, organizationId, onPhotoUploaded }: BookingPhotoUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState<'before' | 'after'>('after');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const { isNative, isLoading: cameraLoading, takePicture, pickFromGallery } = useNativeCamera();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleNativeCamera = async () => {
    const result = await takePicture('camera');
    if (result) {
      setPreviewUrl(result.dataUrl);
      setSelectedFile(result.file || null);
    }
  };

  const handleNativeGallery = async () => {
    const result = await pickFromGallery();
    if (result) {
      setPreviewUrl(result.dataUrl);
      setSelectedFile(result.file || null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      // Path: org_id/booking_id/filename - org_id prefix enforced by storage RLS
      const filePath = `${organizationId}/${bookingId}/${photoType}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('booking-photos')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Save the storage PATH (not URL) to database for signed URL generation
      const { error: dbError } = await supabase
        .from('booking_photos')
        .insert({
          booking_id: bookingId,
          staff_id: staffId,
          organization_id: organizationId,
          photo_url: filePath, // Store path, not public URL
          photo_type: photoType,
        });

      if (dbError) throw dbError;

      toast.success('Photo uploaded successfully!');
      setIsOpen(false);
      setPreviewUrl(null);
      setSelectedFile(null);
      onPhotoUploaded?.();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    setSelectedFile(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Camera className="w-4 h-4" />
          Add Photo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Cleaning Photo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo Type Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={photoType === 'before' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPhotoType('before')}
              className="flex-1"
            >
              Before
            </Button>
            <Button
              type="button"
              variant={photoType === 'after' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPhotoType('after')}
              className="flex-1"
            >
              After
            </Button>
          </div>

          {/* Upload Area */}
          {!previewUrl ? (
            isNative && Capacitor.isNativePlatform() ? (
              /* Native camera buttons */
              <div className="flex flex-col gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                  onClick={handleNativeCamera}
                  disabled={cameraLoading}
                >
                  {cameraLoading ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-8 h-8" />
                      <span>Take Photo</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                  onClick={handleNativeGallery}
                  disabled={cameraLoading}
                >
                  <ImageIcon className="w-8 h-8" />
                  <span>Choose from Gallery</span>
                </Button>
              </div>
            ) : (
              /* Web file input fallback */
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="w-10 h-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Click to select or take a photo</p>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>
            )
          ) : (
            <div className="relative">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-48 object-cover rounded-lg"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 w-8 h-8"
                onClick={clearPreview}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Upload Photo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
