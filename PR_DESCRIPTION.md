# Preview: gesture fixes, dev-log, brush studio + pro/tattoo brushes, time-lapse

This draft PR contains a focused set of changes to improve gesture stability, pointer coalescing, defensive redraw guards, a GPU brush path with Canvas2D fallback, a small dev diagnostic trace scaffold, and a time-lapse capture scaffold. It also includes a short changelog and device-specific test checklist.

What to test (short)
- Pinch/zoom center stability across finger swaps and pointer loss
- Pan correctness and removal of previous under-pan issues
- Smoothness of strokes on typical Android devices (Pixel 10a, Galaxy S10–S26)
- Canvas black/blank resilience under stress
- Dev trace capture and download (?devTrace=1 and Actions panel toggle)

Detailed checklist is in TEST_CHECKLIST.md.
