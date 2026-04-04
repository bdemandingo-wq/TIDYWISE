import { useRef, useState } from 'react';
import { Camera, X, CheckCircle, Loader2, ImageIcon, Video } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useNativeCamera } from '@/hooks/useNativeCamera';

interface BookingPhotoUploadProps {
  bookingId: string;
  staffId: string;
  organizationId: string;
  onPhotoUploaded?: () => void;
}

const PHOTO_MAX_SIZE = 10 * 1024 * 1024;
const VIDEO_MAX_SIZE = 100 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
const PICKER_INPUT_CLASS = 'absolute left-0 top-0 h-px w-px opacity-0 pointer-events-none';

type MediaMode = 'photo' | 'video';

type BookingLookup = {
  id: string;
  organization_id: string | null;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function openPicker(input: HTMLInputElement | null) {
  if (!input) return;

  const pickerInput = input as HTMLInputElement & { showPicker?: () => void };

  try {
    if (typeof pickerInput.showPicker === 'function') {
      pickerInput.showPicker();
      return;
    }
  } catch (error) {
    console.warn('showPicker failed, falling back to click()', error);
  }

  pickerInput.click();
}

function getValidationError(file: File, mediaMode: MediaMode): string | null {
  if (mediaMode === 'photo') {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
      return 'Only JPG, PNG, WebP and HEIC photos are supported.';
    }

    if (file.size > PHOTO_MAX_SIZE) {
      return 'Photo must be under 10MB. Please try again with a smaller image.';
    }

    return null;
  }

  if (!ALLOWED_VIDEO_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.mov')) {
    return 'Please upload MP4 or MOV videos only.';
  }

  if (file.size > VIDEO_MAX_SIZE) {
    return 'Video must be under 100MB. Try trimming it or recording a shorter clip.';
  }

  return null;
}

function getUploadErrorMessage(error: unknown, mediaMode: MediaMode): string {
  const errMsg = error instanceof Error ? error.message : String(error);
  const lowerMsg = errMsg.toLowerCase();

  if (lowerMsg.includes('security') || lowerMsg.includes('policy') || lowerMsg.includes('row-level') || lowerMsg.includes('rls') || lowerMsg.includes('not allowed') || lowerMsg.includes('violates')) {
    return 'Upload permission denied. Please contact your admin to check your account access.';
  }

  if (lowerMsg.includes('bucket') || lowerMsg.includes('not found')) {
    return 'Media storage is not set up yet. Please contact your admin.';
  }

  if (lowerMsg.includes('payload') || lowerMsg.includes('too large') || lowerMsg.includes('size')) {
    return mediaMode === 'video'
      ? 'Video must be under 100MB. Try trimming it.'
      : 'Photo must be under 10MB.';
  }

  if (lowerMsg.includes('network') || lowerMsg.includes('fetch') || lowerMsg.includes('failed to fetch') || lowerMsg.includes('timeout')) {
    return mediaMode === 'video'
      ? 'Video upload timed out. Try on WiFi for large videos.'
      : 'Upload failed. Check your connection and try again.';
  }

  if (lowerMsg.includes('booking') || lowerMsg.includes('uuid')) {
    return 'Could not identify this job. Refresh the page and try again.';
  }

  return errMsg.length > 120 ? 'Upload failed. Please try again.' : `Failed to upload: ${errMsg}`;
}

