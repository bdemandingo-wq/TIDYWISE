import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { setupDeepLinkListener } from "@/lib/nativeOAuth";

// Auto-recover from stale-deploy chunk load failures.
// When index.html is cached but references hashed JS files that no longer
// exist on the CDN (typical right after a deploy), dynamic imports throw
// "Failed to fetch dynamically imported module". A one-time hard reload
// fetches the fresh index.html and resolves it. Guarded by sessionStorage
// to prevent infinite reload loops.
const CHUNK_RELOAD_KEY = '__tw_chunk_reload_attempted__';

function isChunkLoadError(reason: unknown): boolean {
  if (!reason) return false;
  const msg = (reason instanceof Error ? reason.message : String(reason)) || '';
  const name = reason instanceof Error ? reason.name : '';
  return (
    name === 'ChunkLoadError' ||
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

function tryRecoverFromChunkError(reason: unknown): boolean {
  if (!isChunkLoadError(reason)) return false;
  try {
    if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      window.location.reload();
      return true;
    }
  } catch {
    // sessionStorage unavailable — fall through
  }
  return false;
}

window.addEventListener('error', (event) => {
  if (tryRecoverFromChunkError(event.error || event.message)) {
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (tryRecoverFromChunkError(event.reason)) {
    event.preventDefault();
  }
});

// Clear the reload guard once the app successfully bootstraps so future
// deploys can recover again.
window.addEventListener('load', () => {
  setTimeout(() => {
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* noop */ }
  }, 5000);
});

// Set up deep link listener for native OAuth callbacks (Guideline 4.0)
// Must run before React renders so we don't miss the callback
setupDeepLinkListener();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
