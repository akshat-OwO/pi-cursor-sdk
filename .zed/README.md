# Zed + Oxc

Install the **Oxc** extension in Zed (`zed: extensions`, search for “Oxc”). Requires Zed >= v0.205.0.

This repo’s [`.zed/settings.json`](./settings.json) wires:

- **Oxlint** — diagnostics from [`.oxlintrc.json`](../.oxlintrc.json) (`onType`, safe fixes)
- **Oxfmt** — format on save from [`.oxfmtrc.json`](../.oxfmtrc.json) for JavaScript, TypeScript, TSX, and JSONC

CLI equivalents: `npm run lint`, `npm run format`.
