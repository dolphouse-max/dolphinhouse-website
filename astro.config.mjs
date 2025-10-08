import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind()],
  output: "hybrid",
  adapter: cloudflare({
    pages: true, // ✅ this line ensures Cloudflare Pages functions are used
  }),
});
