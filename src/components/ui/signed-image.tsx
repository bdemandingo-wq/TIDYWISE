import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageIcon } from 'lucide-react';
import { getSignedUrl, extractStoragePath } from '@/hooks/useSignedUrl';

interface SignedImageProps {
  /** Storage path or URL - can be raw path, storage: prefixed, or legacy public URL */
  src: string | null | undefined;
  /** Storage bucket name (default: booking-photos) */
  bucket?: string;
  /** Alt text for the image */
  alt: string;
  /** CSS class name for the image */
  className?: string;
  /** Fallback element if image fails to load */
  fallback?: React.ReactNode;
  /** Signed URL expiration in seconds (default: 3600 = 1 hour) */
  expiresIn?: number;
}

/**
 * Image component that handles signed URLs for private storage buckets
 * Automatically generates signed URLs for storage paths
 */
export function SignedImage({
  src,
  bucket = 'booking-photos',
  alt,
  className = '',
  fallback,
  expiresIn = 3600,
}: SignedImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      setError(true);
      return;
    }

    const loadImage = async () => {
      setLoading(true);
      setError(false);

      try {
        // Check if it's a storage: prefixed path
        if (src.startsWith('storage:')) {
          const [, bucketName, ...pathParts] = src.split(':');
          const path = pathParts.join(':');
          const signedUrl = await getSignedUrl(bucketName, path, expiresIn);
          setImageUrl(signedUrl);
        }
        // Check if it's already a full URL (legacy data or external)
        else if (src.startsWith('http')) {
          // Try to extract path from Supabase URL and get signed URL
          const storagePath = extractStoragePath(src);
          if (storagePath && storagePath !== src) {
            const signedUrl = await getSignedUrl(bucket, storagePath, expiresIn);
            setImageUrl(signedUrl);
          } else {
            // External URL or can't extract path - use as-is
            setImageUrl(src);
          }
        }
        // Raw storage path
        else {
          const signedUrl = await getSignedUrl(bucket, src, expiresIn);
          setImageUrl(signedUrl);
        }
      } catch (err) {
        console.error('Error loading signed image:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [src, bucket, expiresIn]);

  if (loading) {
    // Let callers control sizing via className (important for small avatars/logos).
    return <Skeleton className={className} />;
  }

  if (error || !imageUrl) {
    return fallback || (
      <div className={`${className} flex items-center justify-center bg-muted rounded`}>
        <ImageIcon className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
}
