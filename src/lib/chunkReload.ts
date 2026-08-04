import { Capacitor } from '@capacitor/core';

/**
 * Stale-chunk recovery after a deploy.
 *
 * An open tab holds the old index.html. A deploy replaces the hashed chunks it
 * references, so the next lazy import 404s and React throws "Failed to fetch
 * dynamically imported module: .../assets/LandingPage-CIiDwt-w.js". One hard
 * reload pulls the fresh index.html and the app carries on.
 *
 * WEB ONLY. On native the assets are bundled into the app — capacitor.config
 * sets a scheme and hostname but no `server.url`, so nothing is fetched from a
 * server and a missing chunk cannot be a deploy race. It means the bundle is
 * damaged or a file was left out of the build, and silently reloading would
 * hide that behind a spinner. Native falls through to the error boundary.
 */

/**
 * Browsers word this differently; match the common ones.
 * Kept in one place so the boundary and the pre-React listener agree.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error instanceof Error ? error.message : String(error)) || '';
  const name = error instanceof Error ? error.name : '';
  return (
    name === 'ChunkLoadError' ||
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

/**
 * The chunk URL out of the error, when the browser included one.
 *
 * Chrome and Safari both put it in the message: "Failed to fetch dynamically
 * imported module: https://host/assets/LandingPage-CIiDwt-w.js". Firefox does
 * not, hence the null case — those fall back to a single shared slot, which is
 * the old behaviour and still better than never retrying.
 */
export function extractChunkUrl(error: unknown): string | null {
  const msg = (error instanceof Error ? error.message : String(error)) || '';
  const m = msg.match(/https?:\/\/[^\s)'"]+/);
  return m ? m[0] : null;
}

const STORE_KEY = '__tw_chunk_reload_attempted__';
/** Enough for a session's worth of distinct chunks without growing unbounded. */
const MAX_TRACKED = 20;

function readAttempted(): string[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return [];
    // Older builds stored the literal "1" under this key. Treat that as "one
    // unknown chunk already retried" rather than crashing on the parse.
    if (raw === '1') return ['__legacy__'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeAttempted(list: string[]): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-MAX_TRACKED)));
  } catch {
    // Private mode / quota. Losing the guard means at worst one extra reload,
    // which is far better than throwing inside an error handler.
  }
}

/**
 * Has this specific chunk already had its one reload?
 *
 * Per-chunk, not once-ever. The previous global flag meant the FIRST stale
 * chunk in a session consumed the only retry, and every chunk after it showed
 * the crash panel instead of recovering — which is exactly how a deploy race
 * reaches a user, since one deploy invalidates many chunks at once.
 */
export function hasAttemptedReloadFor(chunkUrl: string | null): boolean {
  return readAttempted().includes(chunkUrl ?? '__unknown__');
}

export function markReloadAttemptedFor(chunkUrl: string | null): void {
  const key = chunkUrl ?? '__unknown__';
  const list = readAttempted();
  if (!list.includes(key)) writeAttempted([...list, key]);
}

/** Clears the guard so an explicit "Try again" always gets a fresh attempt. */
export function clearChunkReloadGuard(): void {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Reload once for this chunk, if that is the right thing to do.
 *
 * Returns true when a reload was triggered — callers should stop what they are
 * doing, since the page is going away.
 */
export function maybeReloadForStaleChunk(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (!isChunkLoadError(error)) return false;

  // Native: a missing bundled asset is a real defect. Never mask it.
  if (Capacitor.isNativePlatform()) return false;

  // Offline: the reload will fail too and we would strand the user on a blank
  // page instead of a panel that at least explains itself.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  const url = extractChunkUrl(error);
  if (hasAttemptedReloadFor(url)) return false;

  markReloadAttemptedFor(url);
  window.location.reload();
  return true;
}
