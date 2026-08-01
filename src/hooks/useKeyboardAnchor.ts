import * as React from 'react';
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight';

/** Elements that raise the on-screen keyboard. */
const TEXT_ENTRY = 'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),textarea,[contenteditable=""],[contenteditable="true"]';

export interface KeyboardAnchor {
  /** True while the surface is pinned above the keyboard. */
  anchored: boolean;
  /** Inline style to spread onto the surface. Empty object when not anchored. */
  style: React.CSSProperties;
}

/**
 * Pin an overlay to the TOP EDGE OF THE KEYBOARD, iMessage-style.
 *
 * WHAT THIS REPLACES
 * The first attempt re-centred the dialog on the visual viewport. That keeps it
 * on screen, which is not the same as usable: centring puts the middle of the
 * dialog at the middle of the visible strip, so the field you are typing into
 * ends up wherever it happens to fall — usually above your thumbs, sometimes
 * still under the keyboard on a tall dialog. What you actually want is the
 * keyboard at the bottom, the input directly above it, and everything else
 * scrolling behind that.
 *
 * So this is BOTTOM-anchored, not centre-anchored.
 *
 * THE MATH
 * `position: fixed` resolves against the LAYOUT viewport, which iOS does not
 * shrink for the keyboard. The visual viewport's bottom edge, in layout
 * coordinates, is `offsetTop + height`. The gap below it — the keyboard — is
 * therefore `layoutHeight - (offsetTop + height)`. Setting that as `bottom`
 * puts the surface's lower edge exactly on top of the keyboard, and capping
 * `maxHeight` to the visible height makes the content scroll above it rather
 * than push the input off.
 *
 * WHEN IT ENGAGES — two conditions, and both are necessary:
 *
 *   1. The visible area is genuinely reduced. Not merely "visualViewport
 *      exists", which is every modern browser including a desktop with nothing
 *      open. An earlier version of the height cap got this wrong and loosened
 *      27 dialogs' deliberate max-heights everywhere, all the time.
 *
 *   2. Focus is on a text-entry element INSIDE this surface. This is what makes
 *      "a dialog with no input never moves" true by construction rather than by
 *      guesswork: a confirmation dialog has nothing focusable that raises a
 *      keyboard, so condition 2 can never hold for it. It also means a surface
 *      does not lurch when a keyboard is raised by something behind it.
 *
 * The style is returned rather than applied, so each primitive composes it with
 * its own positioning — a centred dialog has to cancel its Y translate, a
 * bottom sheet is already flush and must not be given one.
 */
export function useKeyboardAnchor(
  ref: React.RefObject<HTMLElement>,
  options: { centeredX?: boolean } = {},
): KeyboardAnchor {
  const vv = useVisualViewportHeight();
  const [focusInside, setFocusInside] = React.useState(false);

  React.useEffect(() => {
    const check = () => {
      const el = ref.current;
      const active = document.activeElement;
      setFocusInside(
        Boolean(el && active && el.contains(active) && active.matches(TEXT_ENTRY)),
      );
    };
    check();
    // focusin/focusout bubble; focus/blur do not.
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, [ref]);

  const layoutHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  const reduced = vv.ready && layoutHeight > 0 && vv.height < layoutHeight - 100;
  const anchored = reduced && focusInside;

  // Once pinned, make sure the field itself is the part you can see. Capping the
  // height keeps the input inside the box; it does not guarantee the box is
  // scrolled to it when the content above is long.
  React.useEffect(() => {
    if (!anchored) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && ref.current?.contains(active)) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [anchored, vv.height, vv.offsetTop, ref]);

  if (!anchored) return { anchored: false, style: {} };

  const keyboardInset = Math.max(0, layoutHeight - (vv.offsetTop + vv.height));

  return {
    anchored: true,
    style: {
      top: 'auto',
      bottom: `${keyboardInset}px`,
      maxHeight: `${vv.height}px`,
      // A centred dialog carries translate(-50%, -50%). The X half still
      // centres it horizontally; the Y half would drag it back up off the
      // keyboard, so it is cancelled rather than kept.
      ...(options.centeredX ? { transform: 'translateX(-50%)' } : {}),
    },
  };
}
