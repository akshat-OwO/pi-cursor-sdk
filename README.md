# pi-cursor-sdk

Use Cursor models inside [pi](https://github.com/earendil-works/pi-coding-agent) via the local `@cursor/sdk` agent runtime. Keeps pi's native model picker, thinking controls, session restore, and footer UX.

Fork of [pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk) by [Mitch Fultz](https://github.com/fitchmultz).

## Install

```bash
# from this fork
pi install https://github.com/akshat-OwO/pi-cursor-sdk

# project-local (writes .pi/settings.json)
pi install -l https://github.com/akshat-OwO/pi-cursor-sdk

# dev checkout
git clone https://github.com/akshat-OwO/pi-cursor-sdk.git && cd pi-cursor-sdk
pnpm install
pi -e . --model cursor/composer-2.5
```

**Requirements:** Node.js 22.19+, pi, and a Cursor API key.

## Quick start

```bash
pi --model cursor/composer-2.5
```

Inside pi: `/login` → **Use an API key** → **Cursor** → paste your key (saved to `~/.pi/agent/auth.json`).

Or set a key before launch:

```bash
export CURSOR_API_KEY="your-key"
pi --model cursor/composer-2.5
```

Verify:

```bash
pi --list-models cursor
pi --model cursor/composer-2.5 -p "Reply with: ok"
```

If pi started without a key, fallback models still register so `/login` works. After auth, run `/cursor-refresh-models` to load the live catalog without restarting.

## Models

Pick models with `/model` or `--model`:

```bash
pi --model cursor/composer-2.5
pi --model cursor/composer-2.5-fast          # fast variant when SDK exposes fast=
pi --model cursor/gpt-5.5@1m                 # context-window variant
pi --model cursor/gpt-5.5@1m:medium          # thinking suffix
pi --model cursor/gpt-5.5@1m --thinking medium
```

| Suffix / pattern             | Meaning                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `cursor/…`                   | Cursor provider from this extension                                  |
| `@1m`, `@272k`, `@300k`      | Context-window variants from the SDK catalog                         |
| `-fast`                      | Fast mode variant (`fast=true`)                                      |
| `:medium`, `:high`, `:xhigh` | Pi thinking level when the SDK exposes a controllable thinking param |

`thinking=no` in `--list-models` means pi cannot control thinking for that model—not that the model cannot think. Cursor may still emit thinking deltas that pi renders natively.

Images from the **latest** user message are forwarded. Reattach or describe earlier images on follow-up turns.

## Options

All slash commands, environment variables, and settings in one place: **[docs/options.md](docs/options.md)**.

Quick reference:

| What                            | How                                                          |
| ------------------------------- | ------------------------------------------------------------ |
| Refresh model catalog           | `/cursor-refresh-models`                                     |
| Compact replay tool rows        | `/cursor-settings` or `cursorCompactToolDisplay` in settings |
| Disable pi→Cursor tool bridge   | `PI_CURSOR_PI_TOOL_BRIDGE=0`                                 |
| Narrow Cursor settings/MCP load | `PI_CURSOR_SETTING_SOURCES=project,user,plugins`             |
| Disable native replay cards     | `PI_CURSOR_NATIVE_TOOL_DISPLAY=0`                            |

## How it works (short)

- **Cursor-native tools:** SDK local-agent tools, Cursor settings, plugins, and configured Cursor MCP servers.
- **Pi bridge (default on):** Active pi tools exposed to Cursor as `pi__*` MCP names; pi shows real tool names and runs normal pi tool flow. Overlapping built-ins (`read`, `bash`, `write`, `edit`, `grep`, `find`, `ls`) are hidden unless opted in.
- **Native replay (default on in TTY):** Display-only cards for recorded Cursor SDK activity—never re-runs commands or mutates files.

Details: [docs/cursor-native-tool-replay.md](docs/cursor-native-tool-replay.md).

## Limits

- Local Cursor SDK agents only (no cloud agents).
- Fallback model snapshot when discovery cannot authenticate; live runs still need a key.
- Cursor setting sources default to `all`; bootstrap noise is filtered from the TUI.
- Token usage in pi is approximate; see [docs/cursor-model-ux-spec.md](docs/cursor-model-ux-spec.md) for accounting policy.

## Troubleshooting

| Symptom                      | Fix                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Models listed but runs fail  | `/login` with Cursor key, then `/cursor-refresh-models`                                          |
| No Cursor models             | `pi list` — reinstall if missing                                                                 |
| Cursor app rules/MCP missing | Check `PI_CURSOR_SETTING_SOURCES` is not `none`                                                  |
| Pi extension tool not called | Tool must be active in session; set `PI_CURSOR_EXPOSE_BUILTIN_TOOLS=1` for overlapping built-ins |
| MCP timeout                  | Default raised to 3600s; override with `PI_CURSOR_MCP_TOOL_TIMEOUT_SECONDS`                      |

## Development

```bash
pnpm install
npm test
npm run typecheck
CURSOR_API_KEY="your-key" pi -e . --model cursor/composer-2.5
```

### Pi settings: local checkout vs remote package

Use these when developing this repo and you want pi to load **this checkout** instead of the GitHub package (or the reverse):

| Goal                                               | Command                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Use this repo (global `~/.pi/agent/settings.json`) | `npm run pi:package:local` or `scripts/pi-use-local-cursor-sdk.sh`   |
| Use GitHub package (remove local path)             | `npm run pi:package:remote` or `scripts/pi-use-remote-cursor-sdk.sh` |
| Project-local `.pi/settings.json`                  | Add `--project` / `-l` to either script                              |
| Both global and project settings                   | Add `--both`                                                         |

Remote source defaults to `https://github.com/akshat-OwO/pi-cursor-sdk`. Override with `PI_CURSOR_SDK_PACKAGE_REMOTE` or `--remote <source>`.

Maintainer docs: [docs/README.md](docs/README.md).

## License

MIT
