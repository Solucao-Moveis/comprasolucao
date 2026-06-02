// Production server for self-hosting (EasyPanel / Docker) — Bun runtime.
//
// This file is ADDITIVE and does not affect the Lovable / Cloudflare deploy.
// The TanStack Start build (vite build) produces:
//   - dist/client/   -> static assets (served by the platform on Cloudflare)
//   - dist/server/server.js -> default export { fetch } (SSR + server functions)
//
// On Cloudflare the platform serves dist/client automatically. When self-hosting
// we must do it ourselves: try the static file first, otherwise hand the request
// to the SSR fetch handler.

import { join, normalize } from "node:path";
import server from "./dist/server/server.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const CLIENT_DIR = join(import.meta.dir, "dist", "client");

Bun.serve({
  port: PORT,
  hostname: HOST,
  // SSR streaming responses can take a while; avoid premature idle disconnects.
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);

    // 1) Static client assets (e.g. /assets/*.js, /favicon.ico, images).
    //    Guard against path traversal by ensuring the resolved path stays in CLIENT_DIR.
    if (req.method === "GET" || req.method === "HEAD") {
      const decoded = decodeURIComponent(url.pathname);
      const filePath = normalize(join(CLIENT_DIR, decoded));
      if (filePath.startsWith(CLIENT_DIR)) {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }
      }
    }

    // 2) Everything else -> SSR / server functions / server routes.
    return server.fetch(req, process.env, {
      waitUntil() {},
      passThroughOnException() {},
    });
  },
});

console.log(`✓ Server listening on http://${HOST}:${PORT}`);
