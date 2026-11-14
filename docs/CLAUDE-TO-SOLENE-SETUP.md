# Working with Claude and the Solene agent

This repo is worked on by two AI assistants with different jobs:

- **Claude** (Claude app / Claude Code): plans and writes changes, and can open PRs or push branches through its own GitHub connector.
- **Solene** (Base44 Superagent): has its own workspace, sandbox and GitHub connection. It checks out the repo, runs typecheck and build, fixes issues, and pushes or merges.

Both must follow `AGENTS.md` and `VISION.md` at the repo root.

## What does not work

The **Base44 connector inside Claude** reaches Base44 *apps* (the builder side). A Superagent is a separate product, so Solene's chat and workspace do not appear there. Do not expect Claude to "find the chat" through that connector.

## Option A: GitHub as the shared handoff (works today)

1. Claude works on a branch of `emccaine96-ai/ai-stencil-magic` (never directly on `main`) and opens a PR, using its GitHub connector.
2. Tell Solene in its chat: "Review and finish the PR from branch `<name>`."
3. Solene checks out the branch, runs `npm run typecheck` and the production build, fixes problems, and reports the actual pass/fail output.
4. Solene pushes fixes to the same branch. Merge to `main` only after you approve.

Optional: ask Solene to set up a GitHub trigger workflow that fires on pushes or PRs to this repo, so it reacts automatically when Claude pushes a branch.

## Option B: Solene's agent API (direct messaging)

Solene exposes an external API so another client can message it directly.

1. Open the agent settings: https://app.base44.com/superagent/6a52e966575843e8aad5eb7b
2. Open the **Developer / API Docs** panel (owner account only). It shows the base URL, which follows `/api/agents/<agent_id>`, and the agent API key.
3. Copy or download the API docs as `SKILL.md` and give that file to Claude (for example in a Claude Project or a Claude Code session).
4. Give Claude the API key through its own secret or environment mechanism. Claude then sends a task as a message to the agent's conversation endpoint, and the reply comes back when the work completes.

Status: this path has not been tested from Claude's side. If the Developer panel shows a permission error, check that you are signed in as the owner account and try a desktop browser.

## GitHub permissions Solene holds

`repo`, `workflow`, `admin:repo_hook`, `write:packages`, `gist`, `notifications`, `user:email`, `read:org`, `read:user`.

`delete_repo` is intentionally **not** granted. `read:packages` was requested but GitHub did not grant it.

## Safety rules

- Never put the agent API key, a GitHub token, or any secret in this repo, in a `VITE_` variable, or in a chat you share. If a key is ever exposed, rotate it.
- Anything prefixed `VITE_` ships to every visitor's browser.
- Both assistants: read the current file before editing, touch only what the task needs, and report the actual typecheck/build result and which files were touched (see `AGENTS.md`).
