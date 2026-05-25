# Source layout

The extension entry point is [`index.ts`](./index.ts). Everything else is grouped by responsibility:

| Directory                      | Responsibility                                                               |
| ------------------------------ | ---------------------------------------------------------------------------- |
| [`provider/`](./provider/)     | Cursor SDK streaming, live-run coordination, turn handling, usage accounting |
| [`bridge/`](./bridge/)         | Loopback MCP bridge exposing pi tools to local Cursor agents                 |
| [`replay/`](./replay/)         | Native tool replay, compact TUI display, edit diffs                          |
| [`transcript/`](./transcript/) | Tool transcript labels, formatters, and display specs                        |
| [`discovery/`](./discovery/)   | Model discovery, fallback snapshots, context-window cache                    |
| [`context/`](./context/)       | Prompt conversion and `context.tools` helpers                                |
| [`session/`](./session/)       | Session cwd, agent lifecycle, scope keys                                     |
| [`task/`](./task/)             | Task widget UI and turn progress                                             |
| [`settings/`](./settings/)     | Agent settings and `/cursor-settings` command                                |
| [`shared/`](./shared/)         | Cross-cutting utilities (env parsing, record helpers, secret scrubbing)      |

Import paths use `.js` extensions and are relative within and across these folders (for example `../shared/cursor-record-utils.js` from `provider/`).
