# What this project actually is — read before making any architectural decision

This document exists because this codebase has been worked on by several different AI
agents without a shared understanding of what's being built. AGENTS.md (the companion
file) covers *how* to behave. This covers *what this is*, so a technically-reasonable
decision doesn't quietly work against the actual goal.

## The vision, in the owner's own terms

This is not an attempt to build a somewhat-better version of an existing tattoo
stencil app. The goal is a full-scale tattooing platform — closer to "a studio in an
app" than "a stencil generator." Three things make that specific, not just aspirational
language:

1. **It's built to get better as the AI ecosystem gets better, not just as this app
   gets updated.** The generation layer runs on OpenRouter specifically so that as
   OpenRouter's catalog of image-capable models grows and improves, this app's ceiling
   rises with it — without needing to re-integrate a new provider from scratch every
   time. An agent should never "simplify" this down to one hardcoded model, and should
   treat "make it easy to add/select from more models" as a first-class goal, not a
   nice-to-have.
2. **It's tiered by design, not by accident.** A user who wants fast, cheap,
   photo-to-decent-stencil should get that (the local classical engine — no API cost,
   no key required). A user who wants maximum quality and control should get real
   depth (multiple AI providers, model choice, advanced touch-up tools) at a price
   that beats competitors who only offer one tier. Both of those users are the target
   audience, not just one of them. Don't collapse this into a single "best path" —
   the choice itself is the product.
3. **It's meant to become a platform users configure, not one fixed workflow.** Plugins,
   a marketplace, per-user setup preferences. The plugin system already in this
   codebase (sandboxed, isolated execution) isn't a minor utility feature — it's the
   seed of that marketplace. Treat it as core architecture worth strengthening, not
   a small tool to leave alone or trim down.

The standard to hold any change to: does this make the platform more capable, more
extensible, and more the user's own — not just "does this match what other stencil
apps already do."

## Honest state of the repo, as actually verified (not assumed)

**Genuinely solid, built correctly, keep building on these:**
- The classical engine core: real tile-based CLAHE, a correct edge-preserving
  bilateral filter, structure-tensor-driven flow for line direction, a correct XDoG,
  stochastic stippling, and hysteresis-thresholded Canny. This was not always true —
  several of these were fake/mislabeled implementations that got fixed. They're real
  now.
- The multi-provider generation system (local Classical, Gemini, OpenRouter, and a
  Hybrid mode that runs classical pre-processing then AI refinement) — this is the
  concrete embodiment of the "tiered by design" pillar above.
- The plugin sandbox (iframe-isolated execution, a defined plugin manifest shape) —
  this is the concrete embodiment of the "platform users configure" pillar. It's a
  real foundation, not a stub.
- Auth, the Vault editor's core (brushes, layers, symmetry, autosave), and the
  AI-provider key management system are all functional.

**Real, well-designed work that exists but isn't connected to anything yet:**
- A second, more advanced classical-engine module set (multi-scale frequency-band
  edge detection, a genuinely good deterministic "tattooability score" that rates
  ink coverage/isolated regions/detail density and explains *why* a design might be
  hard to tattoo, background separation modes) — built, correct, currently unused by
  any live user-facing path.
- A Font Squirrel tattoo-lettering font system — the registry/loading infrastructure
  is built; zero actual fonts have been added to it yet.
- A shading-guide-line + post-generation ink-style/color feature — this was
  previously attempted, didn't work correctly, and was removed; a rebuild exists in
  the code but isn't reachable from the UI yet. The owner wants this back as an
  *optional*, non-default choice, not the default behavior.

**The actual risk to this vision right now isn't missing features — it's
unfinished ones.** Multiple agents have built real, often good work in parallel
without knowing about each other's work. The single highest-leverage thing any agent
can do for this project most of the time is finish and wire up something that
already exists correctly, rather than start another parallel system that sounds
similar to something already half-built.

## Priorities, in order, consistent with the vision above

1. **Consolidate before adding.** Wire the dormant tattooability score and
   background-separation work into the live classical pipeline before building
   anything new that sounds similar. Reconcile the two currently-separate classical
   module systems rather than letting a third emerge.
2. **Strengthen the plugin architecture as real platform infrastructure**, not a
   feature list. A defined manifest format, a clear permission model for what a
   plugin can touch, and a path toward third-party submission are what turn "some
   built-in plugins" into "a marketplace."
3. **Keep the model layer dynamic.** Any work touching OpenRouter integration should
   default to fetching live model capabilities rather than hardcoding a list — the
   whole point is that this improves without a rebuild.
4. **Finish the shading-guide/ink-style feature properly, as optional** — the owner
   was explicit that it must not become the default behavior, given it didn't work
   correctly the first time.
5. **Add the tattoo lettering fonts** — real Font Squirrel font files, licensed for
   commercial use, added to the existing empty registry.
6. **Touch-up tools in the Vault editor should aim for genuinely advanced and
   easy to use** — professional-grade capability without professional-software
   complexity. That's a real design tension, not a checkbox; an agent asked to add a
   touch-up tool should ask whether it's something a working tattoo artist would
   actually reach for, not just whether it's technically impressive.

## What "blindly going against the vision" looks like in practice

These are specific, plausible mistakes a careful agent could make while thinking it's
being helpful:

- Seeing multiple AI providers and multiple classical engine variants and "cleaning
  up" by deleting all but one, because that looks tidier. The multiplicity is the
  product, not clutter — the fix for duplication is consolidating *into one correct
  version of each thing*, not reducing to a single option.
- Treating the plugin system as a minor utility and deprioritizing it in favor of
  more generation features. It's core platform architecture for where this is
  headed.
- Hardcoding "the best model" anywhere in the generation path instead of keeping
  model choice live and user-facing.
- Calling a feature done because it matches what a typical stencil app offers. The
  bar here is explicitly set above that.
