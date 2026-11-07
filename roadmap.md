# Gallery moderation and CI verification

- [x] Update `src/routes/gallery.$postId.tsx`: reuse moderation actions and blocked-author placeholder; preserve hidden-post behavior.
- [x] Update `src/components/gallery/PostModerationActions.tsx`: suppress actions on own posts using the current auth session.
- [x] Update `package.json`: add the existing tsgo typechecker script (no dependency changes).
- [x] Update `.github/workflows/deploy.yml`: contents read only; typecheck before build; keep npm/package-lock.
- [x] Add a focused moderation regression test outside protected engine paths and run it (4 passed).
- [x] Verify public gallery, home and create pages; no page errors.
- [ ] Signed-in moderation browser flows: blocked by no auth users or gallery posts; no test accounts/data added.
- [x] Inspect automatic build diagnostics (build OK); deliver report-only source audit.
- [ ] Full production stdout and ten emitted chunk sizes: automatic harness exposes only build OK, with no local output artifacts.