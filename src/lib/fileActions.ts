import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/**
 * Preview / download helpers that work on iOS (WKWebView) as well as the web.
 *
 * Why this exists: the obvious browser approach breaks on native.
 *   - `<a download>` is ignored by WKWebView, so downloads silently do nothing.
 *   - `window.open(blobUrl)` is blocked on native, so previews silently do nothing.
 *   - Revoking an object URL immediately after .click() can race the browser
 *     and kill the download even on desktop.
 *
 * On native we hand a real https signed URL to the in-app browser for preview,
 * and write to the filesystem + share sheet for download (so the cleaner can
 * "Save to Files" or "Save Image"). On web we keep the normal blob flow.
 */

const isNative = () => Capacitor.isNativePlatform();

async function getSignedUrl(bucket: string, path: string, expiresIn = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error ?? new Error('Could not create file link');
  return data.signedUrl;
}

/** Strip anything that can't live in a filesystem path. */
function safeFileName(name: string): string {
  return (name || 'file').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Open a stored file for viewing. */
export async function previewFile(bucket: string, path: string): Promise<void> {
  try {
    const url = await getSignedUrl(bucket, path);

    if (isNative()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    }

    const win = window.open(url, '_blank', 'noopener');
    if (!win) toast.error('Popup blocked. Allow popups for this site to preview.');
  } catch (err) {
    console.error('[fileActions] preview failed:', err);
    toast.error('Failed to preview file');
  }
}

/** Save any blob (generated CSV, fetched file, ...) to the device. */
export async function saveBlob(data: Blob, fileName: string): Promise<void> {
  try {
    const name = safeFileName(fileName);

    if (isNative()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);

      const base64 = await blobToBase64(data);
      const written = await Filesystem.writeFile({
        path: name,
        data: base64,
        directory: Directory.Cache,
      });

      // Share sheet is the iOS-native way to let the user keep the file.
      await Share.share({ title: name, url: written.uri });
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    // Delay the revoke — revoking immediately can cancel the download.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  } catch (err) {
    console.error('[fileActions] save failed:', err);
    toast.error('Failed to save file');
  }
}

/** Download a file out of Supabase storage to the device. */
export async function downloadFile(bucket: string, path: string, fileName: string): Promise<void> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) throw error ?? new Error('No file data');
    await saveBlob(data, fileName);
  } catch (err) {
    console.error('[fileActions] download failed:', err);
    toast.error('Failed to download file');
  }
}
