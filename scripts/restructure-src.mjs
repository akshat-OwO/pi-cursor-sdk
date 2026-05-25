#!/usr/bin/env node
/**
 * One-shot src/ modularization: moves flat modules into domain folders and
 * rewrites relative imports in src/ and test/.
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function assertNotAlreadyRestructured() {
	if (existsSync(join(ROOT, "src", "discovery", "model-discovery.ts"))) {
		throw new Error("src/ is already modular; restructure-src.mjs must not run again.");
	}
}

/** @type {Record<string, string>} basename (no ext) -> path under src/ without .ts */
const MODULE_DIRS = {
	// discovery
	"model-discovery": "discovery/model-discovery",
	"cursor-fallback-models.generated": "discovery/cursor-fallback-models.generated",
	"bundled-context-windows": "discovery/bundled-context-windows",
	"context-window-cache": "discovery/context-window-cache",
	// context
	context: "context/context",
	"cursor-context-tools": "context/cursor-context-tools",
	// provider
	"cursor-provider": "provider/cursor-provider",
	"cursor-provider-live-run-drain": "provider/cursor-provider-live-run-drain",
	"cursor-provider-turn-coordinator": "provider/cursor-provider-turn-coordinator",
	"cursor-live-run-coordinator": "provider/cursor-live-run-coordinator",
	"cursor-live-run-accounting": "provider/cursor-live-run-accounting",
	"cursor-usage-accounting": "provider/cursor-usage-accounting",
	"cursor-partial-content-emitter": "provider/cursor-partial-content-emitter",
	"cursor-mcp-timeout-override": "provider/cursor-mcp-timeout-override",
	// bridge
	"cursor-pi-tool-bridge": "bridge/cursor-pi-tool-bridge",
	"cursor-pi-tool-bridge-types": "bridge/cursor-pi-tool-bridge-types",
	"cursor-bridge-contract": "bridge/cursor-bridge-contract",
	"cursor-pi-tool-bridge-snapshot": "bridge/cursor-pi-tool-bridge-snapshot",
	"cursor-pi-tool-bridge-server": "bridge/cursor-pi-tool-bridge-server",
	"cursor-pi-tool-bridge-run": "bridge/cursor-pi-tool-bridge-run",
	"cursor-pi-tool-bridge-abort": "bridge/cursor-pi-tool-bridge-abort",
	"cursor-pi-tool-bridge-diagnostics": "bridge/cursor-pi-tool-bridge-diagnostics",
	"cursor-pi-tool-bridge-mcp": "bridge/cursor-pi-tool-bridge-mcp",
	"cursor-question-tool": "bridge/cursor-question-tool",
	// replay
	"cursor-native-replay-routing": "replay/cursor-native-replay-routing",
	"cursor-native-replay-trace": "replay/cursor-native-replay-trace",
	"cursor-edit-diff": "replay/cursor-edit-diff",
	"cursor-native-tool-display": "replay/cursor-native-tool-display",
	"cursor-native-tool-display-registration": "replay/cursor-native-tool-display-registration",
	"cursor-native-tool-display-state": "replay/cursor-native-tool-display-state",
	"cursor-native-tool-display-tools": "replay/cursor-native-tool-display-tools",
	"cursor-native-tool-display-replay": "replay/cursor-native-tool-display-replay",
	"cursor-compact-tool-display": "replay/cursor-compact-tool-display",
	"cursor-compact-diff-display": "replay/cursor-compact-diff-display",
	"cursor-compact-file-mutation-display": "replay/cursor-compact-file-mutation-display",
	// transcript
	"cursor-tool-transcript": "transcript/cursor-tool-transcript",
	"cursor-transcript-utils": "transcript/cursor-transcript-utils",
	"cursor-transcript-tool-formatters": "transcript/cursor-transcript-tool-formatters",
	"cursor-transcript-tool-specs": "transcript/cursor-transcript-tool-specs",
	"cursor-tool-names": "transcript/cursor-tool-names",
	// session
	"cursor-session-cwd": "session/cursor-session-cwd",
	"cursor-session-agent": "session/cursor-session-agent",
	"cursor-session-scope": "session/cursor-session-scope",
	// task
	"cursor-task-widget": "task/cursor-task-widget",
	"cursor-task-widget-registration": "task/cursor-task-widget-registration",
	"cursor-task-ui": "task/cursor-task-ui",
	"cursor-task-display": "task/cursor-task-display",
	// settings
	"cursor-agent-settings": "settings/cursor-agent-settings",
	"cursor-settings-command": "settings/cursor-settings-command",
	// shared
	"cursor-env-boolean": "shared/cursor-env-boolean",
	"cursor-record-utils": "shared/cursor-record-utils",
	"cursor-sensitive-text": "shared/cursor-sensitive-text",
	"cursor-display-text": "shared/cursor-display-text",
	"cursor-sdk-output-filter": "shared/cursor-sdk-output-filter",
};

