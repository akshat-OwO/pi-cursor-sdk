# VS Code + Oxc

Install the [Oxc extension](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode) (`oxc.oxc-vscode`). VS Code will prompt via [extensions.json](./extensions.json) when you open this folder.

Workspace [settings.json](./settings.json) configures:

- **Oxlint** — [`.oxlintrc.json`](../.oxlintrc.json), TypeScript project via `tsconfig.json`
- **Oxfmt** — [`.oxfmtrc.json`](../.oxfmtrc.json) as the default formatter for JS/TS (tabs, 100 columns)

Tasks (Terminal → Run Task): `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`.

CLI equivalents: `npm run lint`, `npm run format`.
