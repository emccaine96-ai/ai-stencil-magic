# Gallery moderation and CI verification

- [ ] Update `src/routes/gallery.$postId.tsx`: reuse moderation actions and blocked-author placeholder; preserve hidden-post behavior.
- [ ] Update `src/components/gallery/PostModerationActions.tsx`: suppress actions on own posts using the current auth session.
- [ ] Update `package.json`: add the existing tsgo typechecker script (no dependency changes).
- [ ] Update `.github/workflows/deploy.yml`: contents read only; typecheck before build; keep npm/package-lock.
- [ ] Add a focused moderation regression test outside protected engine paths and run it.
- [ ] Verify browser flows available with real account/post data; identify blocked checks explicitly.
- [ ] Inspect automatic production build results and deliver report-only optimization audit.