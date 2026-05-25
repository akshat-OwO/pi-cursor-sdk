# Options reference

All user-facing configuration for pi-cursor-sdk.

Boolean env vars accept `1`/`true`/`on`/`yes`/`enabled` and `0`/`false`/`off`/`none`/`no`/`disabled`.

## Slash commands

| Command                  | Description                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| `/cursor-refresh-models` | Refresh live Cursor model catalog without restarting pi             |
| `/cursor-settings`       | Toggle compact tool display (interactive TUI; reloads after change) |
| `/login`                 | Pi-native auth; choose **Use an API key** → **Cursor**              |
| `/model`                 | Pi-native model picker                                              |

## Auth

Resolved in order: `--api-key`, stored `cursor` key in `~/.pi/agent/auth.json`, then `CURSOR_API_KEY`.

```bash
pi --api-key "your-key" --model cursor/composer-2.5 -p "Say ok"
export CURSOR_API_KEY="your-key"
```

Do not store API keys in `~/.pi/agent/cursor-sdk.json`.

## Settings file

Project overrides merge over agent defaults.

| File                        | Scope         |
| --------------------------- | ------------- |
| `~/.pi/agent/settings.json` | Global        |
| `.pi/settings.json`         | Project-local |

| Key                        | Type    | Default | Description                                                      |
| -------------------------- | ------- | ------- | ---------------------------------------------------------------- |
| `cursorCompactToolDisplay` | boolean | `false` | OpenCode-style one-line replay rows for Cursor SDK sessions only |

Env `PI_CURSOR_COMPACT_TOOL_DISPLAY` overrides the setting for one session.

## Environment variables

### Bridge

| Variable                             | Default | Description                                                                               |
| ------------------------------------ | ------- | ----------------------------------------------------------------------------------------- |
| `PI_CURSOR_PI_TOOL_BRIDGE`           | `true`  | Expose active pi tools to Cursor via loopback MCP (`pi__*` names)                         |
| `PI_CURSOR_EXPOSE_BUILTIN_TOOLS`     | `false` | Also bridge overlapping built-ins (`read`, `bash`, `write`, `edit`, `grep`, `find`, `ls`) |
| `PI_CURSOR_MCP_TOOL_TIMEOUT_SECONDS` | `3600`  | Cursor SDK MCP `callTool` timeout (SDK default is 60s)                                    |
| `PI_CURSOR_MCP_TOOL_TIMEOUT_MS`      | —       | Same timeout in milliseconds (overrides seconds when set)                                 |
| `PI_CURSOR_PI_TOOL_BRIDGE_DEBUG`     | `false` | Scrubbed JSONL bridge diagnostics to stderr (`[pi-cursor-sdk:bridge]`)                    |

### Cursor settings & MCP

| Variable                    | Default | Description                                                                                                                         |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PI_CURSOR_SETTING_SOURCES` | `all`   | Comma-separated Cursor setting sources to load (`project`, `user`, `plugins`, …). Use `none`/`0`/`false` to disable ambient loading |

### Native replay display

| Variable                          | Default                   | Description                                                                                   |
| --------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `PI_CURSOR_NATIVE_TOOL_DISPLAY`   | `true` in interactive TTY | Native replay cards vs scrubbed activity transcripts                                          |
| `PI_CURSOR_REGISTER_NATIVE_TOOLS` | follows display           | Registration-only opt-out (also disables replay at runtime)                                   |
| `PI_CURSOR_COMPACT_TOOL_DISPLAY`  | from settings             | One-line OpenCode-style rows for `read`, `grep`, `find`, `bash`, `edit`, `write`, `ls` replay |

### Task UI

| Variable                 | Default | Description                             |
| ------------------------ | ------- | --------------------------------------- |
| `PI_CURSOR_TASK_WIDGET`  | `true`  | In-progress Cursor `task` widget in TUI |
| `PI_CURSOR_TASK_DISPLAY` | `true`  | Task activity in replay/display paths   |

## Model IDs

Examples:

```bash
pi --model cursor/composer-2.5
pi --model cursor/composer-2.5-fast
pi --model cursor/gpt-5.5@1m
pi --model cursor/gpt-5.5@272k:xhigh
pi --model cursor/claude-opus-4-7@300k --thinking high
```

| Pattern                      | Meaning                                     |
| ---------------------------- | ------------------------------------------- |
| `cursor/<id>`                | Base model                                  |
| `cursor/<id>-fast`           | Fast variant when SDK exposes `fast`        |
| `cursor/<id>@<context>`      | Context-window variant (`@1m`, `@272k`, …)  |
| `:medium`, `:high`, `:xhigh` | Thinking suffix on model ID                 |
| `--thinking <level>`         | Pi thinking control (alternative to suffix) |

Fast mode is a model variant, not extension state. Older `/cursor-fast` and `--cursor-fast` flags are removed—select a `-fast` model instead.

## Common recipes

```bash
# Cursor SDK tools only — no pi bridge
PI_CURSOR_PI_TOOL_BRIDGE=0 pi --model cursor/composer-2.5

# Bridge overlapping pi built-ins too
PI_CURSOR_EXPOSE_BUILTIN_TOOLS=1 pi --model cursor/composer-2.5

# Compact replay rows for this session
PI_CURSOR_COMPACT_TOOL_DISPLAY=1 pi --model cursor/composer-2.5

# Load only project + user Cursor settings
PI_CURSOR_SETTING_SOURCES=project,user pi --model cursor/composer-2.5

# Transcript fallback instead of native replay cards
PI_CURSOR_NATIVE_TOOL_DISPLAY=0 pi --model cursor/composer-2.5

# Long-running MCP tool
PI_CURSOR_MCP_TOOL_TIMEOUT_SECONDS=7200 pi --model cursor/composer-2.5
```

## Related docs

- [Native tool replay](cursor-native-tool-replay.md) — bridge vs replay, supported cards, conflicts
- [Model UX spec](cursor-model-ux-spec.md) — maintainer design reference
