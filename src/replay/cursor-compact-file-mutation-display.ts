import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
	buildCompactDiffPreviewLines,
	type CompactDiffPreviewLine,
} from "./cursor-compact-diff-display.js";
import { resolveCursorEditDiff } from "./cursor-edit-diff.js";
import {
	asCursorReplayToolDetails,
	CURSOR_REPLAY_COLLAPSED_PREVIEW_LINES,
	getCursorReplayPath,
	type CursorReplayRenderTheme,
} from "./cursor-native-tool-display-replay.js";

type CompactFileMutationResult = Parameters<NonNullable<ToolDefinition["renderResult"]>>[0];

function getNativeEditDiff(details: unknown): string | undefined {
	if (!details || typeof details !== "object") return undefined;
	const diff = (details as { diff?: unknown }).diff;
	return typeof diff === "string" && diff.length > 0 ? diff : undefined;
}

function firstResultText(result: CompactFileMutationResult): string {
	return result.content
		.filter(
			(entry): entry is { type: "text"; text: string } =>
				entry.type === "text" && typeof entry.text === "string",
		)
		.map((entry) => entry.text)
		.join("\n");
}

function trimTrailingEmptyLines(text: string): string {
	const lines = text.split("\n");
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines.join("\n");
}

export function buildWriteUnifiedDiff(path: string, content: string): string {
	const body = trimTrailingEmptyLines(content);
	const lines = body.length > 0 ? body.split("\n") : [];
	const displayPath = path.trim() || "file";
	const hunk = lines.length === 0 ? "@@ -0,0 +0,0 @@" : `@@ -0,0 +1,${lines.length} @@`;
	return [`--- /dev/null`, `+++ b/${displayPath}`, hunk, ...lines.map((line) => `+${line}`)].join(
		"\n",
	);
}

function resolveCompactFileMutationDiff(
	toolName: "edit" | "write",
	result: CompactFileMutationResult,
	args: Record<string, unknown> | undefined,
	details: ReturnType<typeof asCursorReplayToolDetails>,
	path: string,
): string | undefined {
	const recordedDiff =
		resolveCursorEditDiff(details) ??
		resolveCursorEditDiff(result.details) ??
		getNativeEditDiff(result.details);
	if (recordedDiff) return recordedDiff;

	if (toolName !== "write") return undefined;

	const content =
		details?.fileContentAfterWrite ??
		(typeof args?.content === "string" ? args.content : undefined);
	if (typeof content === "string" && content.length > 0) {
		return buildWriteUnifiedDiff(path !== "unknown" ? path : "file", content);
	}
	return undefined;
}

export function buildCompactFileMutationPreviewLines(
	toolName: "edit" | "write",
	result: CompactFileMutationResult,
	args: Record<string, unknown> | undefined,
	theme: CursorReplayRenderTheme,
	expanded: boolean,
): CompactDiffPreviewLine[] | undefined {
	const details = asCursorReplayToolDetails(result.details);
	const maxLines = expanded ? 40 : CURSOR_REPLAY_COLLAPSED_PREVIEW_LINES;
	const path = getCursorReplayPath(args, details);
	const diff = resolveCompactFileMutationDiff(toolName, result, args, details, path);
	if (diff)
		return buildCompactDiffPreviewLines(
			diff,
			theme,
			maxLines,
			path !== "unknown" ? path : undefined,
		);

	if (toolName === "edit") return undefined;

	const text = firstResultText(result);
	if (text && !details?.cursorToolName) {
		const synthetic = buildWriteUnifiedDiff(path !== "unknown" ? path : "file", text);
		return buildCompactDiffPreviewLines(
			synthetic,
			theme,
			maxLines,
			path !== "unknown" ? path : undefined,
		);
	}
	return undefined;
}

export function buildCompactFileMutationPreviewText(
	toolName: "edit" | "write",
	result: CompactFileMutationResult,
	args: Record<string, unknown> | undefined,
	theme: CursorReplayRenderTheme,
	expanded: boolean,
): string | undefined {
	const previewLines = buildCompactFileMutationPreviewLines(
		toolName,
		result,
		args,
		theme,
		expanded,
	);
	if (!previewLines) return undefined;
	return previewLines.map((line) => line.text).join("\n");
}
