import {
	COMPACT_ERROR_PREVIEW_LINES,
	COMPACT_EXPANDED_OUTPUT_LINES,
	getCompactDiffBlockBgFn,
	getCompactErrorBlockBgFn,
	type CompactDiffPreviewLine,
} from "./cursor-compact-diff-display.js";
import type { CursorReplayRenderTheme } from "./cursor-native-tool-display-replay.js";

const BASH_STATUS_SUFFIX_PATTERNS = [
	/^Command exited with code \d+$/,
	/^Command aborted$/,
	/^Command timed out after \d+ seconds$/,
] as const;

export function parseCompactBashExitCode(text: string): number | undefined {
	const match = /Command exited with code (\d+)/.exec(text);
	if (!match) return undefined;
	const exitCode = Number.parseInt(match[1], 10);
	return Number.isFinite(exitCode) ? exitCode : undefined;
}

export function getCompactBashStatusLine(text: string): string | undefined {
	const trimmed = text.trimEnd();
	if (!trimmed) return undefined;
	const parts = trimmed.split("\n\n");
	const lastPart = (parts.length > 1 ? parts[parts.length - 1] : parts[0])?.trim() ?? "";
	if (!lastPart) return undefined;
	return BASH_STATUS_SUFFIX_PATTERNS.some((pattern) => pattern.test(lastPart)) ? lastPart : undefined;
}

export function stripCompactBashStatusSuffix(text: string): string {
	const statusLine = getCompactBashStatusLine(text);
	if (!statusLine) return text.trimEnd();
	const trimmed = text.trimEnd();
	const parts = trimmed.split("\n\n");
	if (parts.length < 2) return "";
	return parts.slice(0, -1).join("\n\n").trimEnd();
}

export function resolveCompactBashRenderState(
	outputText: string,
	contextIsError: boolean,
): { isError: boolean; exitCode: number | undefined; statusLine: string | undefined } {
	const statusLine = getCompactBashStatusLine(outputText);
	const parsedExitCode = parseCompactBashExitCode(outputText);
	const exitCode =
		parsedExitCode ?? (statusLine?.includes("aborted") || statusLine?.includes("timed out") ? 1 : undefined);
	const failedFromStatus =
		exitCode !== undefined && exitCode !== 0
			? true
			: statusLine !== undefined &&
				(statusLine.includes("aborted") || statusLine.includes("timed out"));
	return {
		isError: contextIsError || failedFromStatus,
		exitCode,
		statusLine,
	};
}

function appendCompactBashStatusPreviewLine(
	previewLines: CompactDiffPreviewLine[],
	statusLine: string,
	theme: CursorReplayRenderTheme,
): void {
	const bgFn = getCompactErrorBlockBgFn();
	previewLines.push({
		text: theme.fg("error", statusLine),
		bgFn,
	});
}

export function buildCompactOutputPreviewLines(
	rawOutput: string,
	theme: CursorReplayRenderTheme,
	expanded: boolean,
	options?: {
		error?: boolean;
		stripBashStatusSuffix?: boolean;
		maxCollapsedLines?: number;
	},
): CompactDiffPreviewLine[] {
	const maxCollapsed = options?.maxCollapsedLines ?? COMPACT_ERROR_PREVIEW_LINES;
	const maxLines = expanded ? COMPACT_EXPANDED_OUTPUT_LINES : maxCollapsed;
	let output = rawOutput.trim();
	if (!output) return [];
	if (options?.stripBashStatusSuffix) output = stripCompactBashStatusSuffix(output);
	if (!output) return [];

	const lines = output.split("\n");
	const visible = lines.slice(0, maxLines);
	const hiddenCount = lines.length - visible.length;
	const bgFn = options?.error ? getCompactErrorBlockBgFn() : getCompactDiffBlockBgFn();
	const previewLines: CompactDiffPreviewLine[] = visible.map((line) => ({
		text: theme.fg("toolOutput", line),
		bgFn,
	}));
	if (hiddenCount > 0) {
		previewLines.push({
			text: theme.fg("muted", `... (${hiddenCount} more lines hidden)`),
			bgFn,
		});
	}
	if (options?.error && options.stripBashStatusSuffix) {
		const statusLine = getCompactBashStatusLine(rawOutput);
		if (statusLine) appendCompactBashStatusPreviewLine(previewLines, statusLine, theme);
	}
	return previewLines;
}
