/**
 * Comparing app versions, and asking the App Store what the latest one is.
 *
 * Used by the "Check for updates" card, which is native-only — on web a
 * refresh already gets the newest build, so there is nothing to check.
 */

/** Apple's public lookup endpoint. Sends `access-control-allow-origin: *`, so a
 *  plain fetch works from the webview; no native HTTP shim required. */
const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup?id=6788275014';
export const APP_STORE_URL = 'https://apps.apple.com/app/id6788275014';

export type VersionOrder = 'older' | 'same' | 'newer' | 'unknown';

/**
 * Compare two dotted version strings SEGMENT BY SEGMENT, NUMERICALLY.
 *
 * A string comparison gets this backwards: "1.10" < "1.9" lexically, because
 * "1" sorts before "9". Numerically 1.10 is the newer release. Missing
 * segments count as 0, so "1.1" and "1.1.0" are the same version.
 *
 * Returns 'unknown' rather than guessing when either side is missing or has a
 * non-numeric segment (a beta suffix, say). The caller must treat 'unknown' as
 * "say nothing" — never as "up to date".
 */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): VersionOrder {
  if (!a || !b) return 'unknown';

  const parse = (v: string): number[] | null => {
    const parts = v.trim().split('.');
    const nums: number[] = [];
    for (const p of parts) {
      if (!/^\d+$/.test(p)) return null;
      nums.push(Number(p));
    }
    return nums.length > 0 ? nums : null;
  };

  const av = parse(a);
  const bv = parse(b);
  if (!av || !bv) return 'unknown';

  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const x = av[i] ?? 0;
    const y = bv[i] ?? 0;
    if (x < y) return 'older';
    if (x > y) return 'newer';
  }
  return 'same';
}

export interface StoreVersion {
  version: string;
  releasedAt: string | null;
}

/**
 * The version currently live on the App Store.
 *
 * Throws on any failure — network, non-200, empty result, malformed body. The
 * caller must surface "couldn't check" rather than silently treating a failed
 * lookup as "you're up to date", which would be a confident lie.
 *
 * Only ever returns `version`, the marketing version (CFBundleShortVersionString).
 * Apple does not expose CFBundleVersion here, so a build-number-only release is
 * invisible to this check — bump the marketing version for anything users
 * should actually update to.
 */
export async function fetchStoreVersion(signal?: AbortSignal): Promise<StoreVersion> {
  // Cache-bust: Apple edge-caches this response, and so would the webview.
  const res = await fetch(`${ITUNES_LOOKUP}&t=${Date.now()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`App Store lookup failed (${res.status})`);

  const body = (await res.json()) as {
    resultCount?: number;
    results?: { version?: unknown; currentVersionReleaseDate?: unknown }[];
  };

  const row = body?.results?.[0];
  const version = typeof row?.version === 'string' ? row.version.trim() : '';
  if (!version) throw new Error('App Store lookup returned no version');

  return {
    version,
    releasedAt:
      typeof row?.currentVersionReleaseDate === 'string' ? row.currentVersionReleaseDate : null,
  };
}
