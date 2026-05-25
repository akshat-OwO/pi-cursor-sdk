#!/usr/bin/env node
/**
 * Swap pi-cursor-sdk between a local checkout path and a remote pi package source
 * in ~/.pi/agent/settings.json (global) and/or .pi/settings.json (project).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "pi-cursor-sdk";
const DEFAULT_REMOTE =
	process.env.PI_CURSOR_SDK_PACKAGE_REMOTE ?? "https://github.com/akshat-OwO/pi-cursor-sdk";

/** GitHub org/repo identities for this package (remote installs). */
const REMOTE_REPO_SLUGS = ["akshat-OwO/pi-cursor-sdk", "fitchmultz/pi-cursor-sdk"];

const NPM_SOURCE_RE = /^npm:(@[^/]+\/)?pi-cursor-sdk(@|$|\b)/i;

function printHelp() {
	console.log(`Usage:
  node scripts/pi-cursor-sdk-package.mjs local [options]
  node scripts/pi-cursor-sdk-package.mjs remote [options]

Switch the pi-cursor-sdk package entry in pi settings between this repo checkout
and a remote install (GitHub URL by default).

Options:
  --global          Use ~/.pi/agent/settings.json (default)
  --project, -l     Use .pi/settings.json in the current working directory
  --both            Update global and project settings in one run
  --remote <source> Remote package source (default: ${DEFAULT_REMOTE})
  --dry-run         Print changes without writing
  -h, --help        Show this help

Environment:
  PI_CURSOR_SDK_PACKAGE_REMOTE   Override default remote source

Examples:
  npm run pi:package:local
  npm run pi:package:remote
  node scripts/pi-cursor-sdk-package.mjs local --project
  node scripts/pi-cursor-sdk-package.mjs local --both
`);
}

