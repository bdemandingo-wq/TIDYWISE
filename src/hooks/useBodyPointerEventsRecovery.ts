import { useEffect } from 'react';

/**
 * Undo a stranded `pointer-events: none` on <body>.
 *
 * Radix's Dialog/Sheet primitives set `pointer-events: none` on document.body
 * while a modal is open, and remove it on close. If a close ever races the
 * cleanup — an abrupt unmount, an interrupted exit animation, two closes
 * arriving at once — the style is left behind and **the entire app becomes
 * unclickable** with nothing on screen to explain it. Reloading is the only
 * way out, which is what a user experiencing it will do.
 *
 * This is deliberately insurance rather than a diagnosis. If the real cause of
 * the mobile sidebar's "can't click after swiping" turns out to be something
 * else, this changes nothing and costs nothing: it only ever acts when body is
 * locked AND no modal is actually open, which is a state that is never correct.
 *
 * Circumstantial evidence it is the right layer: AdminSidebar's SheetContent
 * already carries a hand-added `pointer-events-auto`. That patches the sheet's
 * own content — which was never the part that stopped responding — and is the
 * fix you reach for when you meet this symptom and don't get as far as body.
 */
export function useBodyPointerEventsRecovery() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;

    /** Any Radix overlay currently open and therefore entitled to lock body. */
    const modalIsOpen = () =>
      document.querySelector(
        '[data-radix-popper-content-wrapper],[role="dialog"][data-state="open"],[data-state="open"][role="alertdialog"]',
      ) !== null;

    const recover = () => {
      if (body.style.pointerEvents !== 'none') return;
      if (modalIsOpen()) return; // legitimately locked, leave it alone
      body.style.removeProperty('pointer-events');
    };

    // Re-check a tick after body's style changes. The delay matters: Radix sets
    // the lock and mounts the overlay in the same frame, so checking
    // synchronously would see the lock without yet seeing the dialog and undo a
    // legitimate one.
    let pending: number | undefined;
    const schedule = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(recover, 300);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(body, { attributes: true, attributeFilter: ['style'] });

    // Also check when the user tries to interact. With body locked, hit-testing
    // skips its subtree and the event still reaches document, so this fires
    // exactly when someone has discovered the problem by tapping.
    document.addEventListener('pointerdown', recover, true);
    document.addEventListener('touchstart', recover, { capture: true, passive: true });

    return () => {
      window.clearTimeout(pending);
      observer.disconnect();
      document.removeEventListener('pointerdown', recover, true);
      document.removeEventListener('touchstart', recover, true);
    };
  }, []);
}
