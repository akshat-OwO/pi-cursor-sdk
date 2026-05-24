# Cursor native tool replay

Two pi-facing paths plus Cursor's own local-agent surface:

| Surface | Callable? | Pi shows | Behavior |
| --- | --- | --- | --- |
| **Pi MCP bridge** | Cursor calls `pi__*` MCP names | Real pi tool names | Normal pi tool execution |
| **Native replay** | No — display only | Native-looking cards | Recorded Cursor SDK results |
| **Cursor-native** | Cursor SDK tools/settings/MCP | Replay cards or transcripts when reported | Owned by Cursor SDK |

Bridge MCP names are not pi tool names. Cursor must call `pi__sem_reindex`; pi history shows `sem_reindex`.

Bridge and env controls: **[options.md](options.md)**.

## What gets replayed

Completed Cursor SDK activity can display as:

- `read`, `bash`, `grep`, `find`, `ls`, `edit`, `write`
- diagnostics, delete, todos/plans, tasks, image generation, MCP activity

Cursor `glob` → native `find` cards. Edit/write replay only when recorded args satisfy pi schemas; otherwise neutral Cursor activity cards.

Replay never re-runs commands, applies edits, calls MCP, or mutates pi state. Workflow tools (`SwitchMode`, Cursor todos) are display-only—not pi workflow controls.

## Ordering

The provider mirrors Codex turn shape: assistant `toolUse` → pi `toolResult`s → live post-tool Cursor text/thinking → further tool batches → final answer.

Non-interactive runs (`pi -p`) use bounded scrubbed transcripts instead of native cards.

## Compact display

Off by default. Enable via `/cursor-settings`, `cursorCompactToolDisplay` in settings, or `PI_CURSOR_COMPACT_TOOL_DISPLAY=1`. Applies only to Cursor SDK sessions.

When enabled, supported tools render as one-line OpenCode-style rows (`→ Read …`, `✱ Grep …`, `$ command`, `← Edit …`) with expand-to-view output.

**Do not** run the global `compact-tool-display` pi extension alongside this with compact display enabled for Cursor models—both register the same tool names and the last registration wins.

## Opt out

```bash
PI_CURSOR_NATIVE_TOOL_DISPLAY=0 pi --model cursor/composer-2.5
```

`PI_CURSOR_REGISTER_NATIVE_TOOLS=0` is a registration-only opt-out.

Full env reference: [options.md](options.md).

## Conflicts

When `PI_CURSOR_NATIVE_TOOL_DISPLAY=1` (default in TTY), pi-cursor-sdk registers replay wrappers for core tool names even if another extension provides them. For compact display on Cursor models, disable `~/.pi/agent/extensions/compact-tool-display/` and use pi-cursor-sdk's built-in compact display instead.
