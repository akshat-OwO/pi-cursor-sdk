#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODULE_DIRS = {
	"model-discovery": "discovery/model-discovery",
	context: "context/context",
	"cursor-provider": "provider/cursor-provider",
	"cursor-agent-settings": "settings/cursor-agent-settings",
	"cursor-native-tool-display": "replay/cursor-native-tool-display",
	"cursor-pi-tool-bridge": "bridge/cursor-pi-tool-bridge",
	"cursor-question-tool": "bridge/cursor-question-tool",
	"cursor-session-cwd": "session/cursor-session-cwd",
	"cursor-session-agent": "session/cursor-session-agent",
	"cursor-edit-diff": "replay/cursor-edit-diff",
	"cursor-native-replay-routing": "replay/cursor-native-replay-routing",
	"cursor-native-replay-trace": "replay/cursor-native-replay-trace",
	"cursor-compact-tool-display": "replay/cursor-compact-tool-display",
	"cursor-compact-file-mutation-display": "replay/cursor-compact-file-mutation-display",
	"cursor-compact-diff-display": "replay/cursor-compact-diff-display",
	"cursor-sdk-output-filter": "shared/cursor-sdk-output-filter",
	"cursor-live-run-coordinator": "provider/cursor-live-run-coordinator",
	"cursor-live-run-accounting": "provider/cursor-live-run-accounting",
	"cursor-tool-transcript": "transcript/cursor-tool-transcript",
	"cursor-task-ui": "task/cursor-task-ui",
	"cursor-task-widget": "task/cursor-task-widget",
	"cursor-task-display": "task/cursor-task-display",
	"cursor-task-widget-registration": "task/cursor-task-widget-registration",
	"cursor-native-tool-display-replay": "replay/cursor-native-tool-display-replay",
	"cursor-pi-tool-bridge-snapshot": "bridge/cursor-pi-tool-bridge-snapshot",
};

function patch(content) {
	let out = content;
	for (const [base, dest] of Object.entries(MODULE_DIRS)) {
		out = out.replaceAll(`src/${base}.js`, `src/${dest}.js`);
		out = out.replaceAll(`src/${base}.ts`, `src/${dest}.ts`);
	}
	return out;
}

function walk(dir, acc = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path, acc);
		else if (entry.name.endsWith(".ts")) acc.push(path);
	}
	return acc;
}

for (const file of walk("test")) {
	const original = readFileSync(file, "utf8");
	const updated = patch(original);
	if (updated !== original) {
		writeFileSync(file, updated);
		console.log(`patched ${file}`);
	}
}
