# Server generation with credits

Hard limits respected: STYLE_PROMPTS and buildPrompt in create.tsx stay unchanged, nothing under src/lib/classical* is edited, no storage keys or defaults change, ALLOW_SERVER_KEY is not set, the old /api routes and their gate are not touched, AI Copilot stays disabled and unconnected to credits, and no dependencies or lockfiles change (zod is already installed).

## What was checked before planning
- `create.tsx`: STYLE_PROMPTS at line 81, buildPrompt at line 1402. The server path today is the `provider === "openrouter"` branch around line 594 (`fetch("/api/generate-stencil")`), plus the hybrid branch around line 530.
- `api/generate-stencil.ts` limits: `MAX_IMAGES = 3`, `MAX_IMAGE_B64_CHARS = 14_000_000` (about 10 MB decoded), MIME types png/jpeg/webp, and `MODEL_ID_RE`.
- Database functions (read live): `reserve_credits` returns `{already_reserved, balance, ...}`, raises `insufficient_credits`, and serializes per user with an advisory lock. `refund_request` only acts on `reserved` rows. `grant_credits` uses `ON CONFLICT DO NOTHING`, backed by the unique index `credit_ledger_store_txn_uniq`, so `signup:<uid>` can only be granted once.
- `profiles` has `ai_consent_at` but no consent-version column. `generation_requests` has no index on `user_id`/`created_at`. Nothing in the app creates profile rows today. There is no `/privacy` route.

## Migration needed (one new, additive file)
- `ALTER TABLE profiles ADD COLUMN ai_consent_version text` (nullable).
- `CREATE INDEX generation_requests_user_created_idx ON generation_requests (user_id, created_at)` and `CREATE INDEX generation_requests_created_idx ON generation_requests (created_at)`, used by the limit counts.
- No new tables. Old migrations stay untouched.

