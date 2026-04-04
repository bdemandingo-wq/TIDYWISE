import { useState, useRef } from 'react';
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
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

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedTypes.includes(selectedFile.type) && !selectedFile.name.toLowerCase().endsWith('.heic')) {
      toast.error('Only JPG, PNG, WebP and HEIC photos are supported.', { duration: 6000 });
      return;
    }

    // Validate file size (10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('Photo must be under 10MB. Please try again with a smaller image.', { duration: 6000 });
      return;
    }

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop() || 'jpg';
      // Path: org_id/booking_id/staff_id/type/timestamp.ext
      const filePath = `${organizationId}/${bookingId}/${staffId}/${photoType}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('booking-photos')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Save the storage PATH to database for signed URL generation
      const { error: dbError } = await supabase
        .from('booking_photos')
        .insert({
          booking_id: bookingId,
          staff_id: staffId,
          organization_id: organizationId,
          photo_url: filePath,
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
      const errMsg = error instanceof Error ? error.message : String(error);
      const lowerMsg = errMsg.toLowerCase();
      
      if (lowerMsg.includes('security') || lowerMsg.includes('policy') || lowerMsg.includes('row-level') || lowerMsg.includes('rls') || lowerMsg.includes('not allowed') || lowerMsg.includes('violates')) {
        toast.error('Photo upload permission denied. Please contact your admin to check your account access.', { duration: 6000 });
      } else if (lowerMsg.includes('bucket') || lowerMsg.includes('not found')) {
        toast.error('Photo storage is not set up yet. Please contact your admin.', { duration: 6000 });
      } else if (lowerMsg.includes('payload') || lowerMsg.includes('too large') || lowerMsg.includes('size')) {
        toast.error('Photo must be under 10MB. Please try again with a smaller image.', { duration: 6000 });
      } else if (lowerMsg.includes('network') || lowerMsg.includes('fetch') || lowerMsg.includes('failed to fetch')) {
        toast.error('Upload failed. Check your internet connection and try again.', { duration: 6000 });
      } else {
        toast.error(`Failed to upload photo: ${errMsg.length > 120 ? 'Please try again or contact support.' : errMsg}`, { duration: 6000 });
      }
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
              <div className="flex flex-col gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="w-8 h-8" />
                  <span>Take Photo</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-24 flex flex-col gap-2"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.removeAttribute('capture');
                      fileInputRef.current.click();
                      fileInputRef.current.setAttribute('capture', 'environment');
                    }
                  }}
                >
                  <ImageIcon className="w-8 h-8" />
                  <span>Choose from Gallery</span>
                </Button>
              </div>
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
