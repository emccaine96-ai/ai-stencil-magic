# Operating rules for any AI agent working on this codebase

This project (AI Stencil Magic) has been worked on by multiple AI agents — Grok, an
Archon/"Solene" self-healing process, and Claude sessions — without a shared source of
truth. That mismatch has been the direct cause of nearly every real bug found in this
app: a database rename with no migration that orphaned users' saved data, an image
pipeline that silently sent only the wrong argument for weeks, two separate "upgraded
classical engine" module systems built independently within the same hour, a font
system reported as complete that was actually empty scaffolding. None of that came
from any one model being "not smart enough." It came from editing without verifying
first, and from building new systems instead of finishing existing ones.

These rules apply regardless of which model is doing the work.

## Before making any change

1. **Read the actual current file before editing it.** Never assume a file matches
   what a previous commit message, a summary, or an earlier session said it contains.
   Files here get touched by multiple agents; what you remember may already be stale.
2. **Search for existing implementations before building a new one.** If the task
   sounds like "add an upgraded X," check whether an X already exists — including
   partially-built or disconnected ones — before writing a parallel version. This
   codebase already has duplicate classical-engine module systems from exactly this
   mistake.
3. **State your plan before executing it**, including the exact files and functions
   you intend to touch, so a mismatch with intent can be caught before code changes.

## While making changes

4. **Touch only the files and lines the task actually requires.** Do not reformat,
   "clean up," or restructure surrounding code you weren't asked to change.
5. **If an expected piece of code doesn't match what you were told to expect, stop
   and report exactly what you found — do not guess, approximate, or improvise a fix
   for the mismatch on your own.** A wrong guess applied confidently is worse than a
   pause to ask.
6. **Never modify these without explicit, separate confirmation, even if a task
   seems to imply it:**
   - The 4 core generation styles (hatching/solid/dotwork/hybrid) and their prompt
     text in `create.tsx`
   - Any database name, storage key, or localStorage key already in use — renaming
     these without a migration path orphans existing user data
   - Any working, already-verified pipeline (the classical engine's CLAHE, bilateral
     filter, XDoG, structure tensor) — these have been fixed from broken/fake
     implementations before; don't re-break them by "improving" them again without
     a specific, reproducible reason
7. **Do not add new dependencies, new parallel systems, or new "upgraded" versions
   of something that already exists and works**, even if asked to make something
   "the best possible" — improving what's there beats building next to it.
8. **Never commit API keys, secrets, or provider credentials into client-bundled
   code.** Anything prefixed `VITE_` in this project ships to every visitor's
   browser — server-only secrets never get that prefix.

## After making changes

9. **Run typecheck/build and report the actual result** — not "should work," the
   actual pass/fail output.
10. **State plainly which files were touched and which were not**, so drift between
    agents can be tracked.
11. **If something you were asked to fix turns out to already be fixed or already
    correct, say so and stop — do not make an unnecessary change just to have
    produced output.**

## A note on free/low-cost models specifically

If you are a smaller or free-tier model (e.g., a compact coding-agent model) being
used for cost reasons: prefer being asked to do one small, precisely-specified patch
over being asked to design or scope a feature end to end. Precision on a narrow,
well-specified task is where a smaller model earns its keep; open-ended architectural
judgment calls are where mismatches between agents happen. If a task feels
architecturally ambiguous, say so and ask for the human or a more capable model to
make that call, rather than making a plausible-sounding guess.
