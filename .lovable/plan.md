# Security hardening (security only)

AGENTS.md and VISION.md exist and will be followed. Nothing in STYLE_PROMPTS, buildPrompt, src/lib/classical*, storage keys, or default settings will change.

## Two things that differ from your brief (please decide before I build)

1. **Gemini engine and AI Copilot will stop working by default.** Today the Gemini path in generate-stencil.ts and all of ai-copilot.ts use only the server's GEMINI_API_KEY. The browser never sends the user's own Gemini key, even though create.tsx saves one. With ALLOW_SERVER_KEY off by default, every Gemini and Copilot request will return 403. Options:
   - (a) Accept that. Only OpenRouter with the user's own key works until you set ALLOW_SERVER_KEY=true.
   - (b) Also let the user's own Gemini key (from the browser) be sent in the request, the same way the OpenRouter key is today. This is a new feature, so I won't add it without your OK.
2. **"Not stored" copy is only partly true.** The key is stored in the user's browser (localStorage `stencilmagic.openrouter.key`). Our server does not store it. Also, settings.tsx sends the key directly to OpenRouter for "Test key" and the model list. The new wording will be: "Saved only in your browser. When you generate, it is sent through our server to OpenRouter and is never stored on our server." The Test button text will say it checks the key directly with OpenRouter.

## Files I will touch

1. `src/routes/api/generate-stencil.ts` — add a shared check: server env keys are used only when `ALLOW_SERVER_KEY === 'true'` AND the Bearer token passes `getClaims` (same pattern as auth-middleware.ts). No/invalid token returns 401 `{error:"Sign in required"}`. Flag off returns 403 `{error:"Server key not available"}`. Requests with `openrouterKey` skip the check. Upstream error text is logged server-side (first 500 chars) and a generic message is returned.
2. `src/routes/api/ai-copilot.ts` — same gate; add `bodyLimit`, a PNG/JPEG/WebP allowlist and size limits matching generate-stencil; move the key from `?key=` into the `x-goog-api-key` header; return generic errors and log upstream text server-side (first 500 chars, never the key).
3. A new small server helper is not needed: the gate is written inline in each route, so no new files.
4. `src/routes/create.tsx` — at the two `/api/generate-stencil` calls (around lines 517 and 581), attach `Authorization: Bearer <access_token>` from `supabase.auth.getSession()` when signed in; on 401, send the user to `/auth`. Change only the copy at lines ~1297 and ~1333 in the key modal.
5. `src/components/studio/AICopilotModal.tsx` — same token attachment and 401 → `/auth`.
6. `src/routes/settings.tsx` — copy fix around line 107 only.
7. New migration: `revoke select on public.cloud_documents from anon; drop policy "shared docs public read" ...; drop policy "shared docs auth read" ...`. Shared links keep working because `getSharedDocument` already reads through the admin client by token. Owner policies stay.
8. `src/server.ts` — wrap the final response and add: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy: frame-ancestors 'none'`, plus a `Content-Security-Policy-Report-Only` baseline (self, backend, OpenRouter, Google AI, data:/blob: images). Note: `frame-ancestors 'none'` blocks the Lovable editor preview iframe. It is enforced in your brief, so I'll follow that unless you tell me to put it in Report-Only.
9. `.github/workflows/claude-autofix.yml`, `.github/workflows/claude-deploy.yml` — `on: workflow_dispatch` only; `permissions: contents: read` (other write permissions removed). `deploy.yml` stays as it is.
10. `.env` — remove the `OPENROUTER_API_KEY=""` line.

## Not touched
STYLE_PROMPTS, buildPrompt, src/lib/classical*, src/lib/openrouter-pool.ts (it's not imported anywhere), old migrations, cloud-sync.functions.ts, storage keys, defaults, deploy.yml, dependencies.

## Verify
Run `bunx tsgo --noEmit` and the build, and paste the real output. curl both API routes with no token, with a bad token, and with a user OpenRouter key, and check the status codes. Check the response headers. Open a share link to confirm it still loads. Then list the files touched and not touched.
