# AGENTS.md

## Purpose

This repository is a pi provider extension that registers Cursor SDK-backed models under the `cursor` provider. Agent work is successful when changes preserve pi-native model/thinking/session behavior, keep Cursor API keys out of repo state and logs, and pass the local validation commands below.

## Repository map

Source code lives under modular `src/` folders. See [`src/README.md`](src/README.md) for the directory index.

- `src/index.ts` registers the pi extension, provider, fallback warnings, native replay wrappers, question tool, and pi tool bridge hooks.
- `src/provider/` streams through local `@cursor/sdk` agents (including live-run drain, turn coordination, usage accounting, and MCP timeout overrides).
- `src/bridge/` exposes active pi tools to local Cursor agents through a per-run loopback MCP bridge (snapshot, server, run lifecycle, diagnostics, `cursor_ask_question`).
- `src/replay/` owns native tool replay display (registration, routing, trace, compact cards, edit diff resolution).
- `src/transcript/` owns per-tool transcript labels, formatters, and replay display specs.
- `src/discovery/` discovers Cursor models, fallback snapshots, and context-window caches.
- `src/context/` handles prompt conversion and `context.tools` snapshot helpers.
- `src/session/` owns session cwd, Cursor agent lifecycle, and scope keys.
- `src/task/` owns the task widget UI and turn progress display.
- `src/settings/` owns agent settings and the `/cursor-settings` command.
- `src/shared/` owns cross-cutting utilities (env boolean parsing, record helpers, secret scrubbing, SDK output filter, display text truncation).
- `test/**/*.test.ts` contains Vitest coverage for provider registration, discovery, state, context, bridge, replay, and streaming behavior.
- `docs/options.md` is the user-facing options reference (commands, env vars, settings, model IDs).
- `docs/cursor-model-ux-spec.md` is the maintainer design source of truth for Cursor model UX. Keep it aligned with behavior changes.
- `docs/cursor-testing-lessons.md` is the maintainer source of truth for regression testing lessons (auth.json, isolated smoke harnesses, JSONL replay scans, plan-mode replay traps).

## Operating rules

- Prefer the smallest change that preserves the current pi user contract.
- Treat Cursor SDK model metadata as the source of truth for model IDs, parameters, variants, thinking controls, and context variants. Do not hardcode new model-specific behavior unless it is a documented fallback.
- HARD REPO RULE: never guess what the Cursor SDK outputs, expects, or does. Always verify Cursor SDK behavior against the installed `@cursor/sdk` package and/or the official TypeScript SDK docs at `https://cursor.com/docs/sdk/typescript` before making claims or implementation changes.
- Keep pi-native abstractions first: context and fast are model variants, thinking uses pi thinking metadata.
- Preserve the default pi footer; do not add Cursor-only extension status for fast mode.
- Stop discovery once package scripts, README, config files, tests, and the relevant `src/` modules explain the task. Do not broad-search `node_modules` unless debugging a dependency API.
- Ask the user before changing public UX, published package metadata, dependency families, or behavior that requires a migration. Otherwise proceed and verify locally.

## Setup and commands

- Install dependencies: `pnpm install`
- Run tests: `npm test`
- Typecheck: `npm run typecheck`
- Package-readiness check: `npm pack --dry-run`
- Watch tests while developing: `npm run test:watch`
- Local development run, requires a Cursor key: `CURSOR_API_KEY="your-key" pi -e . --model cursor/composer-2.5`
- Local extension install: `npm run pi:package:local` (or `scripts/pi-use-local-cursor-sdk.sh`) writes this checkout into `packages` in `~/.pi/agent/settings.json` and removes remote `pi-cursor-sdk` entries; `npm run pi:package:remote` restores the GitHub package
- Alternate manual install: symlink the repo to `~/.pi/agent/extensions/cursor-sdk`, run `pnpm install`, then start pi from any project
- List Cursor models, requires pi and usually a Cursor key: `pi --list-models cursor`

- Lint: `npm run lint` (oxlint; `npm run lint:fix` to auto-fix safe issues)
- Format: `npm run format` (oxfmt; `npm run format:check` in CI)
- CI: GitHub Actions [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs typecheck, lint, format check, and tests on every pull request
- IDE: VS Code ([`.vscode/`](.vscode/)) and Zed ([`.zed/`](.zed/)) workspace settings for the Oxc extension

## Coding conventions

- TypeScript is ESM with `moduleResolution: "NodeNext"`; keep `.js` extensions on local relative imports.
- Keep strict TypeScript types. Avoid `any` except in tests or when narrowing untyped external SDK data.
- Keep provider runtime code side-effect-light. Do not write secrets, and do not let cache or discovery failures break response streaming unless the run cannot proceed safely.
- Add or update tests for behavior changes in `src/`. Prefer focused unit tests over live Cursor calls.
- If dependency versions change, update `pnpm-lock.yaml` with pnpm. Do not manually edit generated dependency output.
- Do not commit `dist/`, `coverage/`, `.env*`, `.pi/`, or package tarballs.

## Validation and done criteria

Done means:

- The intended behavior or documentation change is complete.
- `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check` pass, unless the change is docs-only and the user asked for minimal validation.
- `npm pack --dry-run` passes when package metadata, publishable docs, dependencies, or ignored artifacts change.
- Related README/docs/tests are updated when behavior, commands, user-visible model IDs, flags, or troubleshooting change.
- No secrets, local API keys, or noisy local state are added.

If validation fails:

1. Triage the first failing test/type error to root cause.
2. Fix failures caused by the change.
3. If a failure is unrelated or cannot be run locally, report the command, failure, likely reason, and what still needs verification.

## Planning and large changes

Use a short written plan before multi-file behavior changes, SDK integration changes, or public UX changes. Use `PLANS.md` only if a task needs durable multi-session tracking; do not create one for routine edits.

## Security and side effects

- NEVER store Cursor API keys in repo files, `~/.pi/agent/cursor-sdk.json`, tests, logs, snapshots, or docs examples.
- Scrub Cursor SDK errors and output that may contain API keys, bearer tokens, cookies, sessions, or auth headers.
- Ambient Cursor settings/rules loading is enabled by default through `PI_CURSOR_SETTING_SOURCES=all`; keep SDK startup log filtering intact so settings/skills output does not corrupt pi's TUI.
- Live `pi`/Cursor smoke tests may call external services and require Cursor auth in `~/.pi/agent/auth.json` and/or `CURSOR_API_KEY`; run them for Cursor provider/runtime changes. If auth is unavailable, report live smoke as release-blocked instead of skipped-ready. See `docs/cursor-testing-lessons.md` for isolated harness auth seeding.
- For Cursor provider/runtime changes, follow `docs/cursor-live-smoke-checklist.md`. Assume every runtime surface is in scope. Use real `pi -e . --model cursor/composer-2.5` invocations, a temporary `--session-dir`, manual observation, and no secret printing. Do not mark release-ready with optional/deferred/mostly-passing smoke items outstanding.

## Progress updates and handoff

For multi-step or tool-heavy work, give short progress updates after meaningful milestones: what changed, what is being checked, and any blocker. Final handoff should include changed files, validation commands/results, skipped checks with reasons, and any follow-up risks.

## Updating this file

Keep this file concise and repo-specific. Update it when commands, package layout, safety constraints, or validation expectations change. Put specialized subdirectory rules in a nested `AGENTS.md` only when that subtree has materially different commands or constraints.
