import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";   // ✅ Make sure this import exists
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind()],
  output: "server",
  adapter: cloudflare({
    pages: true, // ✅ this line ensures Cloudflare Pages functions are used
  }),
});
