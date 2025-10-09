import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";   // ✅ Cloudflare adapter
import tailwind from "@astrojs/tailwind";       // ✅ TailwindCSS integration

// -----------------------------------------------------------
// ✅ Full Astro + Cloudflare Pages + Functions configuration
// -----------------------------------------------------------
export default defineConfig({
  integrations: [tailwind()],
  
  // "hybrid" allows Astro to serve both static pages AND Cloudflare Functions (like /api/*)
  output: "hybrid",

  adapter: cloudflare({
    pages: true, // ✅ enables Cloudflare Pages Functions
  }),

  // (Optional but recommended)
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  },
});
