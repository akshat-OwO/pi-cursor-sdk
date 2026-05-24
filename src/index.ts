import type { ExtensionAPI, ExtensionContext, ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { discoverModels, loadCachedCursorModels, type CursorModelFallbackIssue } from "./model-discovery.js";
import { registerCursorNativeToolDisplay } from "./cursor-native-tool-display.js";
import { registerCursorPiToolBridge } from "./cursor-pi-tool-bridge.js";
import { registerCursorQuestionTool } from "./cursor-question-tool.js";
import { registerCursorSessionCwd } from "./cursor-session-cwd.js";
import { registerCursorSessionAgent } from "./cursor-session-agent.js";
import { registerCursorTaskWidget } from "./cursor-task-widget-registration.js";
import { registerCursorSettingsCommand } from "./cursor-settings-command.js";
import { streamCursor } from "./cursor-provider.js";

type CursorExtensionApi =
	& Pick<ExtensionAPI, "registerProvider">
	& {
		registerCommand(name: string, options: {
			description?: string;
			handler: (args: string, ctx: Pick<ExtensionContext, "hasUI"> & { ui: Pick<ExtensionContext["ui"], "notify"> }) => Promise<void> | void;
		}): void;
	}
	& Parameters<typeof registerCursorSessionCwd>[0]
	& Parameters<typeof registerCursorSessionAgent>[0]
	& Parameters<typeof registerCursorNativeToolDisplay>[0]
	& Parameters<typeof registerCursorQuestionTool>[0]
	& Parameters<typeof registerCursorTaskWidget>[0]
	& Parameters<typeof registerCursorPiToolBridge>[0]
	& Parameters<typeof registerCursorSettingsCommand>[0];

function createCursorProviderConfig(models: ProviderModelConfig[]): ProviderConfig {
	return {
		name: "Cursor",
		baseUrl: "https://cursor.com",
		apiKey: "CURSOR_API_KEY",
		api: "cursor-sdk",
		models,
		streamSimple: streamCursor,
	};
}

function isStaleExtensionContextError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("extension ctx is stale");
}

function registerCursorProvider(pi: Pick<ExtensionAPI, "registerProvider">, models: ProviderModelConfig[]): void {
	pi.registerProvider("cursor", createCursorProviderConfig(models));
}

function registerCursorProviderSafely(pi: Pick<ExtensionAPI, "registerProvider">, models: ProviderModelConfig[]): boolean {
	try {
		registerCursorProvider(pi, models);
		return true;
	} catch (error) {
		if (isStaleExtensionContextError(error)) return false;
		throw error;
	}
}

function scheduleBackgroundModelRefresh(
	pi: Pick<ExtensionAPI, "registerProvider" | "on">,
): void {
	let cancelled = false;
	pi.on("session_shutdown", () => {
		cancelled = true;
	});
	let usedFallback = false;
	void discoverModels({
		onFallback: () => {
			usedFallback = true;
		},
	}).then((refreshedModels) => {
		if (usedFallback || cancelled) return;
		registerCursorProviderSafely(pi, refreshedModels);
	});
}

export default async function (pi: CursorExtensionApi) {
	// Session cwd must register before other session_start listeners that depend on it.
	registerCursorSessionCwd(pi);
	registerCursorSessionAgent(pi);
	registerCursorNativeToolDisplay(pi);
	registerCursorQuestionTool(pi);
	registerCursorTaskWidget(pi);
	registerCursorPiToolBridge(pi);
	registerCursorSettingsCommand(pi);
	let fallbackIssue: CursorModelFallbackIssue | undefined;
	const cachedModels = loadCachedCursorModels();
	const models = cachedModels ?? await discoverModels({
		onFallback: (issue) => {
			fallbackIssue = issue;
		},
	});

	if (fallbackIssue) {
		const issue = fallbackIssue;
		pi.on("session_start", async (_event, ctx) => {
			if (ctx.hasUI) ctx.ui.notify(issue.message, "warning");
		});
	}

	if (cachedModels) {
		scheduleBackgroundModelRefresh(pi);
	}

	pi.registerCommand("cursor-refresh-models", {
		description: "Refresh the live Cursor model catalog without restarting pi",
		handler: async (_args, ctx) => {
			let refreshFallbackIssue: CursorModelFallbackIssue | undefined;
			const refreshedModels = await discoverModels({
				onFallback: (issue) => {
					refreshFallbackIssue = issue;
				},
			});
			if (!registerCursorProviderSafely(pi, refreshedModels)) return;
			if (!ctx.hasUI) return;
			if (refreshFallbackIssue) {
				ctx.ui.notify(`Cursor model catalog refresh still using fallback models: ${refreshFallbackIssue.message}`, "warning");
			} else {
				ctx.ui.notify(`Cursor model catalog refreshed with ${refreshedModels.length} model${refreshedModels.length === 1 ? "" : "s"}.`, "info");
			}
		},
	});

	registerCursorProvider(pi, models);
}
