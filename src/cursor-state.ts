import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { getCursorModelMetadata } from "./model-discovery.js";

const CURSOR_PROVIDER = "cursor";
const FAST_ENTRY_TYPE = "cursor-fast-state";
const GLOBAL_CONFIG_FILE = "cursor-sdk.json";

interface CursorFastEntryData {
	baseModelId: string;
	fast: boolean;
}

interface CursorGlobalConfig {
	fastDefaults?: Record<string, boolean>;
}

const sessionFastPreferences = new Map<string, boolean>();
let globalFastPreferences = new Map<string, boolean>();
let cliForceFast = false;

function isCursorFastEntryData(value: unknown): value is CursorFastEntryData {
	if (!value || typeof value !== "object") return false;
	const data = value as Record<string, unknown>;
	return typeof data.baseModelId === "string" && typeof data.fast === "boolean";
}

function getConfigPath(): string {
	return join(getAgentDir(), GLOBAL_CONFIG_FILE);
}

function loadGlobalFastPreferences(): Map<string, boolean> {
	const path = getConfigPath();
	if (!existsSync(path)) return new Map();
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as CursorGlobalConfig;
		return new Map(
			Object.entries(parsed.fastDefaults ?? {}).filter(
				(entry): entry is [string, boolean] => typeof entry[1] === "boolean",
			),
		);
	} catch {
		return new Map();
	}
}

function saveGlobalFastPreferences(): void {
	const path = getConfigPath();
	mkdirSync(dirname(path), { recursive: true });
	const config: CursorGlobalConfig = {
		fastDefaults: Object.fromEntries([...globalFastPreferences.entries()].sort(([a], [b]) => a.localeCompare(b))),
	};
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function restoreSessionFastPreferences(ctx: ExtensionContext): void {
	sessionFastPreferences.clear();
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "custom" || entry.customType !== FAST_ENTRY_TYPE) continue;
		if (isCursorFastEntryData(entry.data)) {
			sessionFastPreferences.set(entry.data.baseModelId, entry.data.fast);
		}
	}
}

function getEffectiveFast(baseModelId: string, modelId: string): boolean | undefined {
	const metadata = getCursorModelMetadata(modelId);
	if (!metadata?.supportsFast) return undefined;
	if (cliForceFast) return true;
	return sessionFastPreferences.get(baseModelId) ?? globalFastPreferences.get(baseModelId) ?? metadata.defaultFast;
}

function updateCursorStatus(ctx: ExtensionContext, model = ctx.model): void {
	if (model?.provider !== CURSOR_PROVIDER) {
		ctx.ui.setStatus("cursor", undefined);
		return;
	}
	const metadata = getCursorModelMetadata(model.id);
	if (!metadata) {
		ctx.ui.setStatus("cursor", undefined);
		return;
	}
	const fast = getEffectiveFast(metadata.baseModelId, model.id);
	ctx.ui.setStatus("cursor", fast ? "cursor fast" : undefined);
}

function getCurrentCursorMetadata(ctx: ExtensionContext) {
	const model = ctx.model;
	if (model?.provider !== CURSOR_PROVIDER) return undefined;
	return getCursorModelMetadata(model.id);
}

function persistFastPreference(pi: ExtensionAPI, baseModelId: string, fast: boolean): void {
	sessionFastPreferences.set(baseModelId, fast);
	globalFastPreferences.set(baseModelId, fast);
	pi.appendEntry<CursorFastEntryData>(FAST_ENTRY_TYPE, { baseModelId, fast });
	saveGlobalFastPreferences();
}

export function getEffectiveFastForModelId(modelId: string): boolean | undefined {
	const metadata = getCursorModelMetadata(modelId);
	if (!metadata) return undefined;
	return getEffectiveFast(metadata.baseModelId, modelId);
}

export function registerCursorFastControls(pi: ExtensionAPI): void {
	pi.registerFlag("cursor-fast", {
		description: "Force Cursor fast mode for this run when the selected Cursor model supports it",
		type: "boolean",
		default: false,
	});

	pi.registerCommand("cursor-fast", {
		description: "Toggle Cursor fast mode for the selected Cursor model",
		handler: async (_args, ctx) => {
			const metadata = getCurrentCursorMetadata(ctx);
			if (!metadata?.supportsFast || !ctx.model) {
				const modelName = ctx.model?.id ?? "current model";
				ctx.ui.notify(`Fast mode not supported by ${modelName}`, "info");
				return;
			}
			if (cliForceFast) {
				ctx.ui.notify("Cursor fast is forced by --cursor-fast", "info");
				return;
			}

			const current = getEffectiveFast(metadata.baseModelId, metadata.piModelId) ?? false;
			const next = !current;
			persistFastPreference(pi, metadata.baseModelId, next);
			updateCursorStatus(ctx);
			ctx.ui.notify(`Cursor fast ${next ? "enabled" : "disabled"}`, "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		globalFastPreferences = loadGlobalFastPreferences();
		cliForceFast = pi.getFlag("cursor-fast") === true;
		restoreSessionFastPreferences(ctx);
		updateCursorStatus(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		updateCursorStatus(ctx, event.model);
	});
}

export const __testUtils = {
	FAST_ENTRY_TYPE,
	getConfigPath,
	loadGlobalFastPreferences,
	sessionFastPreferences,
};
