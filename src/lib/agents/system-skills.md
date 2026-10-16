# AI Stencil Magic - Agent Execution Mandate

## 1. Core Mathematics & Shading Algorithms
*   **Adaptive Local-Mean Thresholding:** Preserve `adaptiveThreshold()` in `src/lib/classical/threshold.js`: on grayscale input, use `T = localMean - 5`, output black for pixels below T and white otherwise. Compute the mean with an integral image over the caller's `blockSize` window, round even sizes up to odd, and clamp windows to image edges. This is local-mean thresholding; no Sauvola standard-deviation formula or k/R parameters are defined [USER].
*   **Stochastic Stippling:** For the `shadingMode === 'dither'` branch of `ClassicalProEngine.processImage()` in `src/lib/classical-pro-engine.js`, maintain `stochasticStipple()` in `src/lib/classical/stipple.js`. Preserve its seeded jittered sampling, luminance-based dot probability, and randomized dot radii. This is blue-noise-style sampling; it does not propagate quantization error or use a tileable 64x64 noise matrix. Any error-diffusion algorithm requires a separate specification [USER].
*   **5-Tier Tonal Separation:** Enforce strict, non-blending boundaries across the 5 structural layers (Shadows -> Dark Mids -> Mids -> Light Mids -> Highlights) [USER].

## 2. Platform Architecture & Performance Tuning
*   **Thread Safety:** Offload supported heavy pixel operations through `runOp()` in `src/lib/worker-bridge.ts`, passing ImageData and transferring its underlying pixel buffer to the worker. OffscreenCanvas input is not required. The bridge falls back to main-thread execution when a worker is unavailable or dispatch throws; fallback support varies by operation. Treat 60–120 fps on mobile as a target to measure on representative devices and workloads [USER].
*   **Memory Efficiency:** Avoid dynamic array slicing inside region segmenters. Recycle typed Int32Array and Float64Array data blocks to prevent garbage collection spikes.

## 3. Operations & Multi-Agent Orchestration
*   **Dynamic Fallback Routing:** Use `openrouter/free` when free-model routing is required; it routes requests to an available free model. This mandate concerns model selection [USER].
*   **Deployment Integrity:** Expose `secrets.OMNIROUTE_TOKEN` only to background runner jobs or steps that need it, with the least privileges required for their work. Enforce branch protection separately through repository rules and required checks [USER].
