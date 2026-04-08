export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light') {
  // Web-compatible haptics (works on some Android devices; iOS Safari is limited).
  // Safe no-op if unsupported.
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;

  const duration = style === 'heavy' ? 20 : style === 'medium' ? 12 : 7;
  try {
    navigator.vibrate(duration);
  } catch {
    // Some browsers expose vibrate but require navigator as the invocation context.
    // Fail silently so UI interactions never break.
  }
}
