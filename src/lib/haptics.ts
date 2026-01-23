export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light') {
  // Web-compatible haptics (works on some Android devices; iOS Safari is limited).
  // Safe no-op if unsupported.
  if (typeof navigator === 'undefined') return;
  const vibrate = (navigator as any).vibrate as undefined | ((pattern: number | number[]) => boolean);
  if (!vibrate) return;

  const duration = style === 'heavy' ? 20 : style === 'medium' ? 12 : 7;
  vibrate(duration);
}
