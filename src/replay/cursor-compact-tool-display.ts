// Keep compact formatting in sync with ~/.pi/agent/extensions/compact-tool-display/compact-render.ts.
import { Container, Image, Text, type Component } from "@earendil-works/pi-tui";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
	asCursorReplayToolDetails,
	CURSOR_REPLAY_COLLAPSED_PREVIEW_LINES,
	inferImageMimeTypeFromPath,
	readImageFileForReplay,
	type CursorReplayRenderTheme,
} from "./cursor-native-tool-display-replay.js";
import {
	compactSupportsInlineImages,
	getCompactImageFallbackText,
	getCompactImageUnavailableText,
	isGenericReadImageCaption,
	resolveCompactReadImage,
} from "./cursor-compact-read-image.js";
import {
	getCursorTaskReplayDescription,
	isCursorTaskReplayContext,
	normalizeTaskExpandedText,
} from "../task/cursor-task-display.js";
import { formatCursorTaskDurationMs, isCursorTaskDisplayEnabled } from "../task/cursor-task-ui.js";
import {
	CURSOR_REPLAY_ACTIVITY_TOOL_NAME,
	getCursorReplayDisplayLabel,
	type CursorReplayToolName,
} from "../transcript/cursor-tool-names.js";
import { buildCompactFileMutationPreviewLines } from "./cursor-compact-file-mutation-display.js";
import {
	COMPACT_DIFF_BLOCK_SPACER_TEXT,
	getCompactDiffBlockBgFn,
	getCompactErrorBlockBgFn,
	type CompactDiffPreviewLine,
} from "./cursor-compact-diff-display.js";
import {
	buildCompactOutputPreviewLines,
	parseCompactBashExitCode,
	resolveCompactBashRenderState,
} from "./cursor-compact-output-display.js";
import { formatDisplayPath } from "../transcript/cursor-transcript-utils.js";
import { basename } from "node:path";

type CompactToolTheme = Parameters<NonNullable<ToolDefinition["renderCall"]>>[1];
type CompactToolRenderContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type CompactToolResult = Parameters<NonNullable<ToolDefinition["renderResult"]>>[0];

export const COMPACT_ROW_PADDING = "  ";
/** Extra left indent for image rows inside compact blocks. */
export const COMPACT_IMAGE_LEFT_PADDING = COMPACT_ROW_PADDING.length + 2;
const COMPACT_TOOL_NAMES = new Set(["read", "grep", "find", "bash", "edit", "write", "ls"]);
const COMPACT_ICON_READ = "→";
const COMPACT_ICON_WRITE = "←";
const COMPACT_ICON_SHELL = "$";
const COMPACT_ICON_SEARCH = "✱";
const COMPACT_ICON_TASK = "▸";

export function isCompactNativeCursorToolName(toolName: string): boolean {
	return COMPACT_TOOL_NAMES.has(toolName);
}

export function isCompactCursorReplayToolName(toolName: string): toolName is CursorReplayToolName {
	return toolName === CURSOR_REPLAY_ACTIVITY_TOOL_NAME || toolName.startsWith("cursor_");
}

function withCompactPadding(text: string): string {
	return `${COMPACT_ROW_PADDING}${text}`;
}

function asTextComponent(component: Component | undefined): Text {
	return component instanceof Text ? component : new Text("", 0, 0);
}

function getArgPath(args: Record<string, unknown>): string | undefined {
	const rawPath =
		typeof args.path === "string"
			? args.path
			: typeof args.file_path === "string"
				? args.file_path
				: undefined;
	return rawPath?.trim() ? rawPath : undefined;
}

