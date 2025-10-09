import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind()],
  output: "server", // ✅ WORKS in all Cloudflare Pages environments
  adapter: cloudflare({
    pages: true, // ✅ enables `/functions/` support
  }),
});
