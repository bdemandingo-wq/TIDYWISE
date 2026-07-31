import { AnchorHTMLAttributes, MouseEvent } from 'react';

/**
 * A link to another section of the SAME page.
 *
 * Use this instead of a bare `<a href="#section">` anywhere in this app.
 *
 * WHY IT EXISTS
 * A plain hash link changes the URL, and two things in this codebase react
 * badly to that:
 *
 *  1. `useAppStateHandler` installs a global `popstate` interceptor. Until
 *     2026-07-31 it ran on every page for every visitor, and because
 *     `getParentRoute()` falls through to '/dashboard' for any unlisted path,
 *     a hash change on a marketing page redirected to /dashboard — which for a
 *     signed-out visitor is /login. Measured: clicking the pricing page's own
 *     "See the full feature comparison" link landed on a login screen. That
 *     interceptor is now scoped to signed-in users inside the app, so this
 *     particular trap is closed — but it was invisible for weeks and there is
 *     no reason to re-arm it.
 *
 *  2. Native builds use HashRouter (App.tsx:281), where the URL is `/#/pricing`
 *     and the hash IS the route. A `href="#faq"` there does not mean "scroll to
 *     faq", it means "navigate to the route /faq", which does not exist. So a
 *     hash link that works on web silently breaks in the iOS app.
 *
 * Scrolling directly sidesteps both. The `href` is kept so middle-click,
 * open-in-new-tab, keyboard focus and screen-reader announcement all still
 * work — only the default navigation is suppressed.
 */
interface InPageLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Target section id, WITH the leading '#'. */
  href: string;
}

export function InPageLink({ href, onClick, children, ...rest }: InPageLinkProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;

    // Let the browser handle anything that isn't a plain left-click: cmd/ctrl
    // click opens a new tab, shift opens a window, middle-click is handled by
    // the browser and never reaches onClick at all.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    if (!href.startsWith('#')) return;
    const target = document.getElementById(href.slice(1));
    // No target mounted — leave the default alone rather than swallowing the
    // click and leaving the user with a link that does nothing at all.
    if (!target) return;

    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
