# Pin Help to the Top of the Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Help sits in a fixed region at the top of the sidebar, above the scroll area, so it cannot be scrolled away — on desktop and mobile — and cannot be hidden.

**Architecture:** Move Help out of the scrollable `defaultNavigation` list into its own `shrink-0` block rendered between the logo and the `<nav>`. That is the same mechanism the logo (`:456`) and the Business Switcher (`:544`) already use to stay out of the scroll area, and because both the desktop `<aside>` and the mobile `Sheet` render the same `SidebarContent`, one insertion covers both.

**Tech Stack:** React, Tailwind, Playwright against a local dev server (`playwright.config.ts` → `npm run dev` on :8080).

**Status:** Plan written 2026-08-12. Nothing edited. Frontend-only, so it does **not** need a Lovable backend deploy — but it does need a Lovable **publish** to reach production, and credits are currently out. It can be written, committed and verified locally in the meantime.

---

## The premise had to be corrected first

The request was to pin Help "like Dashboard is". **Dashboard is not pinned.** `AdminSidebar.tsx:474` puts the entire nav list inside one scroll container:

```tsx
<nav className="flex-1 overflow-y-auto px-3 py-4 ...">
```

Dashboard is merely the first element of the flat `defaultNavigation` array (`:88`); Help is the last (`:118`). Scroll down and Dashboard scrolls away like everything else. There was no pinning mechanism to copy — this plan builds one.

Dashboard *is* special in three unrelated ways, none of them pinning:

| Where | What |
|---|---|
| `SidebarVisibilitySettings.tsx:37` | `required: true` — cannot be hidden |
| `AdminSidebar.tsx:362` | in `financialOnlyHrefs`, so it is **removed entirely** for managers without financial access |
| `:479`, `:505` | active-state special case so `/dashboard` does not match every child route |

## Why a source reorder would not have worked

Users can drag-reorder the sidebar, persisted to `localStorage.tidywise_nav_order` (`:325`, `:431`). On load the saved order wins:

```tsx
const reordered = hrefOrder.map(href => defaultNavigation.find(i => i.href === href)).filter(...)
// then append only items NOT already present
```

Moving Help up in the source array is therefore invisible to any user who has ever dragged a single item — their stored order already lists `/dashboard/help` at its old position, and the append-new-items loop (`:334-338`) skips it because it is not new. Precisely the established users most likely to want this would see no change.

Pulling Help out of `defaultNavigation` sidesteps that entirely: a stale `/dashboard/help` entry in a saved order simply fails the `.find()` and is filtered out (`:330-331`). **No localStorage migration is needed.**

---

## Decisions

**Pinned Help is also `required`.** "Cannot be scrolled away" and "can be hidden" do not sit together. Approved.

**Accepted consequence:** a user who has previously hidden Help will get it back, and their `hiddenItems` row for `/dashboard/help` becomes inert. That is the intended meaning of required — but it is a preference being overridden, so it belongs in the release note rather than being discovered.

**Mobile included.** Both platforms render the same `SidebarContent`, so this is free rather than a second implementation. Vertical space is tighter on mobile, which is an argument for exactly one pinned row and no more.

---

## File structure

| File | Change |
|---|---|
| **Modify** `src/components/admin/AdminSidebar.tsx` | Remove Help from `defaultNavigation`; add `PINNED_HELP`; render it in a `shrink-0` block above `<nav>` |
| **Modify** `src/components/admin/SidebarVisibilitySettings.tsx:61` | `required: true` on the Help entry |
| **Create** `e2e/sidebar-pinned-help.spec.ts` | 7 local e2e tests ✅ written |

---

## Task P1: Pin the item

**Files:** Modify `src/components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Watch the tests fail**

```bash
npx playwright test e2e/sidebar-pinned-help.spec.ts
```

`playwright.config.ts` starts `npm run dev` on :8080 itself, so no server needs to be running. Expected before any change: the "not inside the scrollable nav" and "survives scrolling" tests fail, because Help is currently the last item *inside* the scroll container.

- [ ] **Step 2: Remove Help from the scrollable list**

Delete line `:118` from `defaultNavigation`:

```tsx
  { name: 'Help', href: '/dashboard/help', icon: HelpCircle },
```

- [ ] **Step 3: Declare the pinned item**

Immediately after the `defaultNavigation` array:

```tsx
/**
 * Help is pinned outside the scrollable nav, so it is deliberately NOT part of
 * defaultNavigation: membership there would make it draggable, hideable, and
 * subject to a user's saved tidywise_nav_order. A stale '/dashboard/help' entry
 * in an existing saved order is harmless — the .find() above returns undefined
 * and it is filtered out.
 */
