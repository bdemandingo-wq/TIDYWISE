import { useEffect, useState } from 'react';

export interface VisualViewport {
  /** Height of the area actually visible, in px. Shrinks when the keyboard opens. */
  height: number;
  /** How far the visual viewport is scrolled down inside the layout viewport. */
  offsetTop: number;
  /** True once a real measurement has been taken. */
  ready: boolean;
}

/**
 * Track the VISUAL viewport — the part of the page a phone is actually showing.
 *
 * WHY NOT `dvh`
 * `100dvh` accounts for the browser's URL bar and nothing else. It does NOT
 * shrink when the on-screen keyboard opens, because the keyboard changes the
 * VISUAL viewport while `dvh` describes the LAYOUT viewport. So a dialog capped
 * at `90dvh` and centred with `translate-y-[-50%]` is still positioned against
 * the full screen height while only the top half is visible, and its lower
 * portion — textarea, footer buttons — sits under the keyboard.
 *
 * That distinction cost a fix once already: an earlier attempt at this problem
 * used `100dvh` on the ask-ai tab and had to be replaced with a
 * `window.visualViewport` listener, which is what this generalises.
 *
 * Returns `ready: false` on browsers with no visualViewport (older desktop),
 * so callers can leave their CSS fallback in place rather than committing to a
 * measurement that will never arrive.
 */
export function useVisualViewportHeight(): VisualViewport {
  const [state, setState] = useState<VisualViewport>({
    height: 0,
    offsetTop: 0,
    ready: false,
  });

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
    if (!vv) return;

    let frame = 0;
    const read = () => {
      // Coalesce: iOS fires resize and scroll together while the keyboard
      // animates, and each one would otherwise re-render every open dialog.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setState({ height: vv.height, offsetTop: vv.offsetTop, ready: true });
      });
    };

    read();
    vv.addEventListener('resize', read);
    // offsetTop changes without a resize when iOS scrolls the layout viewport
    // to bring a focused input into view — which is exactly the moment a dialog
    // needs repositioning.
    vv.addEventListener('scroll', read);

    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
  }, []);

  return state;
}
