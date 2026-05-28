import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { setupDeepLinkListener } from "@/lib/nativeOAuth";
import { initSentry, Sentry } from "@/lib/sentry";

// Initialize observability before anything renders — earlier init means
// the bootstrap error path (e.g. the chunk-load recovery below) is also
// captured. No-op when VITE_SENTRY_DSN is unset.
initSentry();

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
  <Sentry.ErrorBoundary
    fallback={({ resetError }) => (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Something went wrong.</h1>
        <p style={{ color: "#666", margin: 0, maxWidth: "32rem" }}>
          We've been notified and are looking into it. Refresh the page to try again.
        </p>
        <button
          onClick={() => {
            resetError();
            window.location.reload();
          }}
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid #ddd",
            borderRadius: "0.5rem",
            background: "white",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>
    )}
  >
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </Sentry.ErrorBoundary>
);
