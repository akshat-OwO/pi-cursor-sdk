# Cursor Live Smoke Verification — 0.1.16 — 2026-05-22

## Scope

Manual release smoke verification for `pi-cursor-sdk` 0.1.16 using the local working tree with:

```bash
pi -e . --cursor-no-fast --model cursor/composer-2.5
```

The smoke used a temporary session directory and did not record Cursor API keys, raw session contents with secrets, endpoint URLs, or local private paths in this document.

## Summary

Result: **passed**.

Coverage matched `docs/cursor-live-smoke-checklist.md`:

- Cursor model discovery
- basic provider run
- default Cursor setting-source startup behavior
- interactive TUI observation
- pi bridge success and failure paths
- native Cursor tool replay with the pi bridge disabled
- bridge diagnostics scrub scan
- long-running bridged tool abort/cancel cleanup
- structural JSONL usage scan
- standard local release gates

## Checks

### Prerequisite: Cursor model discovery

Command shape:

```bash
pi -e . --list-models cursor
```

Observed:

- Exit code `0`.
- `cursor/composer-2.5` and `cursor/composer-2-5` appeared in the Cursor model list.
- No Cursor key or auth token was printed.

### 1. Basic provider reality check

Command shape:

```bash
PI_CURSOR_SETTING_SOURCES=none \
pi -e . --cursor-no-fast --model cursor/composer-2.5 \
  --session-dir "$SMOKE_DIR/basic" \
  --no-tools \
  -p 'Live smoke. Reply exactly: PI_CURSOR_SMOKE_OK'
```

Observed:

- Exit code `0`.
- stdout contained `PI_CURSOR_SMOKE_OK`.
- stderr was empty.
- Persisted JSONL structure: roles `user, assistant`; one assistant message; no tool calls/results; assistant usage present with non-negative fields and `cacheRead/cacheWrite` equal to `0`.

### 2. Default setting-source startup noise check

Command shape:

```bash
pi -e . --cursor-no-fast --model cursor/composer-2.5 \
  --session-dir "$SMOKE_DIR/default-settings" \
  --no-tools \
  -p 'Default settings smoke. Include PRODUCT=42 in the final answer.'
```

Observed:

- Exit code `0`.
- stdout included `PRODUCT=42`.
- stderr was empty.
- No Cursor SDK settings/skills startup logs corrupted stdout.
- Persisted JSONL structure: roles `user, assistant`; one assistant message; assistant usage present with non-negative fields and `cacheRead/cacheWrite` equal to `0`.

### 3. TUI observation check

Command shape:

```bash
PI_CURSOR_SETTING_SOURCES=none \
pi -e . --cursor-no-fast --model cursor/composer-2.5 \
  --session-dir "$SMOKE_DIR/tui" \
  --no-tools \
  'TUI smoke. Compute 19 + 23. Reply only with SUM=<number>.'
```

Observed in tmux:

- Assistant output showed `SUM=42`.
- Footer showed `(cursor) composer-2.5`.
- With `--cursor-no-fast`, Cursor fast status was absent.
- `/session` showed one user message and one assistant message.
- Persisted JSONL structure: roles `user, assistant`; one assistant message; assistant usage present with non-negative fields and `cacheRead/cacheWrite` equal to `0`.
- The tmux smoke session was killed after capture; no `pi-cursor-sdk-smoke` tmux sessions remained.

### 4. Bridge multi-tool success and failure

Command shape:

```bash
PI_CURSOR_SETTING_SOURCES=none \
PI_CURSOR_EXPOSE_BUILTIN_TOOLS=1 \
PI_CURSOR_PI_TOOL_BRIDGE_DEBUG=1 \
pi -e . --cursor-no-fast --model cursor/composer-2.5 \
  --session-dir "$SMOKE_DIR/bridge" \
  -p 'Bridge smoke. Do exactly two tool calls before answering: first call pi__read on ./package.json; second call pi__read on ./definitely-missing-pi-cursor-sdk-smoke-file.txt. Then answer: OK_NAME=<package name>; MISSING_RESULT=<error or success>. Do not use shell.'
```

Observed:

- Exit code `0`.
- stdout included `OK_NAME=pi-cursor-sdk`.
- stdout reported the missing file as an `ENOENT` error.
- Bridge diagnostics included `run_created`, `tools_exposed`, two `request_queued`, two `request_resolved`, and `run_disposed` events.
- The second bridged read resolved with `isError: true`.
- Persisted JSONL structure: roles `user, assistant, toolResult, assistant, toolResult, assistant`; assistant tool calls `read, read`; tool results `read` success and `read` error.
- Assistant usage fields were present, non-negative, and used `cacheRead/cacheWrite: 0`.

### 5. Native replay cards without the pi bridge

Command shape:

