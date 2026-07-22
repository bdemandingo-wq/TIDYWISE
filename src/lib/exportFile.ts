import { saveBlob } from '@/lib/fileActions';

/**
 * Legacy shim. This helper was written but never imported anywhere, and it
 * duplicated the native/web branching that now lives in fileActions.ts.
 * Kept as a thin delegate so any future/generated call sites still work.
 *
 * Prefer importing { saveBlob } from '@/lib/fileActions' directly.
 */
export async function exportFile(
  filename: string,
  content: string | Blob,
  mimeType: string,
): Promise<void> {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  await saveBlob(blob, filename);
}