function modulePathForImport(specifier) {
	const match = specifier.match(/^(?:\.\.\/)+src\/(.+)\.js$/);
	if (!match) return null;
	const base = match[1].split("/").pop();
	return MODULE_DIRS[base] ?? match[1];
}

function relativeImport(fromDir, targetModulePath) {
	const from = join(ROOT, "src", fromDir);
	const to = join(ROOT, "src", `${targetModulePath}.ts`);
	let rel = relative(from, to).replace(/\\/g, "/");
	if (!rel.startsWith(".")) rel = `./${rel}`;
	return rel.replace(/\.ts$/, ".js");
}

function rewriteSrcImports(content, fromDir) {
	return content.replace(/from ["'](\.\/[^"']+\.js)["']/g, (_full, spec) => {
		const base = spec.replace(/^\.\//, "").replace(/\.js$/, "");
		const target = MODULE_DIRS[base];
		if (!target) return _full;
		const rel = relativeImport(fromDir, target);
		return `from "${rel}"`;
	});
}

function rewriteTestImports(content, filePath) {
	return content.replace(
		/from ["']((?:\.\.\/)+)src\/([^"']+\.js)["']/g,
		(_full, prefix, specPath) => {
			const base = specPath.replace(/\.js$/, "").split("/").pop();
			const target = MODULE_DIRS[base];
			if (!target) return _full;
			return `from "${prefix}src/${target}.js"`;
		},
	);
}

function collectTsFiles(dir, acc = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) collectTsFiles(full, acc);
		else if (entry.name.endsWith(".ts")) acc.push(full);
	}
	return acc;
}

function moveModules() {
	for (const [base, dest] of Object.entries(MODULE_DIRS)) {
		const srcFile = join(ROOT, "src", `${base}.ts`);
		const destFile = join(ROOT, "src", `${dest}.ts`);
		mkdirSync(dirname(destFile), { recursive: true });
		renameSync(srcFile, destFile);
		console.log(`moved ${base}.ts -> ${dest}.ts`);
	}
}

function rewriteAll() {
	const srcFiles = collectTsFiles(join(ROOT, "src"));
	for (const file of srcFiles) {
		const relDir = relative(join(ROOT, "src"), dirname(file));
		const dir = relDir === "" ? "" : relDir;
		const original = readFileSync(file, "utf8");
		const updated = rewriteSrcImports(original, dir);
		if (updated !== original) writeFileSync(file, updated);
	}

	const testFiles = collectTsFiles(join(ROOT, "test"));
	for (const file of testFiles) {
		const original = readFileSync(file, "utf8");
		const updated = rewriteTestImports(original, file);
		if (updated !== original) writeFileSync(file, updated);
	}

	const scriptsPath = join(ROOT, "scripts", "refresh-cursor-model-snapshots.mjs");
	let scriptsContent = readFileSync(scriptsPath, "utf8");
	scriptsContent = scriptsContent
		.replaceAll(
			"src/cursor-fallback-models.generated.ts",
			"src/discovery/cursor-fallback-models.generated.ts",
		)
		.replaceAll("src/bundled-context-windows.ts", "src/discovery/bundled-context-windows.ts");
	writeFileSync(scriptsPath, scriptsContent);
}

moveModules();
rewriteAll();
console.log("restructure complete");
