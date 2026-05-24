import { Cursor } from "@cursor/sdk";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { invalidateSessionAgent } from "./cursor-session-agent.js";
import {
	createCursorCloudSelection,
	formatRepositoryDisplayPath,
	getCursorCloudSelection,
	setCursorCloudSelection,
} from "./cursor-cloud-runtime.js";
import { syncCursorCloudFooter } from "./cursor-cloud-footer.js";
import { getCursorApiKey } from "./model-discovery.js";
import { scrubSensitiveText } from "./cursor-sensitive-text.js";

const LOCAL_WORKSPACE_LABEL = "Local workspace (current directory)";

type CursorCloudExtensionApi = Pick<ExtensionAPI, "registerCommand" | "on">;

function isCursorModel(model: ExtensionCommandContext["model"]): boolean {
	return model?.provider === "cursor" || model?.api === "cursor-sdk";
}

function formatRepositoryOption(url: string): string {
	return formatRepositoryDisplayPath(url);
}

async function listRepositoryOptions(apiKey: string): Promise<string[]> {
	const repositories = await Cursor.repositories.list({ apiKey });
	return repositories.map((repository) => repository.url.trim()).filter(Boolean);
}

export function registerCursorCloudCommand(pi: CursorCloudExtensionApi): void {
	pi.registerCommand("cursor-cloud", {
		description: "Switch Cursor SDK runs to a connected cloud repository",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			if (!isCursorModel(ctx.model)) {
				if (ctx.hasUI) {
					ctx.ui.notify("Select a Cursor model before switching to cloud runtime.", "warning");
				}
				return;
			}

			const apiKey = await getCursorApiKey();
			if (!apiKey) {
				if (ctx.hasUI) {
					ctx.ui.notify(
						"Cursor cloud requires an API key from /login (Use an API key -> Cursor), CURSOR_API_KEY, or --api-key.",
						"warning",
					);
				}
				return;
			}

			let repositoryUrls: string[];
			try {
				repositoryUrls = await listRepositoryOptions(apiKey);
			} catch (error) {
				const message = scrubSensitiveText(error instanceof Error ? error.message : String(error), apiKey).trim()
					|| "Failed to list Cursor cloud repositories.";
				if (ctx.hasUI) ctx.ui.notify(message, "error");
				return;
			}

			if (repositoryUrls.length === 0) {
				if (ctx.hasUI) {
					ctx.ui.notify("No Cursor cloud repositories are connected to this account.", "warning");
				}
				return;
			}

			if (!ctx.hasUI) {
				const firstRepository = repositoryUrls[0];
				if (!firstRepository) return;
				setCursorCloudSelection(createCursorCloudSelection(firstRepository));
				await invalidateSessionAgent();
				return;
			}

			const options = [LOCAL_WORKSPACE_LABEL, ...repositoryUrls.map(formatRepositoryOption)];
			const selected = await ctx.ui.select("Cursor cloud repository", options);
			if (!selected) return;

			if (selected === LOCAL_WORKSPACE_LABEL) {
				setCursorCloudSelection(undefined);
				syncCursorCloudFooter(ctx);
				await invalidateSessionAgent();
				ctx.ui.notify("Cursor runtime switched to local workspace.", "info");
				return;
			}

			const selectedIndex = options.indexOf(selected);
			const selectedUrl = selectedIndex > 0 ? repositoryUrls[selectedIndex - 1] : undefined;
			if (!selectedUrl) return;

			const selection = createCursorCloudSelection(selectedUrl);
			setCursorCloudSelection(selection);
			syncCursorCloudFooter(ctx);
			await invalidateSessionAgent();
			ctx.ui.notify(`Cursor runtime switched to cloud repository ${selection.displayPath}.`, "info");
		},
	});
}

export function registerCursorCloudSessionHooks(
	pi: Pick<ExtensionAPI, "on">,
): void {
	pi.on("session_start", (_event, ctx) => {
		syncCursorCloudFooter(ctx);
	});
	pi.on("model_select", (_event, ctx) => {
		syncCursorCloudFooter(ctx);
	});
	pi.on("turn_start", (_event, ctx) => {
		syncCursorCloudFooter(ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		if (!ctx.hasUI || typeof ctx.ui.setFooter !== "function") return;
		if (!getCursorCloudSelection()) return;
		ctx.ui.setFooter(undefined);
	});
}
