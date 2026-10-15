# Greptile Full Codebase Audit Request

This PR exists to trigger a **full Greptile review** of `ai-stencil-magic` with maximum context on the client-side classical stencil engines and surrounding platform.

## Scope for Greptile

Please perform a deep audit of the entire repository, with priority on:

### 1. Client-side classical engines (highest priority)
- `src/lib/classical-pro-engine.js` — Standard Classical Pro orchestrator
- `src/lib/classical-pro-integration.ts` — public API, style routing, background/exclusion
- `src/lib/style-engine-map.ts` — STYLE_TO_CLASSICAL / STYLE_TO_ADVANCED maps
- `src/lib/classical/*` — locked kernels: CLAHE, bilateral, XDoG, adaptive threshold (hysteresis + diagonal bridge), Poisson-disk stipple, structure tensor, morphology, Retinex, backdrop detection
- `src/lib/classical-engine/*` — Advanced Upgrade Orchestrator (`runUpgradePipeline`), pyramid bands, multi-scale edges, variable line weight, tone simplify, hatching/streamline hatch, cleanup, inspector/tattooability, presets

### 2. Correctness & skin-transfer quality
- Continuous strokes vs fragmentation
- Speck / isolation counts
- Dark-backdrop handling
- Determinism (RNG seeding)
- Working-resolution cap (MAX_EDGE=2400) and memory safety on large photos
- Agreement between `minBlobArea` and `enhancedCleanup.minPx`

### 3. Architecture integrity
- No parallel duplicate engines
- Advanced path missing stipple (Dotwork falls back)
- Background mode placeholder in Advanced
- Tattooability score computed but not fully surfaced
- Locked kernels must not be casually rewritten

### 4. Security & secrets
- No server secrets behind `VITE_`
- API keys, OpenRouter usage, auth surfaces

### 5. Platform surface
- `src/routes/create.tsx` style system (do not recommend changing the 4 core style prompts without isolation)
- Touch-up / retouch / vault integration points that call classical engines
- Calibration harness under `src/lib/calibration/`

## Desired output from Greptile

1. Summary of architecture and risk areas
2. Concrete bugs or correctness issues (logic/syntax)
3. High-value improvements that preserve the dual Classical + Advanced design
4. Anything that would hurt tattoo-transfer quality (blobs, broken lines, density floods)
5. Security / secret-handling findings

This is an audit PR; merge is optional. Primary goal is Greptile's full-codebase review.