function parseArgs(argv) {
	if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
		return { command: null, options: { help: true } };
	}

	const command = argv[0];
	const options = {
		scope: "global",
		both: false,
		remote: DEFAULT_REMOTE,
		dryRun: false,
		help: false,
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
		} else if (arg === "--both") {
			options.both = true;
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

function resolveSettingsTargets(scope, both, cwd) {
	if (process.env.PI_SETTINGS_PATH) {
		const settingsPath = resolve(process.env.PI_SETTINGS_PATH);
		return [{ settingsPath, settingsDir: dirname(settingsPath), label: "override" }];
	}
	if (both) {
		const agentDir = join(homedir(), ".pi", "agent");
		const projectDir = join(cwd, ".pi");
		return [
			{ settingsPath: join(agentDir, "settings.json"), settingsDir: agentDir, label: "global" },
			{
				settingsPath: join(projectDir, "settings.json"),
				settingsDir: projectDir,
				label: "project",
			},
		];
	}
	if (scope === "project") {
		const dir = join(cwd, ".pi");
		return [{ settingsPath: join(dir, "settings.json"), settingsDir: dir, label: "project" }];
	}
	const dir = join(homedir(), ".pi", "agent");
	return [{ settingsPath: join(dir, "settings.json"), settingsDir: dir, label: "global" }];
}

function readSettings(settingsPath) {
	if (!existsSync(settingsPath)) {
		return { settings: {}, existed: false };
	}
	const raw = readFileSync(settingsPath, "utf8").trim();
	if (!raw) {
		return { settings: {}, existed: true };
	}
	try {
		const settings = JSON.parse(raw);
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
			throw new Error("settings root must be a JSON object");
		}
		return { settings, existed: true };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse ${settingsPath}: ${detail}`, { cause: error });
	}
}

function packageSource(entry) {
	if (typeof entry === "string") return entry;
	if (entry && typeof entry === "object" && typeof entry.source === "string") {
		return entry.source;
	}
	return null;
}

function normalizeGitSlug(source) {
	const match = source.match(
		/(?:^git:|^https?:\/\/|^ssh:\/\/(?:git@)?)(?:github\.com[/:]|github\.com\/)([^?\s#]+)/i,
	);
	if (!match) return null;
	return match[1].replace(/\.git$/i, "").replace(/\/+$/, "");
}

function isRemotePiCursorSdkSource(source) {
	if (NPM_SOURCE_RE.test(source)) return true;
	const slug = normalizeGitSlug(source);
	if (slug && REMOTE_REPO_SLUGS.includes(slug)) return true;
	if (/^git:(?:github\.com\/)?(?:akshat-OwO|fitchmultz)\/pi-cursor-sdk(?:@|$|\/)/i.test(source)) {
		return true;
	}
	return false;
}

function isLocalPiCursorSdkSource(source, repoRoot, settingsDir) {
	if (!source.startsWith("/") && !source.startsWith(".")) return false;
	const resolved = resolve(settingsDir, source);
	return resolve(resolved) === resolve(repoRoot);
}

function isPiCursorSdkPackage(entry, repoRoot, settingsDir) {
	const source = packageSource(entry);
	if (!source) return false;
	return (
		isRemotePiCursorSdkSource(source) || isLocalPiCursorSdkSource(source, repoRoot, settingsDir)
	);
}

function localPackageSource(repoRoot, settingsDir, scope) {
	if (scope === "project") {
		const rel = relative(settingsDir, repoRoot);
		return rel || ".";
	}
	return repoRoot;
}

function buildPackageEntry(previousEntry, source) {
	if (previousEntry && typeof previousEntry === "object" && !Array.isArray(previousEntry)) {
		return { ...previousEntry, source };
	}
	return source;
}

function applyMode(packages, mode, repoRoot, settingsDir, scope, remote) {
	const kept = packages.filter((entry) => !isPiCursorSdkPackage(entry, repoRoot, settingsDir));
	const removed = packages.filter((entry) => isPiCursorSdkPackage(entry, repoRoot, settingsDir));
	const previous = removed[removed.length - 1];

	let source;
	if (mode === "local") {
		source = localPackageSource(repoRoot, settingsDir, scope);
	} else if (mode === "remote") {
		source = remote;
	} else {
		throw new Error(`Unknown mode: ${mode}`);
	}

	const added = buildPackageEntry(previous, source);
	return {
		packages: [...kept, added],
		added: packageSource(added) ?? source,
		removed: removed.map((entry) => packageSource(entry) ?? entry),
	};
}

function writeSettings(settingsPath, settings) {
	mkdirSync(dirname(settingsPath), { recursive: true });
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

function applyToTarget(target, command, options, cwd) {
	const scopeForPath = target.label === "project" ? "project" : "global";
	const { settings, existed } = readSettings(target.settingsPath);
	const packages = Array.isArray(settings.packages) ? [...settings.packages] : [];
	const result = applyMode(
		packages,
		command,
		REPO_ROOT,
		target.settingsDir,
		scopeForPath,
		options.remote,
	);

	console.log(`Settings (${target.label}): ${target.settingsPath}`);
	if (result.removed.length > 0) {
		console.log(`  Remove: ${result.removed.join(", ")}`);
	} else {
		console.log("  Remove: (no existing pi-cursor-sdk entry)");
	}
	console.log(`  Add: ${result.added}`);

	if (options.dryRun) return;

	settings.packages = result.packages;
	writeSettings(target.settingsPath, settings);
	console.log(existed ? "  Updated." : "  Created.");
}

function main() {
	const { command, options } = parseArgs(process.argv.slice(2));
	if (options.help || !command) {
		printHelp();
		process.exit(command ? 0 : 0);
	}
	if (command !== "local" && command !== "remote") {
		console.error(`Unknown command: ${command}`);
		printHelp();
		process.exit(1);
	}

	const cwd = process.cwd();
	const targets = resolveSettingsTargets(options.scope, options.both, cwd);
	console.log(`Scope: ${options.both ? "global + project" : targets[0].label}`);

	for (const target of targets) {
		applyToTarget(target, command, options, cwd);
	}

	if (options.dryRun) {
		console.log("Dry run — no files written.");
	} else {
		console.log("Restart pi (or open a new session) to load the change.");
	}
}

export const __testUtils = {
	DEFAULT_REMOTE,
	REPO_ROOT,
	REMOTE_REPO_SLUGS,
	applyMode,
	buildPackageEntry,
	isPiCursorSdkPackage,
	isRemotePiCursorSdkSource,
	isLocalPiCursorSdkSource,
	localPackageSource,
	normalizeGitSlug,
	packageSource,
};

const isMain =
	typeof process.argv[1] === "string" &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
