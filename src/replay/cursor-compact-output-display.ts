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

export function stripCompactBashStatusSuffix(text: string): string {
	const trimmed = text.trimEnd();
	if (!trimmed) return trimmed;
	const parts = trimmed.split("\n\n");
	if (parts.length < 2) return trimmed;
	const lastPart = parts[parts.length - 1]?.trim() ?? "";
	if (!BASH_STATUS_SUFFIX_PATTERNS.some((pattern) => pattern.test(lastPart))) return trimmed;
	return parts.slice(0, -1).join("\n\n").trimEnd();
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
	return previewLines;
}