```bash
PI_CURSOR_SETTING_SOURCES=none \
PI_CURSOR_PI_TOOL_BRIDGE=0 \
PI_CURSOR_NATIVE_TOOL_DISPLAY=1 \
pi -e . --cursor-no-fast --model cursor/composer-2.5 \
  --session-dir "$SMOKE_DIR/native-replay" \
  -p 'Native replay smoke. Use your Cursor file-reading capability to read ./README.md, then answer README_SEEN=yes if it contains pi-cursor-sdk.'
```

Observed:

- Exit code `0`.
- stdout included `README_SEEN=yes`.
- stderr was empty.
- Persisted JSONL structure: roles `user, assistant, toolResult, assistant`; assistant tool call `read`; tool result `read` success; final assistant turn present.
- Assistant usage fields were present, non-negative, and used `cacheRead/cacheWrite: 0`.

### 6. Diagnostics safety contract

Command shape:

```bash
find "$SMOKE_DIR" -type f \( -name '*stderr.txt' -o -name 'capture*.txt' \) -print0 |
  xargs -0 grep -E 'CURSOR_API_KEY|Bearer [A-Za-z0-9._-]+|/cursor-pi-tool-bridge/[^ ]+/mcp|127\.0\.0\.1:[0-9]+/cursor-pi-tool-bridge|apiKey|cookie|session-cookie|secret-token'
```

Observed:

- The forbidden-material scan returned no matches.
- Bridge diagnostics contained allowed event names, run-safe IDs, hashed Cursor MCP call IDs, safe pi/MCP tool name pairs, pending counts, and success/error booleans.
- Diagnostics did not include endpoint paths/URLs/tokens, raw args, raw results, stdout/stderr payloads, file contents, API keys, bearer tokens, cookies, or session credentials.

### 7. Long-running bridge and abort/cancel

Command shape:

```bash
PI_CURSOR_SETTING_SOURCES=none \
PI_CURSOR_EXPOSE_BUILTIN_TOOLS=1 \
PI_CURSOR_PI_TOOL_BRIDGE_DEBUG=1 \
pi -e . --cursor-no-fast --model cursor/composer-2.5 \
  --session-dir "$SMOKE_DIR/abort" \
  -p 'Abort smoke. Call pi__bash with command: sleep 30 && echo SHOULD_NOT_PRINT. Do not answer until the tool completes.'
```

Observed:

- Bridge diagnostics showed the `pi__bash` request queued.
- The run was interrupted after queueing.
- stdout was empty; `SHOULD_NOT_PRINT` did not appear.
- Diagnostics showed `request_rejected` with `rejectionKind: "cancelled"`, `Request aborted`, and `run_disposed`.
- No matching `sleep 30`, `SHOULD_NOT_PRINT`, bridge, or smoke tmux processes remained after interruption.
- Persisted JSONL structure: roles `user, assistant, toolResult, assistant`; assistant tool call `bash`; tool result `bash` with `isError: true`; final assistant stop reason `aborted` with empty content.

### 8. Final structural session scan

Observed structural scan output:

```json
{"dir":"basic","roles":["user","assistant"],"assistantCount":1,"toolCalls":[],"toolResults":[]}
{"dir":"default-settings","roles":["user","assistant"],"assistantCount":1,"toolCalls":[],"toolResults":[]}
{"dir":"tui","roles":["user","assistant"],"assistantCount":1,"toolCalls":[],"toolResults":[]}
{"dir":"bridge","roles":["user","assistant","toolResult","assistant","toolResult","assistant"],"assistantCount":3,"toolCalls":["read","read"],"toolResults":[{"toolName":"read","isError":false},{"toolName":"read","isError":true}]}
{"dir":"native-replay","roles":["user","assistant","toolResult","assistant"],"assistantCount":2,"toolCalls":["read"],"toolResults":[{"toolName":"read","isError":false}]}
{"dir":"abort","roles":["user","assistant","toolResult","assistant"],"assistantCount":2,"toolCalls":["bash"],"toolResults":[{"toolName":"bash","isError":true}]}
```

Usage scan summary:

- Every assistant message had usage.
- No usage object had negative `input`, `output`, or `totalTokens`.
- Every usage object had `cacheRead: 0` and `cacheWrite: 0`.

### 9. Standard local gates

Commands run after the release-audit fixes:

```bash
git diff --check
npm test
npm run typecheck
npm pack --dry-run
```

Observed:

- `git diff --check`: passed.
- `npm test`: passed, 13 files / 270 tests.
- `npm run typecheck`: passed.
- `npm pack --dry-run`: passed; tarball version `0.1.16`, total files `29`, package size about `95.7 kB`, unpacked size about `430 kB`; included runtime source, README, changelog, license, selected docs, and snapshot refresh script; excluded tests, local smoke artifacts, package tarballs, `.env*`, `.pi/`, `dist/`, and `coverage/`.

### 10. Cleanup

Observed:

- No `pi-cursor-sdk-smoke` tmux sessions remained after the TUI and abort checks.
- The temporary smoke artifact directory was removed after this summary was captured.
- No smoke artifacts were added to the publishable package.