function quoteCompactPattern(pattern: string): string {
	return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatCompactIcon(theme: CompactToolTheme, icon: string): string {
	return theme.fg("dim", `${icon} `);
}

function formatCompactParamBracket(
	theme: CompactToolTheme,
	params: Array<[string, string | number | boolean | undefined]>,
): string {
	const parts = params
		.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
		.map(([key, value]) => `${key}=${value}`);
	return parts.length > 0 ? theme.fg("dim", ` [${parts.join(", ")}]`) : "";
}

function formatCompactCountSuffix(
	theme: CompactToolTheme,
	count: number,
	singular: string,
	plural = `${singular}s`,
): string {
	return theme.fg("dim", ` (${count} ${count === 1 ? singular : plural})`);
}

function formatCompactMatchSuffix(theme: CompactToolTheme, count: number): string {
	return formatCompactCountSuffix(theme, count, "match", "matches");
}

function formatCompactDurationMs(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

export function formatCompactReadCall(
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	cwd: string,
): string {
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : theme.fg("toolOutput", "...");
	let text = formatCompactIcon(theme, COMPACT_ICON_READ);
	text += theme.fg("toolTitle", theme.bold("Read"));
	text += ` ${theme.fg("accent", path)}`;
	text += formatCompactParamBracket(theme, [
		["offset", typeof args.offset === "number" ? args.offset : undefined],
		["limit", typeof args.limit === "number" ? args.limit : undefined],
	]);
	return text;
}

export function formatCompactGrepCall(
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	cwd: string,
	matchCount?: number,
): string {
	const rawPattern = typeof args.pattern === "string" ? args.pattern : undefined;
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : ".";
	let text = formatCompactIcon(theme, COMPACT_ICON_SEARCH);
	text += theme.fg("toolTitle", theme.bold("Grep"));
	text += " ";
	text += rawPattern
		? theme.fg("accent", quoteCompactPattern(rawPattern))
		: theme.fg("toolOutput", "...");
	text += theme.fg("dim", " in ");
	text += theme.fg("accent", path);
	text += formatCompactParamBracket(theme, [
		["glob", typeof args.glob === "string" && args.glob.trim() ? args.glob : undefined],
		["limit", typeof args.limit === "number" ? args.limit : undefined],
		["context", typeof args.context === "number" ? args.context : undefined],
		["ignoreCase", args.ignoreCase === true ? true : undefined],
		["literal", args.literal === true ? true : undefined],
	]);
	if (matchCount !== undefined) text += formatCompactMatchSuffix(theme, matchCount);
	return text;
}

export function formatCompactFindCall(
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	cwd: string,
	matchCount?: number,
): string {
	const rawPattern = typeof args.pattern === "string" ? args.pattern : undefined;
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : ".";
	let text = formatCompactIcon(theme, COMPACT_ICON_SEARCH);
	text += theme.fg("toolTitle", theme.bold("Find"));
	text += " ";
	text += rawPattern
		? theme.fg("accent", quoteCompactPattern(rawPattern))
		: theme.fg("toolOutput", "...");
	text += theme.fg("dim", " in ");
	text += theme.fg("accent", path);
	text += formatCompactParamBracket(theme, [
		["limit", typeof args.limit === "number" ? args.limit : undefined],
	]);
	if (matchCount !== undefined) text += formatCompactMatchSuffix(theme, matchCount);
	return text;
}

export function formatCompactBashCall(
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	_cwd: string,
	resultMeta?: { exitCode?: number; durationMs?: number },
): string {
	const command = typeof args.command === "string" ? args.command.trim() : undefined;
	let text = formatCompactIcon(theme, COMPACT_ICON_SHELL);
	text += command ? theme.fg("accent", command) : theme.fg("toolOutput", "...");
	text += formatCompactParamBracket(theme, [
		["timeout", typeof args.timeout === "number" ? args.timeout : undefined],
	]);
	if (resultMeta?.exitCode !== undefined || resultMeta?.durationMs !== undefined) {
		const parts: string[] = [];
		if (resultMeta.exitCode !== undefined) parts.push(`exit ${resultMeta.exitCode}`);
		if (resultMeta.durationMs !== undefined && resultMeta.durationMs >= 0)
			parts.push(formatCompactDurationMs(resultMeta.durationMs));
		if (parts.length > 0) text += theme.fg("dim", ` (${parts.join(" · ")})`);
	}
	return text;
}

export function formatCompactEditCall(
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	cwd: string,
): string {
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : theme.fg("toolOutput", "...");
	let text = formatCompactIcon(theme, COMPACT_ICON_WRITE);
	text += theme.fg("toolTitle", theme.bold("Edit"));
	text += ` ${theme.fg("accent", path)}`;
	return text;
}

export function formatCompactWriteCall(
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	cwd: string,
): string {
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : theme.fg("toolOutput", "...");
	let text = formatCompactIcon(theme, COMPACT_ICON_WRITE);
	text += theme.fg("toolTitle", theme.bold("Write"));
	text += ` ${theme.fg("accent", path)}`;
	return text;
}

export function formatCompactLsCall(
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	cwd: string,
	entryCount?: number,
): string {
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : ".";
	let text = formatCompactIcon(theme, COMPACT_ICON_READ);
	text += theme.fg("toolTitle", theme.bold("List"));
	text += ` ${theme.fg("accent", path)}`;
	text += formatCompactParamBracket(theme, [
		["limit", typeof args.limit === "number" ? args.limit : undefined],
	]);
	if (entryCount !== undefined)
		text += formatCompactCountSuffix(theme, entryCount, "entry", "entries");
	return text;
}

function getCompactCursorReplayActivityTitle(
	toolName: CursorReplayToolName,
	args: Record<string, unknown>,
): string {
	if (
		toolName === CURSOR_REPLAY_ACTIVITY_TOOL_NAME &&
		typeof args.activityTitle === "string" &&
		args.activityTitle.trim()
	) {
		return args.activityTitle.trim();
	}
	if (toolName === "cursor_edit") return "Edit";
	if (toolName === "cursor_write") return "Write";
	return getCursorReplayDisplayLabel(toolName);
}

function getCompactCursorReplayCallSummary(
	toolName: CursorReplayToolName,
	args: Record<string, unknown>,
): string | undefined {
	const activitySummary =
		typeof args.activitySummary === "string" && args.activitySummary.trim()
			? args.activitySummary.trim()
			: undefined;
	if (toolName === CURSOR_REPLAY_ACTIVITY_TOOL_NAME && activitySummary) return activitySummary;

	const path = typeof args.path === "string" ? args.path : undefined;
	const description = typeof args.description === "string" ? args.description : undefined;
	const prompt = typeof args.prompt === "string" ? args.prompt : undefined;
	const totalCount = typeof args.totalCount === "number" ? args.totalCount : undefined;
	const diagnosticCount =
		typeof args.diagnosticCount === "number" ? args.diagnosticCount : undefined;
	const paths = Array.isArray(args.paths)
		? args.paths.filter((entry): entry is string => typeof entry === "string")
		: [];

	if (toolName === "cursor_edit" || toolName === "cursor_write" || toolName === "cursor_delete")
		return path ?? "unknown";
	if (toolName === "cursor_read_lints") {
		const target = paths.length > 0 ? paths.join(" ") : path;
		if (target && diagnosticCount !== undefined)
			return `${target} · ${diagnosticCount} diagnostic${diagnosticCount === 1 ? "" : "s"}`;
		return target;
	}
	if (toolName === "cursor_update_todos" || toolName === "cursor_create_plan") {
		return totalCount !== undefined
			? `${totalCount} item${totalCount === 1 ? "" : "s"}`
			: undefined;
	}
	if (toolName === "cursor_task") return description;
	if (toolName === "cursor_generate_image") return prompt;
	if (toolName === "cursor_mcp")
		return typeof args.toolName === "string" ? args.toolName : undefined;
	if (toolName === CURSOR_REPLAY_ACTIVITY_TOOL_NAME) {
		if (typeof args.path === "string") return args.path;
		if (typeof args.toolName === "string") return args.toolName;
	}
	return undefined;
}

export function formatCompactCursorReplayCall(
	toolName: CursorReplayToolName,
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	cwd: string,
): string {
	if (
		isCursorTaskDisplayEnabled() &&
		(toolName === "cursor_task" || isCursorTaskReplayContext(args, undefined))
	) {
		const description = getCursorTaskReplayDescription(args, undefined);
		let text = formatCompactIcon(theme, COMPACT_ICON_TASK);
		text += theme.fg("toolTitle", theme.bold("Task"));
		if (description) text += ` ${theme.fg("accent", description)}`;
		return text;
	}

	if (toolName === "cursor_edit") return formatCompactEditCall(args, theme, cwd);
	if (toolName === "cursor_write") return formatCompactWriteCall(args, theme, cwd);

	if (toolName === "cursor_delete") {
		const rawPath = getArgPath(args);
		const path = rawPath ? formatDisplayPath(rawPath, cwd) : theme.fg("toolOutput", "unknown");
		let text = formatCompactIcon(theme, COMPACT_ICON_READ);
		text += theme.fg("toolTitle", theme.bold("Delete"));
		text += ` ${theme.fg("accent", path)}`;
		return text;
	}

	const title = getCompactCursorReplayActivityTitle(toolName, args);
	const summary = getCompactCursorReplayCallSummary(toolName, args);
	let text = formatCompactIcon(theme, COMPACT_ICON_READ);
	text += theme.fg("toolTitle", theme.bold(title));
	if (summary) text += ` ${theme.fg("accent", summary)}`;
	return text;
}

const COMPACT_CALL_FORMATTERS = {
	read: formatCompactReadCall,
	grep: formatCompactGrepCall,
	find: formatCompactFindCall,
	bash: formatCompactBashCall,
	edit: formatCompactEditCall,
	write: formatCompactWriteCall,
	ls: formatCompactLsCall,
} as const;

export type CompactNativeToolName = keyof typeof COMPACT_CALL_FORMATTERS;

function countDisplayLines(text: string): number {
	const withoutFinalNewline = text.endsWith("\n") ? text.slice(0, -1) : text;
	return withoutFinalNewline ? withoutFinalNewline.split("\n").length : 0;
}

export function renderCompactHighlightedBlock(
	callLine: string,
	previewLines: CompactDiffPreviewLine[] | undefined,
	blockBgFn: (text: string) => string,
): Component {
	const container = new Container();
	if (previewLines && previewLines.length > 0) {
		container.addChild(
			new Text(COMPACT_DIFF_BLOCK_SPACER_TEXT, COMPACT_ROW_PADDING.length, 0, blockBgFn),
		);
		container.addChild(new Text(callLine, COMPACT_ROW_PADDING.length, 0, blockBgFn));
		for (const previewLine of previewLines) {
			container.addChild(
				new Text(previewLine.text, COMPACT_ROW_PADDING.length, 0, previewLine.bgFn),
			);
		}
		return container;
	}
	container.addChild(new Text(callLine, COMPACT_ROW_PADDING.length, 0, blockBgFn));
	return container;
}

export function renderCompactFileMutationBlock(
	callLine: string,
	previewLines: CompactDiffPreviewLine[] | undefined,
	_theme: CompactToolTheme,
): Component {
	return renderCompactHighlightedBlock(callLine, previewLines, getCompactDiffBlockBgFn());
}

function buildCompactFileMutationCallLine(
	toolName: "edit" | "write",
	args: Record<string, unknown> | undefined,
	theme: CompactToolTheme,
	cwd: string,
): string {
	let callLine = COMPACT_CALL_FORMATTERS[toolName](args ?? {}, theme, cwd);
	if (toolName === "write" && typeof args?.content === "string" && args.content.length > 0) {
		const lineCount = countDisplayLines(args.content);
		callLine += theme.fg("dim", ` (${lineCount} ${lineCount === 1 ? "line" : "lines"})`);
	}
	return callLine;
}

function withReplayMutationArgs(
	args: Record<string, unknown> | undefined,
	details: ReturnType<typeof asCursorReplayToolDetails>,
): Record<string, unknown> {
	const record = args ?? {};
	if (getArgPath(record) !== undefined) return record;
	if (typeof details?.path === "string" && details.path.length > 0)
		return { ...record, path: details.path };
	return record;
}

function renderCompactFileMutationToolResult(
	toolName: "edit" | "write",
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: CursorReplayRenderTheme,
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
	getFallbackRenderResult: () => Component,
	callLineOverride?: string,
): Component {
	if (options.isPartial) return new Text("", 0, 0);
	if (isError) {
		const mutationArgs = withReplayMutationArgs(
			context.args && typeof context.args === "object"
				? (context.args as Record<string, unknown>)
				: undefined,
			asCursorReplayToolDetails(result.details),
		);
		const callLine =
			callLineOverride ??
			buildCompactFileMutationCallLine(toolName, mutationArgs, theme, context.cwd);
		const previewLines = buildCompactOutputPreviewLines(
			getCompactResultText(result),
			theme,
			options.expanded ?? false,
			{
				error: true,
			},
		);
		return renderCompactHighlightedBlock(callLine, previewLines, getCompactErrorBlockBgFn());
	}

	const details = asCursorReplayToolDetails(result.details);
	const mutationArgs = withReplayMutationArgs(
		context.args && typeof context.args === "object"
			? (context.args as Record<string, unknown>)
			: undefined,
		details,
	);
	const previewLines = buildCompactFileMutationPreviewLines(
		toolName,
		result,
		mutationArgs,
		theme,
		options.expanded ?? false,
	);
	if (previewLines) {
		const callLine =
			callLineOverride ??
			buildCompactFileMutationCallLine(toolName, mutationArgs, theme, context.cwd);
		return renderCompactFileMutationBlock(callLine, previewLines, theme);
	}
	if (options.expanded) {
		const callLine =
			callLineOverride ??
			buildCompactFileMutationCallLine(toolName, mutationArgs, theme, context.cwd);
		const previewLines = buildCompactOutputPreviewLines(getCompactResultText(result), theme, true, {
			error: isError,
		});
		return renderCompactHighlightedBlock(
			callLine,
			previewLines,
			isError ? getCompactErrorBlockBgFn() : getCompactDiffBlockBgFn(),
		);
	}
	return new Text("", 0, 0);
}

export function renderCompactFileMutationResult(
	toolName: "edit" | "write",
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: CursorReplayRenderTheme,
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
	getExpandedRenderResult: () => Component,
): Component {
	return renderCompactFileMutationToolResult(
		toolName,
		result,
		options,
		theme,
		context,
		isError,
		getExpandedRenderResult,
	);
}

function getCompactCursorReplayMutationToolName(
	toolName: CursorReplayToolName,
	result: CompactToolResult,
): "edit" | "write" | undefined {
	if (toolName === "cursor_edit") return "edit";
	if (toolName === "cursor_write") return "write";
	if (toolName !== CURSOR_REPLAY_ACTIVITY_TOOL_NAME) return undefined;
	const details = asCursorReplayToolDetails(result.details);
	if (details?.cursorToolName === "edit" || details?.cursorToolName === "write")
		return details.cursorToolName;
	return undefined;
}

function getCompactResultText(result: CompactToolResult): string {
	return result.content
		.filter(
			(entry): entry is { type: "text"; text: string } =>
				entry.type === "text" && typeof entry.text === "string",
		)
		.map((entry) => entry.text)
		.join("\n");
}

export function countCompactSearchMatches(
	toolName: "grep" | "find",
	result: CompactToolResult,
): number {
	const text = getCompactResultText(result).trim();
	if (!text) return 0;
	if (toolName === "find" && text === "No files found matching pattern") return 0;
	return text.split("\n").filter((line) => {
		const trimmed = line.trim();
		return trimmed.length > 0 && !trimmed.startsWith("[");
	}).length;
}

export function countCompactLsEntries(result: CompactToolResult): number {
	const text = getCompactResultText(result).trim();
	if (!text || text === "(empty directory)") return 0;
	return text.split("\n").filter((line) => {
		const trimmed = line.trim();
		return trimmed.length > 0 && !trimmed.startsWith("[");
	}).length;
}

function applyCompactBlockPadding(line: string, blockBgFn: (text: string) => string): string {
	return blockBgFn(`${" ".repeat(COMPACT_ROW_PADDING.length)}${line}`);
}

function applyCompactImageBlockPadding(line: string, blockBgFn: (text: string) => string): string {
	return blockBgFn(`${" ".repeat(COMPACT_IMAGE_LEFT_PADDING)}${line}`);
}

function renderCompactImageLines(
	image: { data: string; mimeType: string; path?: string },
	theme: CompactToolTheme,
	blockBgFn: (text: string) => string,
): Component {
	if (!compactSupportsInlineImages()) {
		return new Text(
			theme.fg("muted", getCompactImageFallbackText(image)),
			COMPACT_IMAGE_LEFT_PADDING,
			0,
			blockBgFn,
		);
	}
	const imageComponent = new Image(
		image.data,
		image.mimeType,
		{ fallbackColor: (value) => theme.fg("muted", value) },
		{
			filename: image.path ? basename(image.path) : "image",
			maxWidthCells: 40,
			maxHeightCells: 16,
		},
	);
	return {
		render: (width: number) =>
			imageComponent
				.render(width)
				.map((line) => applyCompactImageBlockPadding(line, blockBgFn)),
		invalidate: () => {
			imageComponent.invalidate();
		},
	};
}

function renderCompactReadImageBlock(
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: CompactToolTheme,
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
	image: { data: string; mimeType: string; path?: string },
): Component {
	const args =
		context.args && typeof context.args === "object"
			? (context.args as Record<string, unknown>)
			: undefined;
	const callLine = buildCompactNativeCallLine(
		"read",
		args,
		theme,
		context.cwd,
		result,
		context,
		isError,
	);
	const blockBgFn = getCompactDiffBlockBgFn();
	const container = new Container();
	container.addChild(
		new Text(COMPACT_DIFF_BLOCK_SPACER_TEXT, COMPACT_ROW_PADDING.length, 0, blockBgFn),
	);
	container.addChild(new Text(callLine, COMPACT_ROW_PADDING.length, 0, blockBgFn));
	const caption = getCompactResultText(result).trim();
	if (caption && !isGenericReadImageCaption(caption)) {
		container.addChild(
			new Text(theme.fg("dim", caption), COMPACT_ROW_PADDING.length, 0, blockBgFn),
		);
	}
	const imageWithPath = {
		...image,
		path:
			image.path ??
			(typeof args?.path === "string"
				? args.path
				: typeof args?.file_path === "string"
					? args.file_path
					: undefined),
	};
	container.addChild(renderCompactImageLines(imageWithPath, theme, blockBgFn));
	return container;
}

function buildCompactTaskHeaderLine(
	theme: CursorReplayRenderTheme,
	description: string | undefined,
	isError: boolean,
	durationMs: number | undefined,
	isPartial: boolean,
): string {
	if (isPartial) {
		let text = formatCompactIcon(theme, COMPACT_ICON_TASK);
		text += theme.fg("toolTitle", theme.bold("Task"));
		if (description) text += ` ${theme.fg("accent", description)}`;
		return text;
	}
	const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
	let line = icon;
	if (description) line += ` ${theme.fg("accent", description)}`;
	if (durationMs !== undefined && durationMs >= 0) {
		line += ` ${theme.fg("dim", "·")} ${theme.fg("dim", formatCursorTaskDurationMs(durationMs))}`;
	}
	return line;
}

function renderCompactTaskResult(
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: CursorReplayRenderTheme,
	isError: boolean,
): Component {
	const details = asCursorReplayToolDetails(result.details);
	const description = getCursorTaskReplayDescription(undefined, details);
	const durationMs = typeof details?.durationMs === "number" ? details.durationMs : undefined;
	const callLine = buildCompactTaskHeaderLine(
		theme,
		description,
		isError,
		durationMs,
		options.isPartial ?? false,
	);
	if (options.isPartial) return new Text(withCompactPadding(callLine), 0, 0);

	const previewSource = details?.expandedText ?? getCompactResultText(result);
	const normalizedPreview = normalizeTaskExpandedText(
		previewSource,
		description,
		typeof details?.summary === "string" ? details.summary : undefined,
	);
	const previewLines = buildCompactOutputPreviewLines(
		normalizedPreview,
		theme,
		options.expanded ?? false,
		{
			error: isError,
			maxCollapsedLines: CURSOR_REPLAY_COLLAPSED_PREVIEW_LINES,
		},
	);
	return renderCompactHighlightedBlock(
		callLine,
		previewLines,
		isError ? getCompactErrorBlockBgFn() : getCompactDiffBlockBgFn(),
	);
}

function buildCompactReplayCallLine(
	toolName: CursorReplayToolName,
	replayArgs: Record<string, unknown> | undefined,
	replayDetails: ReturnType<typeof asCursorReplayToolDetails>,
	theme: CursorReplayRenderTheme,
	cwd: string,
): string {
	if (typeof replayDetails?.title === "string" && replayDetails.title.trim()) {
		let text = formatCompactIcon(theme, COMPACT_ICON_READ);
		text += theme.fg("toolTitle", theme.bold(replayDetails.title.trim()));
		if (typeof replayDetails.summary === "string" && replayDetails.summary.trim()) {
			text += ` ${theme.fg("accent", replayDetails.summary.trim())}`;
		}
		return text;
	}
	return formatCompactCursorReplayCall(toolName, replayArgs ?? {}, theme, cwd);
}

function renderCompactReplayBodyResult(
	toolName: CursorReplayToolName,
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: CursorReplayRenderTheme,
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
	replayArgs: Record<string, unknown> | undefined,
	replayDetails: ReturnType<typeof asCursorReplayToolDetails>,
): Component {
	const body =
		(typeof replayDetails?.expandedText === "string" && replayDetails.expandedText.trim()) ||
		getCompactResultText(result);
	const bashState = resolveCompactBashRenderState(body, isError);
	const callLine =
		replayArgs && typeof replayArgs.command === "string"
			? formatCompactBashCall(replayArgs, theme, context.cwd, {
					exitCode: bashState.isError ? (bashState.exitCode ?? 1) : 0,
					durationMs: getCompactBashDurationMs(context),
				})
			: buildCompactReplayCallLine(toolName, replayArgs, replayDetails, theme, context.cwd);
	const previewLines = buildCompactOutputPreviewLines(body, theme, options.expanded ?? false, {
		error: bashState.isError,
		stripBashStatusSuffix: bashState.statusLine !== undefined,
		maxCollapsedLines: CURSOR_REPLAY_COLLAPSED_PREVIEW_LINES,
	});
	return renderCompactHighlightedBlock(
		callLine,
		previewLines,
		bashState.isError ? getCompactErrorBlockBgFn() : getCompactDiffBlockBgFn(),
	);
}

function renderCompactGenerateImageResult(
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: CursorReplayRenderTheme,
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
	replayDetails: ReturnType<typeof asCursorReplayToolDetails>,
): Component {
	const callLine = buildCompactReplayCallLine(
		"cursor_generate_image",
		context.args && typeof context.args === "object"
			? (context.args as Record<string, unknown>)
			: undefined,
		replayDetails,
		theme,
		context.cwd,
	);
	if (isError || !context.showImages) {
		return renderCompactReplayBodyResult(
			"cursor_generate_image",
			result,
			options,
			theme,
			context,
			isError,
			context.args as Record<string, unknown>,
			replayDetails,
		);
	}
	const imagePath = replayDetails?.imagePath;
	const mimeType = replayDetails?.imageMimeType ?? inferImageMimeTypeFromPath(imagePath);
	const data = readImageFileForReplay(imagePath);
	if (!data || !mimeType) {
		return renderCompactReplayBodyResult(
			"cursor_generate_image",
			result,
			options,
			theme,
			context,
			isError,
			context.args as Record<string, unknown>,
			replayDetails,
		);
	}
	const blockBgFn = getCompactDiffBlockBgFn();
	const container = new Container();
	container.addChild(
		new Text(COMPACT_DIFF_BLOCK_SPACER_TEXT, COMPACT_ROW_PADDING.length, 0, blockBgFn),
	);
	container.addChild(new Text(callLine, COMPACT_ROW_PADDING.length, 0, blockBgFn));
	const summary = replayDetails?.summary ?? getCompactResultText(result).trim();
	if (summary) {
		container.addChild(
			new Text(theme.fg("dim", summary), COMPACT_ROW_PADDING.length, 0, blockBgFn),
		);
	}
	container.addChild(
		renderCompactImageLines({ data, mimeType, path: imagePath }, theme, blockBgFn),
	);
	return container;
}

function shouldUseCompactCursorReplayBodyRenderer(
	toolName: CursorReplayToolName,
	result: CompactToolResult,
	args: Record<string, unknown> | undefined,
	details: ReturnType<typeof asCursorReplayToolDetails>,
): boolean {
	if (
		isCursorTaskDisplayEnabled() &&
		(toolName === "cursor_task" || isCursorTaskReplayContext(args, details))
	) {
		return true;
	}
	if (details?.cursorToolName === "task" || details?.cursorToolName === "generateImage")
		return true;
	if (typeof details?.expandedText === "string" && details.expandedText.trim()) return true;
	const text = getCompactResultText(result);
	if (text.includes("\n")) return true;
	return resolveCompactBashRenderState(text, false).isError;
}

function getCompactBashDurationMs(context: CompactToolRenderContext): number | undefined {
	const state = context.state as { startedAt?: number; endedAt?: number } | undefined;
	if (state?.startedAt === undefined) return undefined;
	const end = state.endedAt ?? Date.now();
	return Math.max(end - state.startedAt, 0);
}

function buildCompactNativeCallLine(
	toolName: CompactNativeToolName,
	args: Record<string, unknown> | undefined,
	theme: CompactToolTheme,
	cwd: string,
	result: CompactToolResult,
	context: CompactToolRenderContext,
	isError: boolean,
): string {
	if (!args) return COMPACT_CALL_FORMATTERS[toolName]({}, theme, cwd);
	if (toolName === "grep" || toolName === "find") {
		const matchCount = countCompactSearchMatches(toolName, result);
		return COMPACT_CALL_FORMATTERS[toolName](args, theme, cwd, matchCount);
	}
	if (toolName === "bash") {
		const outputText = getCompactResultText(result);
		const bashState = resolveCompactBashRenderState(outputText, isError);
		return formatCompactBashCall(args, theme, cwd, {
			exitCode: bashState.isError ? (bashState.exitCode ?? 1) : 0,
			durationMs: getCompactBashDurationMs(context),
		});
	}
	if (toolName === "ls") {
		return formatCompactLsCall(args, theme, cwd, countCompactLsEntries(result));
	}
	return COMPACT_CALL_FORMATTERS[toolName](args, theme, cwd);
}

function renderCompactNativeExpandedOrErrorResult(
	toolName: CompactNativeToolName,
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: CompactToolTheme,
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
): Component {
	const args =
		context.args && typeof context.args === "object"
			? (context.args as Record<string, unknown>)
			: undefined;
	const callLine = buildCompactNativeCallLine(
		toolName,
		args,
		theme,
		context.cwd,
		result,
		context,
		isError,
	);
	const outputText = getCompactResultText(result);
	const bashState =
		toolName === "bash" ? resolveCompactBashRenderState(outputText, isError) : undefined;
	const effectiveIsError = bashState?.isError ?? isError;
	const previewLines = buildCompactOutputPreviewLines(
		outputText,
		theme,
		options.expanded ?? false,
		{
			error: effectiveIsError,
			stripBashStatusSuffix: toolName === "bash",
		},
	);
	return renderCompactHighlightedBlock(
		callLine,
		previewLines,
		effectiveIsError ? getCompactErrorBlockBgFn() : getCompactDiffBlockBgFn(),
	);
}

export function renderCompactNativeToolCall(
	toolName: CompactNativeToolName,
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	context: CompactToolRenderContext,
): Text {
	if ((toolName === "edit" || toolName === "write") && !context.isPartial) {
		return new Text("", 0, 0);
	}
	const text = asTextComponent(context.lastComponent);
	text.setText(withCompactPadding(COMPACT_CALL_FORMATTERS[toolName](args, theme, context.cwd)));
	return text;
}

export function renderCompactCursorReplayCall(
	toolName: CursorReplayToolName,
	args: Record<string, unknown>,
	theme: CursorReplayRenderTheme,
	context: CompactToolRenderContext,
): Text {
	if (!context.isPartial) return new Text("", 0, 0);
	const text = asTextComponent(context.lastComponent);
	text.setText(
		withCompactPadding(formatCompactCursorReplayCall(toolName, args, theme, context.cwd)),
	);
	return text;
}

export function renderCompactNativeToolResult(
	toolName: CompactNativeToolName,
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: Parameters<NonNullable<ToolDefinition["renderResult"]>>[2],
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
	getCurrentRenderResult: () => ToolDefinition["renderResult"] | undefined,
): Component {
	if (toolName === "edit" || toolName === "write") {
		return renderCompactFileMutationToolResult(
			toolName,
			result,
			options,
			theme,
			context,
			isError,
			() => {
				const currentRenderResult = getCurrentRenderResult();
				return currentRenderResult
					? currentRenderResult(result, options, theme, context)
					: new Text("", 0, 0);
			},
		);
	}

	if (options.isPartial) return new Text("", 0, 0);

	const args =
		context.args && typeof context.args === "object"
			? (context.args as Record<string, unknown>)
			: undefined;
	if (toolName === "read" && !isError) {
		const image = resolveCompactReadImage(result, args);
		if (image) {
			if (context.showImages) {
				return renderCompactReadImageBlock(result, options, theme, context, isError, image);
			}
			const unavailable = getCompactImageUnavailableText(image);
			const callLine = buildCompactNativeCallLine(
				"read",
				args,
				theme,
				context.cwd,
				result,
				context,
				isError,
			);
			const previewLines = buildCompactOutputPreviewLines(
				unavailable || getCompactResultText(result),
				theme,
				options.expanded ?? false,
				{ maxCollapsedLines: CURSOR_REPLAY_COLLAPSED_PREVIEW_LINES },
			);
			return renderCompactHighlightedBlock(callLine, previewLines, getCompactDiffBlockBgFn());
		}
	}

	const outputText = getCompactResultText(result);
	const bashState =
		toolName === "bash" ? resolveCompactBashRenderState(outputText, isError) : undefined;
	const effectiveIsError = bashState?.isError ?? isError;
	if (effectiveIsError || options.expanded) {
		return renderCompactNativeExpandedOrErrorResult(
			toolName,
			result,
			options,
			theme,
			context,
			effectiveIsError,
		);
	}

	const text = asTextComponent(context.lastComponent);
	if (context.args && typeof context.args === "object") {
		const args = context.args as Record<string, unknown>;
		if (toolName === "grep" || toolName === "find") {
			const matchCount = countCompactSearchMatches(toolName, result);
			text.setText(
				withCompactPadding(COMPACT_CALL_FORMATTERS[toolName](args, theme, context.cwd, matchCount)),
			);
			return text;
		}
		if (toolName === "bash") {
			const durationMs = getCompactBashDurationMs(context);
			const collapsedBashState = resolveCompactBashRenderState(outputText, isError);
			text.setText(
				withCompactPadding(
					formatCompactBashCall(args, theme, context.cwd, {
						exitCode: collapsedBashState.isError ? (collapsedBashState.exitCode ?? 1) : 0,
						durationMs,
					}),
				),
			);
			return text;
		}
		if (toolName === "ls") {
			const entryCount = countCompactLsEntries(result);
			text.setText(withCompactPadding(formatCompactLsCall(args, theme, context.cwd, entryCount)));
			return text;
		}
	}
	text.setText("");
	return text;
}

export function renderCompactCursorReplayResult(
	toolName: CursorReplayToolName,
	result: CompactToolResult,
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: CursorReplayRenderTheme,
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
	getCurrentRenderResult: () => ToolDefinition["renderResult"] | undefined,
): Component {
	if (options.isPartial) return new Text("", 0, 0);

	const mutationToolName = getCompactCursorReplayMutationToolName(toolName, result);
	if (mutationToolName) {
		const details = asCursorReplayToolDetails(result.details);
		const mutationArgs = withReplayMutationArgs(
			context.args && typeof context.args === "object"
				? (context.args as Record<string, unknown>)
				: undefined,
			details,
		);
		let callLine = formatCompactCursorReplayCall(
			mutationToolName === "edit" ? "cursor_edit" : "cursor_write",
			mutationArgs,
			theme,
			context.cwd,
		);
		if (
			mutationToolName === "write" &&
			typeof mutationArgs.content === "string" &&
			mutationArgs.content.length > 0
		) {
			const lineCount = countDisplayLines(mutationArgs.content);
			callLine += theme.fg("dim", ` (${lineCount} ${lineCount === 1 ? "line" : "lines"})`);
		}
		return renderCompactFileMutationToolResult(
			mutationToolName,
			result,
			options,
			theme,
			context,
			isError,
			() => {
				const currentRenderResult = getCurrentRenderResult();
				return currentRenderResult
					? currentRenderResult(result, options, theme, context)
					: new Text("", 0, 0);
			},
			callLine,
		);
	}

	const replayArgs =
		context.args && typeof context.args === "object"
			? (context.args as Record<string, unknown>)
			: undefined;
	const replayDetails = asCursorReplayToolDetails(result.details);
	if (shouldUseCompactCursorReplayBodyRenderer(toolName, result, replayArgs, replayDetails)) {
		if (
			isCursorTaskDisplayEnabled() &&
			(toolName === "cursor_task" || isCursorTaskReplayContext(replayArgs, replayDetails))
		) {
			return renderCompactTaskResult(result, options, theme, isError);
		}
		if (replayDetails?.cursorToolName === "generateImage") {
			return renderCompactGenerateImageResult(
				result,
				options,
				theme,
				context,
				isError,
				replayDetails,
			);
		}
		return renderCompactReplayBodyResult(
			toolName,
			result,
			options,
			theme,
			context,
			isError,
			replayArgs,
			replayDetails,
		);
	}

	const replayOutputText = getCompactResultText(result);
	const replayBashState = resolveCompactBashRenderState(replayOutputText, isError);
	if (options.expanded || isError || replayBashState.isError) {
		if (
			!shouldUseCompactCursorReplayBodyRenderer(toolName, result, replayArgs, replayDetails)
		) {
			const shellArgs =
				replayArgs && typeof replayArgs.command === "string"
					? replayArgs
					: replayArgs &&
						  typeof replayArgs.activityTitle === "string" &&
						  replayArgs.activityTitle.trim().startsWith("$")
						? {
								...replayArgs,
								command: replayArgs.activityTitle.trim().replace(/^\$\s*/, ""),
							}
						: replayArgs;
			if (shellArgs && typeof shellArgs.command === "string") {
				const callLine = formatCompactBashCall(shellArgs, theme, context.cwd, {
					exitCode: replayBashState.isError ? (replayBashState.exitCode ?? 1) : 0,
					durationMs: getCompactBashDurationMs(context),
				});
				const previewLines = buildCompactOutputPreviewLines(
					replayOutputText,
					theme,
					options.expanded ?? false,
					{
						error: replayBashState.isError,
						stripBashStatusSuffix: replayBashState.statusLine !== undefined,
					},
				);
				return renderCompactHighlightedBlock(
					callLine,
					previewLines,
					replayBashState.isError ? getCompactErrorBlockBgFn() : getCompactDiffBlockBgFn(),
				);
			}
		}
		const currentRenderResult = getCurrentRenderResult();
		return currentRenderResult
			? currentRenderResult(result, options, theme, context)
			: new Text("", 0, 0);
	}
	const text = asTextComponent(context.lastComponent);
	text.setText(
		withCompactPadding(
			formatCompactCursorReplayCall(toolName, replayArgs ?? {}, theme, context.cwd),
		),
	);
	return text;
}
