// The page is built into apps/demo/dist, which the Bun server serves. `vite` alone (dev) proxies the API.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: new URL("./web", import.meta.url).pathname,
  plugins: [react()],
  build: { outDir: new URL("./dist", import.meta.url).pathname, emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:3000" } },
});
