import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare"; 
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind()],
  output: "hybrid",
  adapter: cloudflare({
    pages: true, // ✅ enables Cloudflare Pages Functions
  }),

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
