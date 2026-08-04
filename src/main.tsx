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
//
// An open tab holds the old index.html; a deploy replaces the hashed chunks it
// references, so the next lazy import 404s. One hard reload fetches the fresh
// index.html. All of the deciding — web-only, online-only, once PER CHUNK —
// lives in lib/chunkReload so this file, the ErrorBoundary and the Vite hook
// below cannot drift apart. There were three separate copies of the matching
// regexes before, each with its own guard.
import {
  maybeReloadForStaleChunk,
  clearChunkReloadGuard,
} from "@/lib/chunkReload";

// Vite's own signal, and the one that actually fires for a failed lazy import.
// React catches the import rejection itself and routes it through Suspense to
// an error boundary, so the generic 'error' / 'unhandledrejection' listeners
// below never see it — which is why a stale chunk could still reach the crash
// panel despite them. This fires before React is involved at all.
window.addEventListener("vite:preloadError", (event) => {
  const e = event as Event & { payload?: unknown };
  if (maybeReloadForStaleChunk(e.payload ?? e)) {
    event.preventDefault();
  }
});

window.addEventListener("error", (event) => {
  if (maybeReloadForStaleChunk(event.error || event.message)) {
    event.preventDefault();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (maybeReloadForStaleChunk(event.reason)) {
    event.preventDefault();
  }
});

// Clear the guard once the app has actually bootstrapped, so a later deploy in
// the same tab can recover again.
window.addEventListener("load", () => {
  setTimeout(clearChunkReloadGuard, 5000);
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
