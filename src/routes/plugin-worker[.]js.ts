import { createFileRoute } from "@tanstack/react-router";
import { PLUGIN_WORKER_CSP, PLUGIN_WORKER_SOURCE } from "@/lib/plugin-worker-source";

// Serves the plugin sandbox worker with its own Content-Security-Policy header.
export const Route = createFileRoute("/plugin-worker.js")({
  server: {
    handlers: {
      GET: () =>
        new Response(PLUGIN_WORKER_SOURCE, {
          status: 200,
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "content-security-policy": PLUGIN_WORKER_CSP,
            "x-content-type-options": "nosniff",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
