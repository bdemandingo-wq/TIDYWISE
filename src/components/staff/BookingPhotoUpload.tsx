import { useState, useRef } from 'react';
import { Camera, Upload, X, CheckCircle, Loader2, ImageIcon, Video, Play } from 'lucide-react';
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

const PHOTO_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const VIDEO_MAX_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BookingPhotoUpload({ bookingId, staffId, organizationId, onPhotoUploaded }: BookingPhotoUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [photoType, setPhotoType] = useState<'before' | 'after'>('after');
  const [mediaMode, setMediaMode] = useState<'photo' | 'video'>('photo');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { isNative, isLoading: cameraLoading, takePicture, pickFromGallery } = useNativeCamera();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (mediaMode === 'photo') {
      if (!ALLOWED_PHOTO_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
        toast.error('Only JPG, PNG, WebP and HEIC photos are supported.', { duration: 6000 });
        return;
      }
      if (file.size > PHOTO_MAX_SIZE) {
        toast.error('Photo must be under 10MB. Please try again with a smaller image.', { duration: 6000 });
        return;
      }
    } else {
      if (!ALLOWED_VIDEO_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.mov')) {
        toast.error('Please upload MP4 or MOV videos only.', { duration: 6000 });
        return;
      }
      if (file.size > VIDEO_MAX_SIZE) {
        toast.error('Video must be under 100MB. Try trimming it or recording a shorter clip.', { duration: 6000 });
        return;
      }
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Get video duration
    if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        setVideoDuration(Math.round(video.duration));
        URL.revokeObjectURL(video.src);
      };
      video.src = objectUrl;
    }
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
    setUploadProgress(0);

    // Simulate progress for UX (Supabase SDK doesn't expose upload progress)
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) { clearInterval(progressInterval); return 90; }
        return prev + (mediaMode === 'video' ? 2 : 10);
      });
    }, mediaMode === 'video' ? 500 : 200);

    try {
      const fileExt = selectedFile.name.split('.').pop() || (mediaMode === 'video' ? 'mp4' : 'jpg');
      const filePath = `${organizationId}/${bookingId}/${staffId}/${photoType}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('booking-photos')
        .upload(filePath, selectedFile);

      if (uploadError) throw new Error(uploadError.message);

      setUploadProgress(95);

      const { error: dbError } = await supabase
        .from('booking_photos')
        .insert({
          booking_id: bookingId,
          photo_url: filePath,
          photo_type: photoType,
          media_type: mediaMode,
          ...(staffId ? { staff_id: staffId } : {}),
          ...(organizationId ? { organization_id: organizationId } : {}),
        });

      if (dbError) throw new Error(dbError.message);

      clearInterval(progressInterval);
      setUploadProgress(100);

      toast.success(mediaMode === 'video' ? 'Video uploaded successfully!' : 'Photo uploaded successfully!');
      setIsOpen(false);
      setPreviewUrl(null);
      setSelectedFile(null);
      setVideoDuration(null);
      setUploadProgress(0);
      onPhotoUploaded?.();
    } catch (error) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      console.error('Upload error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      const lowerMsg = errMsg.toLowerCase();

      if (lowerMsg.includes('security') || lowerMsg.includes('policy') || lowerMsg.includes('row-level') || lowerMsg.includes('rls') || lowerMsg.includes('not allowed') || lowerMsg.includes('violates')) {
        toast.error('Upload permission denied. Please contact your admin to check your account access.', { duration: 6000 });
      } else if (lowerMsg.includes('bucket') || lowerMsg.includes('not found')) {
        toast.error('Media storage is not set up yet. Please contact your admin.', { duration: 6000 });
      } else if (lowerMsg.includes('payload') || lowerMsg.includes('too large') || lowerMsg.includes('size')) {
        toast.error(mediaMode === 'video' ? 'Video must be under 100MB. Try trimming it.' : 'Photo must be under 10MB.', { duration: 6000 });
      } else if (lowerMsg.includes('network') || lowerMsg.includes('fetch') || lowerMsg.includes('failed to fetch') || lowerMsg.includes('timeout')) {
        toast.error(mediaMode === 'video' ? 'Video upload timed out. Try on WiFi for large videos.' : 'Upload failed. Check your connection and try again.', { duration: 6000 });
      } else {
        toast.error(`Failed to upload: ${errMsg.length > 120 ? 'Please try again or contact support.' : errMsg}`, { duration: 6000 });
      }
    } finally {
      setUploading(false);
    }
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    setSelectedFile(null);
    setVideoDuration(null);
  };

  const isVideo = selectedFile?.type?.startsWith('video/') || selectedFile?.name?.toLowerCase().endsWith('.mov');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) clearPreview(); }}>
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
          {/* Media Mode Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mediaMode === 'photo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setMediaMode('photo'); clearPreview(); }}
              className="flex-1 gap-1.5"
            >
              <Camera className="w-4 h-4" />
              📷 Photo
            </Button>
            <Button
              type="button"
              variant={mediaMode === 'video' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setMediaMode('video'); clearPreview(); }}
              className="flex-1 gap-1.5"
            >
              <Video className="w-4 h-4" />
              🎥 Video
            </Button>
          </div>

          {/* Before/After Toggle */}
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

          {/* Upload Area */}
          {!previewUrl ? (
            mediaMode === 'photo' ? (
              isNative && Capacitor.isNativePlatform() ? (
                <div className="flex flex-col gap-3">
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={handleNativeCamera} disabled={cameraLoading}>
                    {cameraLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <><Camera className="w-8 h-8" /><span>Take Photo</span></>}
                  </Button>
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={handleNativeGallery} disabled={cameraLoading}>
                    <ImageIcon className="w-8 h-8" /><span>Choose from Gallery</span>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="w-8 h-8" /><span>Take Photo</span>
                  </Button>
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.removeAttribute('capture');
                      fileInputRef.current.click();
                      fileInputRef.current.setAttribute('capture', 'environment');
                    }
                  }}>
                    <ImageIcon className="w-8 h-8" /><span>Choose from Gallery</span>
                  </Button>
                </div>
              )
            ) : (
              /* Video upload buttons */
              <div className="flex flex-col gap-3">
                <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/x-m4v,.mov,.mp4" className="hidden" onChange={handleFileSelect} />
                {isNative && Capacitor.isNativePlatform() ? (
                  <>
                    <input ref={fileInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleFileSelect} />
                    <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => fileInputRef.current?.click()}>
                      <Video className="w-8 h-8" /><span>Record Video</span>
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => {
                    if (videoInputRef.current) {
                      videoInputRef.current.setAttribute('capture', 'environment');
                      videoInputRef.current.click();
                      videoInputRef.current.removeAttribute('capture');
                    }
                  }}>
                    <Video className="w-8 h-8" /><span>Record Video</span>
                  </Button>
                )}
                <Button type="button" variant="outline" className="h-24 flex flex-col gap-2" onClick={() => {
                  if (videoInputRef.current) {
                    videoInputRef.current.removeAttribute('capture');
                    videoInputRef.current.click();
                  }
                }}>
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

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Uploading... {uploadProgress}%</p>
            </div>
          )}

          {/* Actions */}
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
