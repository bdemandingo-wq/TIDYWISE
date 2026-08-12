# The sidebar nav list exists in three hardcoded copies, and they have drifted

**Logged:** 2026-08-12, while investigating how to pin Help to the top of the sidebar.
**Status:** Not fixed, not chased. One consequence is user-visible today.
**Related:** `2026-08-12-pin-help-sidebar.md` (touches both files, deliberately fixes none of this)

## Three copies

| Copy | Location | Purpose |
|---|---|---|
| `defaultNavigation` | `src/components/admin/AdminSidebar.tsx:88-119` | what the sidebar renders — **30 items** |
| the visibility list | `src/components/admin/SidebarVisibilitySettings.tsx:37-62` | what Settings lets you hide — **25 items**, plus `required` flags |
| `iconMap` | `AdminSidebar.tsx:123` | a third, partial copy, name → icon |

Nothing keeps them in step. Same shape as the `['staff']` / `['staff-all']` cache-key bug: two things that must agree, agreeing only by memory.

## Finding 1 — six sidebar items can never be hidden (the one that matters)

Present in the sidebar, absent from the Settings list, so **no user can ever hide them**:

- `/dashboard/automation-center`
- `/dashboard/benchmarks`
- `/dashboard/booking-photos`
- `/dashboard/client-portal`
- `/dashboard/invoices`
- `/dashboard/tasks`

This is user-visible today. The sidebar visibility feature exists so an owner can strip the nav down to what their business uses; six tabs silently refuse. Nobody gets an error — the toggles simply are not there — which is why it has survived: it reads as "that tab must be essential" rather than as a bug.

`/dashboard/invoices` and `/dashboard/tasks` are the conspicuous ones. A cleaning business that invoices outside the app cannot remove Invoices.

## Finding 2 — one hideable item is not in the sidebar

`/dashboard/subscription` appears in the Settings list but not in `defaultNavigation`. So the UI offers a toggle for a tab that does not exist. Harmless, but it means the Settings screen is describing a nav that is not the real one.

Note `nativeHiddenItems` (`AdminSidebar.tsx:354`) also references `/dashboard/subscription` when hiding payment flows on native — so a third file assumes it exists in the nav. Worth understanding whether it was removed deliberately before changing anything.

## Finding 3 — Help has two different names

`'Help'` in the sidebar (`:118`), `'Help Videos'` in Settings (`:61`). Same href, two labels, so the toggle an owner flips is not obviously the tab they are looking at.

Trivial on its own. Listed because it is evidence the copies are edited independently, and because any test matching Help by visible label has to know about both — `e2e/sidebar-pinned-help.spec.ts` matches `/^Help( Videos)?$/` for exactly this reason.

## The fix, when it is worth doing

Make one list the source of truth and derive the others. The sidebar's own array is the natural owner, since it decides what renders:

```ts
// AdminSidebar.tsx — export the single definition
export interface NavItem { name: string; href: string; icon: typeof Home; required?: boolean; }
export const NAV_ITEMS: NavItem[] = [ /* ... with required: true on Dashboard, Help */ ];
```

`SidebarVisibilitySettings` then imports `NAV_ITEMS` and renders a toggle per item, disabled where `required`. `iconMap` becomes derivable from the same array. All three drift findings above become unrepresentable rather than fixed.

Two things to settle first, which is why this is not a mechanical refactor:

1. **Are those six items meant to be hideable?** Adding them to the list is a product change — six new toggles appear, and an owner can then hide Invoices. Probably right, but it is a decision, not a cleanup.
2. **What is `/dashboard/subscription`?** Establish whether it was intentionally dropped from the nav before either restoring it or deleting its toggle and its `nativeHiddenItems` reference.

A test asserting the two lists agree would close this permanently, and is the cheap half of the work — the same technique `automationTemplates.speedToLead.test.ts` now uses to enforce the `KEEP IN SYNC` template pair, which was also guarded by nothing.
