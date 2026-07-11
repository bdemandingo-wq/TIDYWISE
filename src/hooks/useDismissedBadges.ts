import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';

/**
 * Per-user, per-org "mark as read" state for sidebar attention badges.
 *
 * We snapshot the count that was visible at the moment the user dismissed
 * a reason. The reason is treated as read until the underlying count grows
 * past that snapshot — so brand-new items always re-surface, but resolved
 * work stays hidden.
 *
 * Backed by localStorage keyed by userId+orgId so it survives reloads and
 * cannot leak across accounts/orgs.
 */

type DismissMap = Record<string, number>; // key: `${href}|${reasonKey}` → dismissed snapshot count

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function storageKey(userId: string | null | undefined, orgId: string | null | undefined) {
  return `tw:dismissed-badges:${userId || 'anon'}:${orgId || 'none'}`;
}

function readMap(userId: string | null | undefined, orgId: string | null | undefined): DismissMap {
  try {
    const raw = localStorage.getItem(storageKey(userId, orgId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(userId: string | null | undefined, orgId: string | null | undefined, map: DismissMap) {
  try {
    localStorage.setItem(storageKey(userId, orgId), JSON.stringify(map));
  } catch {
    /* quota / private mode — ignore */
  }
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
};

export interface DismissedBadges {
  /** Snapshot count for a given href+reasonKey (0 if never dismissed). */
  getDismissed: (href: string, reasonKey: string) => number;
  /** True if `currentCount` is <= the last dismissed snapshot. */
  isDismissed: (href: string, reasonKey: string, currentCount: number) => boolean;
  /** Mark one reason as read at its current count. */
  dismiss: (href: string, reasonKey: string, currentCount: number) => void;
  /** Mark every reason on a page as read at their current counts. */
  dismissAll: (href: string, reasons: { key: string; count: number }[]) => void;
  /** Clear all dismissals for the current org (used by "Reset" flows). */
  reset: () => void;
}

export function useDismissedBadges(): DismissedBadges {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const userId = user?.id;
  const orgId = organization?.id;

  const snapshot = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(storageKey(userId, orgId)) || '',
    () => ''
  );

  const map: DismissMap = (() => {
    if (!snapshot) return {};
    try {
      const parsed = JSON.parse(snapshot);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  })();

  const getDismissed = useCallback(
    (href: string, reasonKey: string) => map[`${href}|${reasonKey}`] || 0,
    [map]
  );

  const isDismissed = useCallback(
    (href: string, reasonKey: string, currentCount: number) =>
      currentCount > 0 && currentCount <= (map[`${href}|${reasonKey}`] || 0),
    [map]
  );

  const dismiss = useCallback(
    (href: string, reasonKey: string, currentCount: number) => {
      const current = readMap(userId, orgId);
      current[`${href}|${reasonKey}`] = Math.max(currentCount, current[`${href}|${reasonKey}`] || 0);
      writeMap(userId, orgId, current);
    },
    [userId, orgId]
  );

  const dismissAll = useCallback(
    (href: string, reasons: { key: string; count: number }[]) => {
      const current = readMap(userId, orgId);
      for (const r of reasons) {
        const k = `${href}|${r.key}`;
        current[k] = Math.max(r.count, current[k] || 0);
      }
      writeMap(userId, orgId, current);
    },
    [userId, orgId]
  );

  const reset = useCallback(() => {
    writeMap(userId, orgId, {});
  }, [userId, orgId]);

  return { getDismissed, isDismissed, dismiss, dismissAll, reset };
}
