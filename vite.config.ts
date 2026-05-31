import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "node:child_process";
import { componentTagger } from "lovable-tagger";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

// Runs the sitemap generator after the production build completes so
// public/sitemap.xml stays in sync with the routes declared in src/App.tsx.
function sitemapPlugin(): Plugin {
  return {
    name: "tidywise-sitemap",
    apply: "build",
    buildEnd() {
      try {
        const output = execSync("npx tsx src/lib/generate-sitemap.ts", {
          stdio: ["ignore", "pipe", "pipe"],
        }).toString().trim();
        if (output) this.info(output);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.warn(`sitemap generation failed: ${message}`);
      }
    },
  };
}

// Emits per-route static HTML (dist/<route>/index.html) with correct title /
// description / canonical / og / twitter / h1 tags so non-JS crawlers see real
// per-page SEO instead of the homepage placeholder served to the SPA shell.
function prerenderPlugin(): Plugin {
  return {
    name: "tidywise-prerender",
    apply: "build",
    closeBundle() {
      try {
        const output = execSync("npx tsx src/lib/prerender-routes.ts", {
          stdio: ["ignore", "pipe", "pipe"],
        }).toString().trim();
        if (output) this.info(output);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.warn(`prerender failed: ${message}`);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Compress raster images in /public during build. Cuts the
    // tidywise-logo.png (1.4 MB), email-logo.png (1.4 MB), favicon.png
    // (1.4 MB) and og image (1.2 MB) down by 60-85% with no visible
    // quality loss. Only runs on build, not dev.
    ViteImageOptimizer({
      png: { quality: 80 },
      jpeg: { quality: 80 },
      jpg: { quality: 80 },
      webp: { quality: 80 },
      avif: { quality: 70 },
      includePublic: true,
      logStats: true,
    }),
    sitemapPlugin(),
    prerenderPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep React + Radix UI together to prevent duplicate React instances
          'vendor-react': ['react', 'react-dom', 'react-router-dom', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-charts': ['recharts'],
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'vendor-dates': ['date-fns', 'react-day-picker'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: true,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'date-fns',
    ],
  },
}));
