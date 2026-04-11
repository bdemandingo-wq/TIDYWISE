import { Capacitor } from '@capacitor/core';

export async function exportFile(
  filename: string,
  content: string | Blob,
  mimeType: string
) {
  // On web, use the traditional download approach
  if (!Capacitor.isNativePlatform()) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // On iOS/Android native, write to cache and open share sheet
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const base64 = typeof content === 'string'
      ? btoa(unescape(encodeURIComponent(content)))
      : await blobToBase64(content);

    const result = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });

    await Share.share({
      title: filename,
      url: result.uri,
      dialogTitle: 'Export file',
    });
  } catch (e) {
    // Fallback to web approach if native plugins aren't available
    console.warn('Native export failed, falling back to web download:', e);
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