const PINNED_HELP: NavItem = { name: 'Help', href: '/dashboard/help', icon: HelpCircle };
```

- [ ] **Step 4: Render it in a fixed block above the scroll area**

Between the logo block (ends `:471`) and `<nav>` (`:474`):

```tsx
      {/* Pinned Help — must stay reachable no matter how long the nav gets.
          shrink-0 keeps it out of the flex-1 scroll area, the same mechanism
          the logo above and the Business Switcher below already use. Rendered
          inside SidebarContent, so desktop and mobile both get it. */}
      <div className="px-3 pt-4 pb-1 shrink-0 border-b border-sidebar-border">
        <StaticNavItem
          item={PINNED_HELP}
          isActive={location.pathname === PINNED_HELP.href ||
                    location.pathname.startsWith(PINNED_HELP.href)}
          isOpen={isOpen}
          isMobile={isMobile}
          onNavClick={handleNavClick}
        />
      </div>
```

`StaticNavItem` rather than `SortableNavItem`: the pinned row must not be draggable, and `StaticNavItem` (`:227`) is already the non-draggable renderer used on mobile, so its styling matches the rest of the list for free.

- [ ] **Step 5: Adjust the nav's top padding**

`<nav>` currently carries `py-4`. With a padded block above it, change to `pt-2 pb-4` so the gap does not double. This is cosmetic — verify it with the screenshot step below rather than by reasoning about it.

- [ ] **Step 6: Verify structurally and visually**

```bash
npx playwright test e2e/sidebar-pinned-help.spec.ts
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/components/admin/AdminSidebar.tsx
```

The spec captures a screenshot of the sidebar at both viewports on failure; check `test-results/` and confirm the pinned row reads as part of the sidebar rather than as a stray element above it.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/AdminSidebar.tsx e2e/sidebar-pinned-help.spec.ts
git commit -m "feat: pin Help above the sidebar scroll area so it cannot be scrolled away"
```

---

## Task P2: Make it un-hideable

**Files:** Modify `src/components/admin/SidebarVisibilitySettings.tsx:61`

- [ ] **Step 1: Mark it required**

```tsx
  { name: 'Help Videos', href: '/dashboard/help', icon: HelpCircle, required: true },
```

`:173` already reads `const isRequired = item.required;` and disables the toggle, so no other change is needed — the same mechanism that protects Dashboard (`:37`).

- [ ] **Step 2: Leave the label alone**

The two lists disagree about the name — `'Help'` in the sidebar, `'Help Videos'` in Settings. That is real but it is one of the drift findings deliberately **not** being chased here (see `2026-08-12-sidebar-nav-list-drift.md`). Renaming would be scope creep into a file this task otherwise touches by one word.

- [ ] **Step 3: Verify the toggle is disabled**

Covered by the spec's "Settings cannot hide Help" test.

---

## Task P3: What cannot be verified locally

- [ ] **Publish via Lovable** once credits are available. `src/**` reaches production through a Lovable publish; a git push does not deploy the web app.
- [ ] **Re-check on the real production sidebar** at a short viewport, with an org that has many nav items visible, since local dev may have a different visible set.
- [ ] **Check the native iOS build.** Capacitor wraps the same `dist/` bundle, so the fix carries — but `env(safe-area-inset-top)` is applied to the mobile sheet wrapper (`:653`), and a new top block sits directly under that inset. Worth one look on a device before calling it done.

---

## Self-review

**Requirement coverage.** Top of the sidebar → block rendered before `<nav>`. Cannot be scrolled away → outside the `flex-1 overflow-y-auto` container, asserted by scrolling the nav to its end and re-checking visibility. Works on mobile → single insertion inside the shared `SidebarContent`, asserted at a 390×844 viewport. Cannot be hidden → `required: true`, asserted against the Settings toggle.

**The test that matters, and its control.** "Help survives scrolling" would pass vacuously if the nav did not actually scroll — for example on a tall viewport where everything fits. The spec therefore asserts a *different* late-list item moves out of view in the same scroll, so a no-op scroll fails the test rather than passing it. Same trap as the schema probe that read a missing table as success.

**Not built.** No second pinned item, and no configurable pin list. One row, hard-coded, because vertical space on mobile is the binding constraint and a general mechanism would invite filling it.

**Unverified.** Whether any org's `hiddenItems` currently contains `/dashboard/help` — that would mean a real user has hidden it and will see it return. Not checkable from here (the table is RLS-protected and this is a read-only-anon environment); worth a query when convenient, and it belongs in the release note either way.
