# Changelog (preview)

- Fix: pointer math uses client-space coordinates (store clientX/clientY) to avoid transform-related offset bugs.
- Fix: deterministic two-pointer selection to avoid jitter when fingers swap or one pointer is lost.
- Fix: removed pan divisor bug that caused under/over-panning.
- Improvement: coalesced pointer events + RAF batching for smoother gestures and lower CPU load.
- Improvement: GPU brush path (OffscreenCanvas/WebGL) with Canvas2D fallback.
- Feature: dev diagnostic trace scaffold (start/stop/download).
- Feature: time-lapse capture scaffold for strokes with timestamps.
- UI: Brush Settings mini-panel and pro/tattoo preset tuning (presets added under Brush Studio).