## Files to create
1. `src/lib/server/ai-config.ts`: the ONE config file. It holds `PROVIDER = "openrouter"`, `DEFAULT_MODEL = "google/gemini-2.5-flash-image"`, `MODEL_ALLOWLIST = [DEFAULT_MODEL]`, `COST_PER_GENERATION = 1`, `SIGNUP_GRANT = 3`, `PER_MINUTE_LIMIT = 6`, `PER_DAY_LIMIT = 100`, `DEFAULT_DAILY_BUDGET = 300`, `UPSTREAM_TIMEOUT_MS = 90_000`, `CONSENT_VERSION = "v1"`, and the image/MIME limits copied from the existing route. Components import display numbers from here. (`src/lib/server/` holds only modules imported by `*.functions.ts` and tests, never directly by components. If the build's import protection blocks that folder, I will use `src/lib/ai-server/` instead and tell you.)
2. `src/lib/server/prompts.ts`: STYLE_PROMPTS and buildPrompt copied byte-for-byte from create.tsx by a script that extracts the source text (no retyping). It adds `export` and nothing else.
3. `src/lib/server/prompts.test.ts`: reads create.tsx, takes the client STYLE_PROMPTS and buildPrompt source, evaluates it, and checks that the output equals the server copy byte-for-byte for hatching/solid/dotwork/hybrid at intensity 0, 0.25, 0.5, 0.73 and 1, with and without customPrompt. The test fails if either copy drifts.
4. `src/lib/server/generate-core.ts`: pure logic with injected dependencies (`db.reserve/settle/refund/countUser/sumGlobal/consent`, `callProvider`, `now`). It returns `{ok:true,image,balance}` or `{ok:false,code}` with codes `consent_required | rate_limited_minute | rate_limited_day | busy | insufficient_credits | duplicate_request | provider_error | timeout`. Order: consent, then per-user limits, then global cap, then model allowlist, then reserve. On `already_reserved` it returns `duplicate_request` without calling the provider. Then the provider call runs in `try/finally`: a `settled` flag is set only after success and `settle_request`; the `finally` block calls `refund_request` whenever it is not set. Timeout uses `AbortController`. Upstream text is logged server-side, truncated, and never returned.
5. `src/lib/generation.functions.ts`: `generateStencil` (createServerFn POST plus `requireSupabaseAuth`). It validates with zod: `style` enum of the four styles, `intensity` 0–1, `customNote` up to 500 characters, `images` 1–3 of `{mimeType in allowlist, data base64 up to the limit}`, `tier` enum (accepted for future use; the cost is always 1 from config), and `requestId` uuid. It builds the prompt with the server `buildPrompt`, loads `supabaseAdmin` inside the handler, and wires the real dependencies into generate-core.
6. `src/lib/credits.functions.ts`: `getMyCredits` (balance through `credit_balance(userId)` via admin, after auth; ledger rows through `context.supabase`, so your own RLS applies, newest 50), `recordAiConsent` (sets `ai_consent_at = now()` and `ai_consent_version = 'v1'` on your own profile row through RLS), and `ensureProfile` (described below).
7. `src/lib/server/generate-core.test.ts`: bun tests with fake dependencies, no network or DB: provider throws leads to one refund and no settle; timeout leads to one refund; the same requestId twice charges once and the provider is called once; `insufficient_credits` returns that code with a clear message and zero provider calls; the 7th call in a minute returns `rate_limited_minute`; the 101st in a day returns `rate_limited_day`; global sum at or above budget returns `busy`; missing consent returns `consent_required` with no reserve.
8. `src/components/ConsentDialog.tsx`: says photos are sent to OpenRouter and Google (Gemini model) for processing, links to `/privacy`, and has Agree/Cancel buttons. Agree calls `recordAiConsent`.
9. `src/routes/privacy.tsx`: a placeholder page that says "Privacy policy coming soon", with its own head().
10. `src/routes/_authenticated/credits.tsx`: shows the balance and ledger history table (date, reason, +/-), and a "Buy credits coming soon" note. No purchase code. (The managed `_authenticated/route.tsx` gate is created only if it is missing.)

## Files to edit
- `src/routes/create.tsx`, minimal: one import line, a small `useCloudGenerate()` hook call, and one early branch inside the existing `provider === "openrouter"` branch: `if (!orKey) { await cloudGenerate(...); return-path }`. The hook (in new `src/hooks/use-cloud-generate.ts`) owns the session check (signed out leads to a toast and `navigate("/auth")`), consent dialog state, the requestId (`crypto.randomUUID()`, kept for an in-flight double tap and replaced with a new one after any failure or refund), the code-to-message mapping, and the server call. It returns a data URL, which goes through the existing `normalizeToPurpleInk`/`setStencil` lines. The `<ConsentDialog>` is rendered once by the hook's returned element. Bring-your-own-key behavior is unchanged: with `orKey` set, the old route path runs exactly as today, and Gemini, classical and hybrid branches are not edited. The current "open key modal when no orKey" line becomes skip-when-cloud; this is the only behavior change. STYLE_PROMPTS and buildPrompt lines are not touched.
- `src/routes/__root.tsx`: in the existing auth listener, on `SIGNED_IN` call `ensureProfile` once (no new listener). `ensureProfile` inserts the profile if it is missing (`on conflict do nothing`), then calls `grant_credits(uid, SIGNUP_GRANT, 'signup', 'signup:'||uid)` through admin. The grant is idempotent through the unique store_txn index, so repeats are harmless and existing users also receive 3 once on their next sign-in.
- A "Credits" link in the existing header/settings nav (one line).
- `AGENTS.md`: one line: "Server-key AI generation goes only through generateStencil with credits; all pricing/limits/models live in src/lib/server/ai-config.ts."
- `roadmap.md`.

## How limits are counted (no new table)
- Per user: `count(*) from generation_requests where user_id = $1 and created_at > now() - interval '1 minute'` (limit 6), and the same since UTC midnight (limit 100). All statuses count, including refunded, so failed spam still counts.
- Global: `sum(cost) from generation_requests where created_at >= UTC midnight and status in ('reserved','done')`; if at or above `DAILY_BUDGET_CREDITS`, return `busy`.
- Known gap: the counts run just before `reserve_credits`, so truly simultaneous requests can exceed a limit by a few (reserve's lock is per user, not global). Making it exact would need a SQL function change; not proposed now.

## Secrets (where each is read)
- `OPENROUTER_API_KEY` (already referenced by old route; I will check if it exists and otherwise request it via the secure secrets form, never in chat): read only inside the `generateStencil` handler → passed to `callProvider`.
- `DAILY_BUDGET_CREDITS` (optional; default 300 from config if absent/invalid): read only inside the `generateStencil` handler.
- `SUPABASE_SERVICE_ROLE_KEY`: used implicitly by the generated admin client, loaded inside handlers after auth.
- ALLOW_SERVER_KEY: not read or set by the new code.

## Verification
- Run prompts and generate-core tests and the existing suites (regression, hatching, fscore, flow-modulation, metric self-test, gallery moderation), plus typecheck. Paste the real output.
- Rollback-only SQL: the migration columns and indexes exist, and the signup grant applied twice gives 3 credits once.
- Browser: signed out, the cloud generate button leads to /auth. Signed in (minted session): consent appears, then the credits page shows 3. A live OpenRouter call is tested only if the key is set; otherwise I report it as untested.
- Smoke test on Classical Pro export: confirm SHA-256 `e936c116…f6c` and no page errors.

## Risk to engine baseline hash
Low. The classical branch and `src/lib/classical*` are not edited, and the create.tsx edit sits only inside the openrouter branch. The one shared change is the hook and dialog rendering in create's tree; this does not affect canvas processing. The smoke rerun will confirm.
