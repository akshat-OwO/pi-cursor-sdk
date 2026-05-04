# pi-cursor-sdk

pi provider extension backed by `@cursor/sdk` local agents.

## What this is

This package lets pi use Cursor models through the local Cursor SDK.

Current behavior:

- discovers Cursor models with `Cursor.models.list()` when `CURSOR_API_KEY` is set
- registers each model's default variant as a pi model
- encodes default Cursor params into the pi model ID
- maps Cursor reasoning/thinking params into pi thinking levels when possible
- creates a fresh local Cursor agent for each pi provider call

## Requirements

- Node.js
- pi
- a `CURSOR_API_KEY`

## Install

Clone the repo, then install deps:

```bash
npm install
```

## Run locally with pi

```bash
CURSOR_API_KEY=your-key pi -e .
```

Pick a model with `/model`, or pass one directly:

```bash
CURSOR_API_KEY=your-key pi -e . -p --model cursor/composer-2:fast=true "Say ok only."
```

## Model IDs

When `CURSOR_API_KEY` is set, models come from `Cursor.models.list()`.
Each registered pi model uses the Cursor base model ID plus the default variant params.

Examples:

- `cursor/composer-2:fast=true`
- `cursor/gpt-5.5:context=1m;fast=false;reasoning=medium`
- `cursor/claude-sonnet-4-6:context=1m;effort=medium;thinking=true`

Encoding rules:

- no params: `gemini-3.1-pro`
- with params: `gpt-5.4:context=1m;fast=false;reasoning=medium`
- params are sorted alphabetically
- params use `name=value` pairs joined by `;`

The extension decodes that ID back into a Cursor `ModelSelection` before calling `Agent.create()`.

## Fallback models

If `CURSOR_API_KEY` is missing or model discovery fails, the extension registers these fallbacks:

| Model ID | Name |
|---|---|
| `composer-2:fast=true` | Cursor Composer 2 |
| `gpt-5.5:context=1m;reasoning=medium;fast=false` | GPT-5.5 |
| `claude-sonnet-4-6:context=1m;effort=medium;thinking=true` | Sonnet 4.6 |
| `claude-opus-4-7:context=1m;effort=xhigh;thinking=true` | Opus 4.7 |

## Thinking support

If a Cursor model exposes `reasoning`, `thinking`, or `effort`, the extension sets `reasoning: true` for the pi model and builds a `thinkingLevelMap`.

Examples:

- `reasoning=extra-high` maps to pi `xhigh`
- `effort=max` maps to pi `xhigh`
- boolean `thinking=true|false` maps to pi on/off-style thinking

At request time, pi's selected thinking level overrides the encoded Cursor reasoning params sent to the SDK.

## Images

Images from the latest user message are forwarded to Cursor.
Historical images are kept out of the transcript.

## How it works

For each pi provider call, the extension:

1. builds a plain-text prompt from pi conversation state
2. creates a fresh local Cursor agent for the current working directory
3. streams text and thinking deltas back into pi
4. disposes the Cursor agent

pi remains the source of truth for conversation history.

## Limits

- local agents only; no Cursor cloud agent support
- Cursor tool calls are not exposed as pi tool calls
- pi tool schemas are not passed through to Cursor
- one fresh Cursor agent per provider call
- only the default Cursor variant is auto-registered
- historical images are not replayed to Cursor

## License

MIT.

## Development

Run checks:

```bash
npm test
npm run typecheck
```

## Notes

- `docs/cursor-model-ux-spec.md` is a forward-looking design spec, not a description of the exact current implementation.
- Unknown or invalid model params are passed through to Cursor and may be rejected by the Cursor SDK.
