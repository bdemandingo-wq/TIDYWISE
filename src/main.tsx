import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { setupDeepLinkListener } from "@/lib/nativeOAuth";

// Set up deep link listener for native OAuth callbacks (Guideline 4.0)
// Must run before React renders so we don't miss the callback
setupDeepLinkListener();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
