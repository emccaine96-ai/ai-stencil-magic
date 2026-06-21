---
title: "Preview (draft): gesture fixes, dev-log, brush studio + pro/tattoo brushes, time‑lapse"
body: |
  This draft PR contains a focused set of changes to improve gesture stability, pointer coalescing, defensive redraw guards, a GPU brush path with Canvas2D fallback, a small dev diagnostic trace scaffold, and a time-lapse capture scaffold. It also includes a short changelog and device-specific test checklist.

  Please run the TEST_CHECKLIST.md in the branch and attach dev-trace.json for any failures.

  Changelog and device test checklist are included in the branch.

  Commit list:
  - feat(preview): gesture fixes, dev-log, brush GPU fallback, timelapse scaffold, changelog, test checklist

  This PR is opened as a draft for internal testing; do not merge until CI and device tests pass.
base: main
head: fix/canvas-gesture-redraw-audit-v2
maintainer_can_modify: true
---
