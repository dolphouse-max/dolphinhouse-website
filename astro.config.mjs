import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  integrations: [tailwind()],
  output: "server", // ✅ Cloudflare Pages + Functions requires "server"
  adapter: cloudflare({
  }),
});
