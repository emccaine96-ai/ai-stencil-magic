# Gallery moderation and CI verification

## Plugin hardening and lazy-loading round
- [x] Remeasure unchanged portrait export: baseline SHA-256 matches.
- [x] Verify all 12 built-ins and fetch/XHR/Image/WebSocket/self-navigation isolation; CSP escape reproduced and worker fix verified with zero external requests.
- [x] Lazy-load MasterSuite tabs, vectorization and Ink Style processing; browser verified all tabs, SVG export and recoloring without page errors.
- [ ] Fully defer inspection module: blocked by its existing eager import in protected src/lib/classical-engine/index.ts; create-page call now uses dynamic import, engine unchanged.
- [x] Rerun export (baseline hash and 1,306,582 bytes), typecheck, existing engine/gallery/metric tests; all passed, automatic build OK.

## Current optimization round
- [x] Pin the existing typecheck command without changing dependencies or lockfiles.
- [x] Resize icons and logo, preserving filenames and alpha; inspect results and manifest.
- [x] Replace only home embedded examples with public image files; retain original asset modules.
- [x] Verify baseline-identical export, home/create browser checks, typecheck and existing tests; report measurements.

- [x] Update `src/routes/gallery.$postId.tsx`: reuse moderation actions and blocked-author placeholder; preserve hidden-post behavior.
- [x] Update `src/components/gallery/PostModerationActions.tsx`: suppress actions on own posts using the current auth session.
- [x] Update `package.json`: add the existing tsgo typechecker script (no dependency changes).
- [x] Update `.github/workflows/deploy.yml`: contents read only; typecheck before build; keep npm/package-lock.
- [x] Add a focused moderation regression test outside protected engine paths and run it (4 passed).
- [x] Verify public gallery, home and create pages; no page errors.
- [ ] Signed-in moderation browser flows: blocked by no auth users or gallery posts; no test accounts/data added.
- [x] Inspect automatic build diagnostics (build OK); deliver report-only source audit.
- [ ] Full production stdout and ten emitted chunk sizes: automatic harness exposes only build OK, with no local output artifacts.