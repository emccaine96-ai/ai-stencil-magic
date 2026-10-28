# Browser harness for the V2 candidate (test-only)
`v2b-lab.route.tsx` is a throwaway TanStack route that exposes `window.__v2b.run(dataUrl)` so a headless Chrome
(puppeteer-core) can drive V2Session end to end (prepare, render, concurrent-reject, stale-export-reject, export, PNG).
It is deliberately NOT under src/routes so it never ships. To run it:
  cp scripts/v2b/browser-harness/v2b-lab.route.tsx src/routes/v2b-lab.tsx   # then `npx vite dev --port 5199`
  node <driver using puppeteer-core> ; afterwards delete src/routes/v2b-lab.tsx and `git checkout src/routeTree.gen.ts`
