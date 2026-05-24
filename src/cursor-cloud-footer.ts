import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { getCursorCloudSelection, type CursorCloudSelection } from "./cursor-cloud-runtime.js";

interface CursorCloudFooterRuntime {
	sessionManager: ExtensionContext["sessionManager"];
	getContextUsage: ExtensionContext["getContextUsage"];
	model: ExtensionContext["model"];
	thinkingLevel?: string;
}

let footerRuntime: CursorCloudFooterRuntime | undefined;
let cloudFooterInstalled = false;

function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;
	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome = relativeToHome === ""
		|| (relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));
	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function buildCloudPwdLine(cloud: CursorCloudSelection, theme: Theme, width: number): string {
	return truncateToWidth(theme.fg("dim", cloud.displayPath) + theme.fg("accent", " • cloud"), width, theme.fg("dim", "..."));
}

function buildDefaultPwdLine(ctx: CursorCloudFooterRuntime, footerData: ReadonlyFooterDataProvider, theme: Theme, width: number): string {
	let pwd = formatCwdForFooter(ctx.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);
	const branch = footerData.getGitBranch();
	if (branch) pwd = `${pwd} (${branch})`;
	const sessionName = ctx.sessionManager.getSessionName?.();
	if (sessionName) pwd = `${pwd} • ${sessionName}`;
	return truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));
}

function buildStatsLine(
	ctx: CursorCloudFooterRuntime,
	footerData: ReadonlyFooterDataProvider,
	theme: Theme,
	width: number,
): string {
	let totalInput = 0;
	let totalOutput = 0;
	let totalCacheRead = 0;
	let totalCacheWrite = 0;
	let totalCost = 0;
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			const message = entry.message as AssistantMessage;
			totalInput += message.usage.input;
			totalOutput += message.usage.output;
			totalCacheRead += message.usage.cacheRead;
			totalCacheWrite += message.usage.cacheWrite;
			totalCost += message.usage.cost.total;
		}
	}

	const contextUsage = ctx.getContextUsage();
	const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	const contextPercentValue = contextUsage?.percent ?? 0;
	const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

	const statsParts: string[] = [];
	if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
	if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
	if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
	if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);
	if (totalCost) statsParts.push(`$${totalCost.toFixed(3)}`);

	let contextPercentStr: string;
	const contextPercentDisplay = contextPercent === "?"
		? `?/${formatTokens(contextWindow)} (auto)`
		: `${contextPercent}%/${formatTokens(contextWindow)} (auto)`;
	if (contextPercentValue > 90) contextPercentStr = theme.fg("error", contextPercentDisplay);
	else if (contextPercentValue > 70) contextPercentStr = theme.fg("warning", contextPercentDisplay);
	else contextPercentStr = contextPercentDisplay;
	statsParts.push(contextPercentStr);

	let statsLeft = statsParts.join(" ");
	const modelName = ctx.model?.id || "no-model";
	let rightSide = modelName;
	if (ctx.model?.reasoning) {
		const thinkingLevel = ctx.thinkingLevel || "off";
		rightSide = thinkingLevel === "off" ? `${modelName} • thinking off` : `${modelName} • ${thinkingLevel}`;
	}
	if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
		const withProvider = `(${ctx.model.provider}) ${rightSide}`;
		if (visibleWidth(statsLeft) + 2 + visibleWidth(withProvider) <= width) {
			rightSide = withProvider;
		}
	}

	const minPadding = 2;
	const statsLeftWidth = visibleWidth(statsLeft);
	const rightSideWidth = visibleWidth(rightSide);
	let statsLine: string;
	if (statsLeftWidth + minPadding + rightSideWidth <= width) {
		statsLine = statsLeft + " ".repeat(width - statsLeftWidth - rightSideWidth) + rightSide;
	} else {
		const availableForRight = width - statsLeftWidth - minPadding;
		statsLine = availableForRight > 0
			? statsLeft + " ".repeat(Math.max(0, width - statsLeftWidth - visibleWidth(truncateToWidth(rightSide, availableForRight, ""))))
				+ truncateToWidth(rightSide, availableForRight, "")
			: statsLeft;
	}

	const dimStatsLeft = theme.fg("dim", statsLeft);
	const remainder = statsLine.slice(statsLeft.length);
	return dimStatsLeft + theme.fg("dim", remainder);
}

function createCloudFooterComponent(
	tui: TUI,
	theme: Theme,
	footerData: ReadonlyFooterDataProvider,
) {
	const unsub = footerData.onBranchChange(() => tui.requestRender());
	return {
		dispose: unsub,
		invalidate() {},
		render(width: number): string[] {
			const runtime = footerRuntime;
			if (!runtime) return [""];
			const cloud = getCursorCloudSelection();
			const pwdLine = cloud
				? buildCloudPwdLine(cloud, theme, width)
				: buildDefaultPwdLine(runtime, footerData, theme, width);
			const statsLine = buildStatsLine(runtime, footerData, theme, width);
			return [pwdLine, statsLine];
		},
	};
}

export function syncCursorCloudFooter(
	ctx: Pick<ExtensionContext, "hasUI" | "ui" | "sessionManager" | "model" | "getContextUsage">,
): void {
	if (!ctx.hasUI || typeof ctx.ui.setFooter !== "function") return;

	footerRuntime = {
		sessionManager: ctx.sessionManager,
		getContextUsage: ctx.getContextUsage,
		model: ctx.model,
	};

	const cloud = getCursorCloudSelection();
	if (cloud) {
		cloudFooterInstalled = true;
		ctx.ui.setFooter((tui, theme, footerData) => createCloudFooterComponent(tui, theme, footerData));
		return;
	}

	if (cloudFooterInstalled) {
		cloudFooterInstalled = false;
		ctx.ui.setFooter(undefined);
	}
}

export const __testUtils = {
	setFooterRuntime: (runtime: CursorCloudFooterRuntime | undefined): void => {
		footerRuntime = runtime;
	},
	reset: (): void => {
		footerRuntime = undefined;
		cloudFooterInstalled = false;
	},
};