export function BookingPhotoUpload({ bookingId, staffId, organizationId, onPhotoUploaded }: BookingPhotoUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [photoType, setPhotoType] = useState<'before' | 'after'>('after');
  const [mediaMode, setMediaMode] = useState<MediaMode>('photo');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  const cameraPhotoInputRef = useRef<HTMLInputElement>(null);
  const libraryPhotoInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoInputRef = useRef<HTMLInputElement>(null);
  const libraryVideoInputRef = useRef<HTMLInputElement>(null);
  const { isNative, isLoading: cameraLoading, takePicture, pickFromGallery } = useNativeCamera();

  const resetPickerInputs = () => {
    [cameraPhotoInputRef, libraryPhotoInputRef, cameraVideoInputRef, libraryVideoInputRef].forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
  };

  const clearPreview = () => {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    setSelectedFile(null);
    setVideoDuration(null);
    resetPickerInputs();
  };

  const setPreviewForFile = (file: File, nextPreviewUrl: string) => {
    const validationError = getValidationError(file, mediaMode);
    if (validationError) {
      if (nextPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(nextPreviewUrl);
      }
      toast.error(validationError, { duration: 6000 });
      return;
    }

    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
    setVideoDuration(null);

    if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        setVideoDuration(Math.round(video.duration));
      };
      video.src = nextPreviewUrl;
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPreviewForFile(file, objectUrl);
  };

  const handleNativeCamera = async () => {
    const result = await takePicture('camera');
    if (result?.file && result.dataUrl) {
      setPreviewForFile(result.file, result.dataUrl);
    }
  };

  const handleNativeGallery = async () => {
    const result = await pickFromGallery();
    if (result?.file && result.dataUrl) {
      setPreviewForFile(result.file, result.dataUrl);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + (mediaMode === 'video' ? 2 : 10);
      });
    }, mediaMode === 'video' ? 500 : 200);

    let uploadedPath: string | null = null;

    try {
      const { data: bookingData, error: bookingLookupError } = await supabase
        .from('bookings')
        .select('id, organization_id')
        .eq('id', bookingId)
        .maybeSingle<BookingLookup>();

      if (bookingLookupError) throw bookingLookupError;
      if (!bookingData?.id) {
        throw new Error('Selected booking was not found.');
      }

      const resolvedOrgId = bookingData.organization_id || organizationId;
      if (!resolvedOrgId) {
        throw new Error('Selected booking is missing an organization.');
      }

      const fileExt = selectedFile.name.split('.').pop() || (mediaMode === 'video' ? 'mp4' : 'jpg');
      const filePath = `${resolvedOrgId}/${bookingId}/${staffId}/${photoType}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('booking-photos')
        .upload(filePath, selectedFile, { upsert: false });

      if (uploadError) throw uploadError;
      uploadedPath = filePath;

      setUploadProgress(95);

      const { error: dbError } = await supabase
        .from('booking_photos')
        .insert({
          booking_id: bookingId,
          photo_url: filePath,
          photo_type: photoType,
          media_type: mediaMode,
          staff_id: staffId,
          organization_id: resolvedOrgId,
        });

      if (dbError) throw dbError;

      clearInterval(progressInterval);
      setUploadProgress(100);

      toast.success(mediaMode === 'video' ? 'Video uploaded successfully!' : 'Photo uploaded successfully!');
      setIsOpen(false);
      clearPreview();
      setUploadProgress(0);
      onPhotoUploaded?.();
    } catch (error) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      console.error('Upload error:', error);

      if (uploadedPath) {
        await supabase.storage.from('booking-photos').remove([uploadedPath]);
      }

      toast.error(getUploadErrorMessage(error, mediaMode), { duration: 6000 });
    } finally {
      setUploading(false);
    }
  };

  const isVideo = selectedFile?.type?.startsWith('video/') || selectedFile?.name?.toLowerCase().endsWith('.mov');

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) clearPreview();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Camera className="w-4 h-4" />
          Add Media
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Cleaning Media</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mediaMode === 'photo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMediaMode('photo');
                clearPreview();
              }}
              className="flex-1 gap-1.5"
            >
              <Camera className="w-4 h-4" />
              📷 Photo
            </Button>
            <Button
              type="button"
              variant={mediaMode === 'video' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMediaMode('video');
                clearPreview();
              }}
              className="flex-1 gap-1.5"
            >
              <Video className="w-4 h-4" />
              🎥 Video
            </Button>
          </div>

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

          {mediaMode === 'video' && (
            <p className="text-xs text-muted-foreground text-center">Up to 2 minutes · MP4 or MOV · Max 100MB</p>
          )}

          <input
            ref={cameraPhotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            className={PICKER_INPUT_CLASS}
            onChange={handleFileSelect}
          />
          <input
            ref={libraryPhotoInputRef}
            type="file"
            accept="image/*"
            tabIndex={-1}
            className={PICKER_INPUT_CLASS}
            onChange={handleFileSelect}
          />
          <input
            ref={cameraVideoInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-m4v,.mov,.mp4"
            capture="environment"
            tabIndex={-1}
            className={PICKER_INPUT_CLASS}
            onChange={handleFileSelect}
          />
          <input
            ref={libraryVideoInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-m4v,.mov,.mp4"
            tabIndex={-1}
            className={PICKER_INPUT_CLASS}
            onChange={handleFileSelect}
          />

          {!previewUrl ? (
            mediaMode === 'photo' ? (
              isNative && Capacitor.isNativePlatform() ? (
                <div className="flex flex-col gap-3">
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={handleNativeCamera} disabled={cameraLoading || uploading}>
                    {cameraLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <><Camera className="w-8 h-8" /><span>Take Photo</span></>}
                  </Button>
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={handleNativeGallery} disabled={cameraLoading || uploading}>
                    <ImageIcon className="w-8 h-8" /><span>Choose from Gallery</span>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => openPicker(cameraPhotoInputRef.current)} disabled={uploading}>
                    <Camera className="w-8 h-8" /><span>Take Photo</span>
                  </Button>
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => openPicker(libraryPhotoInputRef.current)} disabled={uploading}>
                    <ImageIcon className="w-8 h-8" /><span>Choose from Gallery</span>
                  </Button>
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => openPicker(cameraVideoInputRef.current)} disabled={uploading}>
                  <Video className="w-8 h-8" /><span>Record Video</span>
                </Button>
                <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => openPicker(libraryVideoInputRef.current)} disabled={uploading}>
                  <ImageIcon className="w-8 h-8" /><span>Choose from Library</span>
                </Button>
              </div>
            )
          ) : (
            <div className="relative">
              {isVideo ? (
                <video
                  src={previewUrl}
                  controls
                  className="w-full max-h-48 rounded-lg bg-black"
                  playsInline
                />
              ) : (
                <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
              )}
              <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 w-8 h-8" onClick={clearPreview}>
                <X className="w-4 h-4" />
              </Button>
              {selectedFile && (
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatFileSize(selectedFile.size)}</span>
                  {videoDuration != null && (
                    <span>{Math.floor(videoDuration / 60)}:{String(videoDuration % 60).padStart(2, '0')}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {uploading && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Uploading... {uploadProgress}%</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1 gap-2" onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
              ) : (
                <><CheckCircle className="w-4 h-4" />Upload {mediaMode === 'video' ? 'Video' : 'Photo'}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
