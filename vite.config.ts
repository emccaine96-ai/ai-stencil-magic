import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  build: {
    // Optimize for Vercel serverless deployment
    minify: true,
    sourcemap: false,
    target: "es2020",
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  tanstackStart: {
    server: { entry: "server" },
    // Vercel serverless function optimization
    isFileBasedRouting: true,
  },
});
