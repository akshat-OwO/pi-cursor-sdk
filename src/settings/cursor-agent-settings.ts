import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const CURSOR_COMPACT_TOOL_DISPLAY_SETTING = "cursorCompactToolDisplay";

type CursorAgentSettingsFile = {
	cursorCompactToolDisplay?: boolean;
};

let cachedSettings: { key: string; value: CursorAgentSettingsFile } | undefined;

function readSettingsFile(path: string): CursorAgentSettingsFile | undefined {
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as CursorAgentSettingsFile;
	} catch {
		return undefined;
	}
}

function mergeSettings(
	base: CursorAgentSettingsFile,
	overlay: CursorAgentSettingsFile | undefined,
): CursorAgentSettingsFile {
	if (!overlay) return base;
	return { ...base, ...overlay };
}

export function readCursorAgentSettings(
	cwd: string = process.cwd(),
	agentDir: string = getAgentDir(),
): CursorAgentSettingsFile {
	const cacheKey = `${agentDir}\0${cwd}`;
	if (cachedSettings?.key === cacheKey) return cachedSettings.value;

	let merged: CursorAgentSettingsFile = {};
	merged = mergeSettings(merged, readSettingsFile(join(agentDir, "settings.json")));
	merged = mergeSettings(merged, readSettingsFile(join(cwd, ".pi", "settings.json")));
	cachedSettings = { key: cacheKey, value: merged };
	return merged;
}

export function getCursorCompactToolDisplaySetting(
	cwd: string = process.cwd(),
	agentDir: string = getAgentDir(),
): boolean {
	return readCursorAgentSettings(cwd, agentDir).cursorCompactToolDisplay === true;
}

export function setCursorCompactToolDisplaySetting(
	enabled: boolean,
	cwd: string = process.cwd(),
	agentDir: string = getAgentDir(),
): void {
	const path = join(agentDir, "settings.json");
	const current = readSettingsFile(path) ?? {};
	const next = {
		...current,
		[CURSOR_COMPACT_TOOL_DISPLAY_SETTING]: enabled,
	};
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
	invalidateCursorAgentSettingsCache();
	readCursorAgentSettings(cwd, agentDir);
}

export function invalidateCursorAgentSettingsCache(): void {
	cachedSettings = undefined;
}

export const __cursorAgentSettingsTestUtils = {
	reset(): void {
		cachedSettings = undefined;
	},
};
