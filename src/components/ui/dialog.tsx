import * as React from "react";
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Does the caller already manage its own scrolling?
 *
 * 27 of the 92 DialogContent instances set their own `overflow-*`, usually
 * paired with a hand-tuned max-height. Adding `overflow-y-auto` unconditionally
 * would nest a scroller inside a scroller in those — a subtle bug that is hard
 * to see and easy to blame on the content rather than the container. So the
 * primitive only takes over scrolling when nobody else has claimed it.
 */
const callerHandlesOverflow = (className?: string) =>
  typeof className === 'string' && /(^|\s)overflow-/.test(className);

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, ...props }, ref) => {
  const vv = useVisualViewportHeight();

  /**
   * Keep the dialog inside the VISIBLE area when the keyboard is open.
   *
   * Two separate problems, both from the same cause — the dialog is positioned
   * against the LAYOUT viewport, which iOS does not shrink for the keyboard:
   *
   *  1. Height. Capped to the visual viewport minus a margin, so a tall dialog
   *     scrolls internally instead of running off the bottom.
   *  2. Position. `top-[50%]` is 50% of the layout viewport, which with the
   *     keyboard open is well below the middle of what you can see. Re-centred
   *     on the visual viewport instead.
   *
   * Applied as INLINE STYLE deliberately. 27 instances already set their own
   * `max-h-[90vh]`-style cap, and tailwind-merge would let those win over any
   * class the primitive added — so they would have stayed broken while looking
   * fixed. Inline beats every class, so those 27 come along without being
   * edited, and their own cap simply becomes a ceiling above the real one.
   *
   * Falls back to the CSS classes untouched when visualViewport is unavailable.
   */
  // Only override while the visible area is ACTUALLY reduced — i.e. the
  // keyboard (or similar) is covering part of the screen.
  //
  // The first version applied the inline cap unconditionally whenever
  // visualViewport existed, which is every modern browser including desktop
  // with nothing open. An inline style beats a class regardless of which value
  // is smaller, so `vv.height - 32` silently REPLACED a caller's
  // `max-h-[80vh]` — and being larger, loosened it. 27 dialogs whose authors
  // had deliberately capped them got taller everywhere, all the time. Measured:
  // 1048px against an 864px cap on a 1080px desktop.
  //
  // CSS min() does not fix this: `100%` resolves against the containing block,
  // not against the caller's class, and inline still wins outright. The only
  // way an inline value cannot loosen a class is to not set it unless it is
  // genuinely tighter — which is exactly when the viewport has shrunk.
  const layoutHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  const viewportIsReduced = vv.ready && layoutHeight > 0 && vv.height < layoutHeight - 100;

  const viewportStyle: React.CSSProperties = viewportIsReduced
    ? {
        maxHeight: `${Math.max(0, vv.height - 32)}px`,
        top: `${vv.offsetTop + vv.height / 2}px`,
      }
    : {};

  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-1.5rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-3 md:gap-4 border bg-background p-4 md:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        !callerHandlesOverflow(className) && "overflow-y-auto overscroll-contain",
        className,
      )}
      style={{ ...viewportStyle, ...style }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 text-foreground bg-muted/60 hover:bg-muted opacity-90 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base md:text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
