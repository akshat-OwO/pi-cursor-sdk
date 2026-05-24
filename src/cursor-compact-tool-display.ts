// Keep read/grep/find compact formatting in sync with ~/.pi/agent/extensions/compact-tool-display/compact-render.ts.
import { Text, type Component } from "@earendil-works/pi-tui";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { formatDisplayPath } from "./cursor-transcript-utils.js";

type CompactToolTheme = Parameters<NonNullable<ToolDefinition["renderCall"]>>[1];
type CompactToolRenderContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];

const COMPACT_TOOL_NAMES = new Set(["read", "grep", "find"]);

export function isCompactNativeCursorToolName(toolName: string): boolean {
	return COMPACT_TOOL_NAMES.has(toolName);
}

function asTextComponent(component: Component | undefined): Text {
	return component instanceof Text ? component : new Text("", 0, 0);
}

function getArgPath(args: Record<string, unknown>): string | undefined {
	const rawPath = typeof args.path === "string" ? args.path : typeof args.file_path === "string" ? args.file_path : undefined;
	return rawPath?.trim() ? rawPath : undefined;
}

function formatCompactParamBracket(theme: CompactToolTheme, params: Array<[string, string | number | boolean | undefined]>): string {
	const parts = params
		.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
		.map(([key, value]) => `${key}=${value}`);
	return parts.length > 0 ? theme.fg("dim", ` [${parts.join(", ")}]`) : "";
}

export function formatCompactReadCall(args: Record<string, unknown>, theme: CompactToolTheme, cwd: string): string {
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : theme.fg("toolOutput", "...");
	let text = theme.fg("dim", "→ ");
	text += theme.fg("toolTitle", theme.bold("Read"));
	text += ` ${theme.fg("accent", path)}`;
	text += formatCompactParamBracket(theme, [
		["offset", typeof args.offset === "number" ? args.offset : undefined],
		["limit", typeof args.limit === "number" ? args.limit : undefined],
	]);
	return text;
}

export function formatCompactGrepCall(args: Record<string, unknown>, theme: CompactToolTheme, cwd: string): string {
	const pattern = typeof args.pattern === "string" ? args.pattern : theme.fg("toolOutput", "...");
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : ".";
	let text = theme.fg("dim", "→ ");
	text += theme.fg("toolTitle", theme.bold("Grep"));
	text += ` ${theme.fg("accent", pattern)}`;
	text += theme.fg("dim", " in ");
	text += theme.fg("accent", path);
	text += formatCompactParamBracket(theme, [
		["glob", typeof args.glob === "string" && args.glob.trim() ? args.glob : undefined],
		["limit", typeof args.limit === "number" ? args.limit : undefined],
		["context", typeof args.context === "number" ? args.context : undefined],
		["ignoreCase", args.ignoreCase === true ? true : undefined],
		["literal", args.literal === true ? true : undefined],
	]);
	return text;
}

export function formatCompactFindCall(args: Record<string, unknown>, theme: CompactToolTheme, cwd: string): string {
	const pattern = typeof args.pattern === "string" ? args.pattern : theme.fg("toolOutput", "...");
	const rawPath = getArgPath(args);
	const path = rawPath ? formatDisplayPath(rawPath, cwd) : ".";
	let text = theme.fg("dim", "→ ");
	text += theme.fg("toolTitle", theme.bold("Find"));
	text += ` ${theme.fg("accent", pattern)}`;
	text += theme.fg("dim", " in ");
	text += theme.fg("accent", path);
	text += formatCompactParamBracket(theme, [["limit", typeof args.limit === "number" ? args.limit : undefined]]);
	return text;
}

const COMPACT_CALL_FORMATTERS = {
	read: formatCompactReadCall,
	grep: formatCompactGrepCall,
	find: formatCompactFindCall,
} as const;

export type CompactNativeToolName = keyof typeof COMPACT_CALL_FORMATTERS;

export function renderCompactNativeToolCall(
	toolName: CompactNativeToolName,
	args: Record<string, unknown>,
	theme: CompactToolTheme,
	context: CompactToolRenderContext,
): Text {
	const text = asTextComponent(context.lastComponent);
	text.setText(COMPACT_CALL_FORMATTERS[toolName](args, theme, context.cwd));
	return text;
}

export function renderCompactNativeToolResult(
	result: Parameters<NonNullable<ToolDefinition["renderResult"]>>[0],
	options: Parameters<NonNullable<ToolDefinition["renderResult"]>>[1],
	theme: Parameters<NonNullable<ToolDefinition["renderResult"]>>[2],
	context: Parameters<NonNullable<ToolDefinition["renderResult"]>>[3],
	isError: boolean,
	getCurrentRenderResult: () => ToolDefinition["renderResult"] | undefined,
): Component {
	const text = asTextComponent(context.lastComponent);
	if (!options.expanded && !isError) {
		const hasImage = result.content.some((entry) => entry.type === "image");
		text.setText(hasImage ? theme.fg("dim", "[image loaded — expand to view]") : "");
		return text;
	}
	const currentRenderResult = getCurrentRenderResult();
	if (!currentRenderResult) {
		text.setText("");
		return text;
	}
	return currentRenderResult(result, options, theme, context);
}
