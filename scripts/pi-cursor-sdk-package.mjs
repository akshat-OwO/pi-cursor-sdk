#!/usr/bin/env node
/**
 * Swap pi-cursor-sdk between a local checkout path and a remote pi package source
 * in ~/.pi/agent/settings.json (global) or .pi/settings.json (project).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "pi-cursor-sdk";
const DEFAULT_REMOTE =
	process.env.PI_CURSOR_SDK_PACKAGE_REMOTE ?? "https://github.com/akshat-OwO/pi-cursor-sdk";

const REMOTE_PATTERNS = [
	/^npm:(@[^/]+\/)?pi-cursor-sdk(@|$)/i,
	/^git:.*pi-cursor-sdk/i,
	/^https?:\/\/.*pi-cursor-sdk/i,
	/^ssh:\/\/.*pi-cursor-sdk/i,
];

function printHelp() {
	console.log(`Usage:
  node scripts/pi-cursor-sdk-package.mjs local [options]
  node scripts/pi-cursor-sdk-package.mjs remote [options]

Switch the pi-cursor-sdk package entry in pi settings between this repo checkout
and a remote install (GitHub URL by default).

Options:
  --global          Use ~/.pi/agent/settings.json (default)
  --project, -l     Use .pi/settings.json in the current working directory
  --remote <source> Remote package source (default: ${DEFAULT_REMOTE})
  --dry-run         Print changes without writing
  -h, --help        Show this help

Environment:
  PI_CURSOR_SDK_PACKAGE_REMOTE   Override default remote source

Examples:
  npm run pi:package:local
  npm run pi:package:remote
  node scripts/pi-cursor-sdk-package.mjs local --project
`);
}

function parseArgs(argv) {
	const command = argv[0];
	const options = {
		scope: "global",
		remote: DEFAULT_REMOTE,
		dryRun: false,
	};
	const rest = [];
	for (let i = 1; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--global") {
			options.scope = "global";
		} else if (arg === "--project" || arg === "-l") {
			options.scope = "project";
		} else if (arg === "--dry-run") {
			options.dryRun = true;
		} else if (arg === "--remote") {
			const value = argv[++i];
			if (!value) throw new Error("--remote requires a value");
			options.remote = value;
		} else {
			rest.push(arg);
		}
	}
	if (rest.length > 0) {
		throw new Error(`Unknown arguments: ${rest.join(" ")}`);
	}
	return { command, options };
}

function resolveSettingsPath(scope, cwd) {
	if (process.env.PI_SETTINGS_PATH) {
		const settingsPath = resolve(process.env.PI_SETTINGS_PATH);
		return { settingsPath, settingsDir: dirname(settingsPath) };
	}
	if (scope === "project") {
		const dir = join(cwd, ".pi");
		return { settingsPath: join(dir, "settings.json"), settingsDir: dir };
	}
	const dir = join(homedir(), ".pi", "agent");
	return { settingsPath: join(dir, "settings.json"), settingsDir: dir };
}

function readSettings(settingsPath) {
	if (!existsSync(settingsPath)) {
		return { settings: {}, existed: false };
	}
	const raw = readFileSync(settingsPath, "utf8").trim();
	if (!raw) {
		return { settings: {}, existed: true };
	}
	return { settings: JSON.parse(raw), existed: true };
}

function packageSource(entry) {
	if (typeof entry === "string") return entry;
	if (entry && typeof entry === "object" && typeof entry.source === "string") {
		return entry.source;
	}
	return null;
}

function isRemotePiCursorSdkSource(source) {
	return REMOTE_PATTERNS.some((pattern) => pattern.test(source));
}

function isLocalPiCursorSdkSource(source, repoRoot, settingsDir) {
	if (!source.startsWith("/") && !source.startsWith(".")) return false;
	const resolved = resolve(settingsDir, source);
	return resolve(resolved) === resolve(repoRoot);
}

function isPiCursorSdkPackage(entry, repoRoot, settingsDir) {
	const source = packageSource(entry);
	if (!source) return false;
	return isRemotePiCursorSdkSource(source) || isLocalPiCursorSdkSource(source, repoRoot, settingsDir);
}

function localPackageSource(repoRoot, settingsDir, scope) {
	if (scope === "project") {
		const rel = relative(settingsDir, repoRoot);
		return rel || ".";
	}
	return repoRoot;
}

function formatEntry(source) {
	return source;
}

function applyMode(packages, mode, repoRoot, settingsDir, scope, remote) {
	const kept = packages.filter((entry) => !isPiCursorSdkPackage(entry, repoRoot, settingsDir));
	const removed = packages.filter((entry) => isPiCursorSdkPackage(entry, repoRoot, settingsDir));

	let added;
	if (mode === "local") {
		added = formatEntry(localPackageSource(repoRoot, settingsDir, scope));
	} else if (mode === "remote") {
		added = formatEntry(remote);
	} else {
		throw new Error(`Unknown mode: ${mode}`);
	}

	return {
		packages: [...kept, added],
		added,
		removed: removed.map((entry) => packageSource(entry) ?? entry),
	};
}

function writeSettings(settingsPath, settings) {
	mkdirSync(dirname(settingsPath), { recursive: true });
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

function main() {
	const { command, options } = parseArgs(process.argv.slice(2));
	if (options.help || !command || command === "help") {
		printHelp();
		process.exit(command ? 0 : 1);
	}
	if (command !== "local" && command !== "remote") {
		console.error(`Unknown command: ${command}`);
		printHelp();
		process.exit(1);
	}

	const cwd = process.cwd();
	const { settingsPath, settingsDir } = resolveSettingsPath(options.scope, cwd);
	const { settings, existed } = readSettings(settingsPath);
	const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];

	const result = applyMode(packages, command, REPO_ROOT, settingsDir, options.scope, options.remote);

	console.log(`Settings: ${settingsPath}`);
	console.log(`Scope: ${options.scope}`);
	if (result.removed.length > 0) {
		console.log(`Remove: ${result.removed.join(", ")}`);
	} else {
		console.log("Remove: (no existing pi-cursor-sdk entry)");
	}
	console.log(`Add: ${result.added}`);

	if (options.dryRun) {
		console.log("Dry run — no files written.");
		return;
	}

	settings.packages = result.packages;
	writeSettings(settingsPath, settings);
	console.log(existed ? "Updated settings." : "Created settings.");
	console.log("Restart pi (or open a new session) to load the change.");
}

export const __testUtils = {
	DEFAULT_REMOTE,
	REPO_ROOT,
	applyMode,
	isPiCursorSdkPackage,
	isRemotePiCursorSdkSource,
	isLocalPiCursorSdkSource,
	localPackageSource,
	packageSource,
};

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
