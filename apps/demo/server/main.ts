// bun run demo: the API and the built page on one port (PORT, default 3000).
import { join } from "node:path";
import { createApp } from "./app";

const DIST = new URL("../dist", import.meta.url).pathname;
const app = await createApp();

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  // A model call can take longer than Bun's default idle timeout; the event stream also pings every 5 s.
  idleTimeout: 120,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/api/")) return app.fetch(req);
    // The built page: a file under dist/, else index.html.
    const full = join(DIST, decodeURIComponent(path));
    const file = Bun.file(full);
    if (full.startsWith(`${DIST}/`) && full !== `${DIST}/` && (await file.exists())) return new Response(file);
    return new Response(Bun.file(join(DIST, "index.html")), { headers: { "content-type": "text/html; charset=utf-8" } });
  },
});
console.log(`demo on http://localhost:${server.port} (${app.prs.length} PRs baked)`);
