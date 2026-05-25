import { getLanguageFromPath, highlightCode } from "@earendil-works/pi-coding-agent";
import {
	CURSOR_REPLAY_PREVIEW_MAX_LINE_CHARS,
	type CursorReplayRenderTheme,
} from "./cursor-native-tool-display-replay.js";

// OpenCode-inspired diff backgrounds for dark terminals.
export const COMPACT_DIFF_BLOCK_BG_RGB = { r: 0x14, g: 0x14, b: 0x14 } as const;
export const COMPACT_ERROR_BLOCK_BG_RGB = { r: 0x28, g: 0x14, b: 0x14 } as const;
export const COMPACT_ERROR_PREVIEW_LINES = 5;
export const COMPACT_EXPANDED_OUTPUT_LINES = 40;
/** Zero-width space survives pi-tui Text.render()'s trim() empty-line skip. */
export const COMPACT_DIFF_BLOCK_SPACER_TEXT = "\u200b";
const DIFF_BG = {
	added: { r: 0x18, g: 0x24, b: 0x18 },
	removed: { r: 0x24, g: 0x18, b: 0x18 },
} as const;

type DiffLineKind = "added" | "removed" | "context";

export interface CompactDiffPreviewLine {
	text: string;
	bgFn: (text: string) => string;
}

interface ParsedUnifiedDiffLine {
	kind: DiffLineKind;
	lineNumber: number;
	content: string;
}

function replaceDiffTabs(text: string): string {
	return text.replace(/\t/g, "   ");
}

function truncateDiffLine(text: string, maxChars = CURSOR_REPLAY_PREVIEW_MAX_LINE_CHARS): string {
	return text.length > maxChars ? `${text.slice(0, Math.max(maxChars - 1, 0))}…` : text;
}

function parseUnifiedDiffHunkHeader(
	line: string,
): { oldLine: number; newLine: number } | undefined {
	const match = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
	if (!match) return undefined;
	return { oldLine: Number(match[1]), newLine: Number(match[2]) };
}

function parseUnifiedDiffLines(diff: string): ParsedUnifiedDiffLine[] {
	const lines = diff.split("\n");
	const oldFileIsNull = lines.some((line) => line === "--- /dev/null");
	const newFileIsNull = lines.some((line) => line === "+++ /dev/null");
	const parsed: ParsedUnifiedDiffLine[] = [];
	let oldLine = 1;
	let newLine = 1;

	for (const line of lines) {
		if (!line || line.startsWith("--- ") || line.startsWith("+++ ")) continue;
		const hunk = parseUnifiedDiffHunkHeader(line);
		if (hunk) {
			oldLine = hunk.oldLine;
			newLine = hunk.newLine;
			continue;
		}

		if (line.startsWith("+")) {
			if (newFileIsNull) continue;
			parsed.push({ kind: "added", lineNumber: newLine, content: line.slice(1) });
			newLine += 1;
		} else if (line.startsWith("-")) {
			if (oldFileIsNull && line === "-") continue;
			parsed.push({ kind: "removed", lineNumber: oldLine, content: line.slice(1) });
			oldLine += 1;
		} else if (line.startsWith(" ")) {
			parsed.push({ kind: "context", lineNumber: newLine, content: line.slice(1) });
			oldLine += 1;
			newLine += 1;
		} else {
			parsed.push({ kind: "context", lineNumber: newLine, content: line });
			oldLine += 1;
			newLine += 1;
		}
	}

	return parsed;
}

function rgbBgFn(rgb: { r: number; g: number; b: number }): (text: string) => string {
	return (text: string) => `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[49m`;
}

function diffLineBgFn(kind: DiffLineKind): (text: string) => string {
	if (kind === "context") return rgbBgFn(COMPACT_DIFF_BLOCK_BG_RGB);
	return rgbBgFn(DIFF_BG[kind]);
}

export function getCompactDiffBlockBgFn(): (text: string) => string {
	return rgbBgFn(COMPACT_DIFF_BLOCK_BG_RGB);
}

export function getCompactErrorBlockBgFn(): (text: string) => string {
	return rgbBgFn(COMPACT_ERROR_BLOCK_BG_RGB);
}

function highlightDiffContents(
	contents: string[],
	path: string | undefined,
	theme: CursorReplayRenderTheme,
): string[] {
	if (contents.length === 0) return [];
	const lang = path ? getLanguageFromPath(path) : undefined;
	const normalized = contents.map((content) => truncateDiffLine(replaceDiffTabs(content)));
	if (!lang) {
		return normalized.map((content) => theme.fg("toolOutput", content));
	}
	try {
		const highlighted = highlightCode(normalized.join("\n"), lang);
		return normalized.map(
			(content, index) => highlighted[index] ?? theme.fg("toolOutput", content),
		);
	} catch {
		return normalized.map((content) => theme.fg("toolOutput", content));
	}
}

function formatDiffSign(kind: DiffLineKind, theme: CursorReplayRenderTheme): string {
	if (kind === "added") return theme.fg("toolDiffAdded", "+");
	if (kind === "removed") return theme.fg("toolDiffRemoved", "-");
	return "  ";
}

function formatDiffGutterLine(
	line: ParsedUnifiedDiffLine,
	highlightedContent: string,
	lineNumberWidth: number,
	theme: CursorReplayRenderTheme,
): string {
	const lineNumber = theme.fg("dim", String(line.lineNumber).padStart(lineNumberWidth, " "));
	return `${lineNumber} ${formatDiffSign(line.kind, theme)} ${highlightedContent}`;
}

export function buildCompactDiffPreviewLines(
	unifiedDiff: string,
	theme: CursorReplayRenderTheme,
	maxLines: number,
	path?: string,
): CompactDiffPreviewLine[] {
	const parsed = parseUnifiedDiffLines(unifiedDiff);
	if (parsed.length === 0) return [];

	const visible = parsed.slice(0, maxLines);
	const hiddenCount = parsed.length - visible.length;
	const lineNumberWidth = Math.max(
		1,
		...visible.map((line) => String(line.lineNumber).length),
		hiddenCount > 0 ? String(parsed[parsed.length - 1]?.lineNumber ?? 0).length : 0,
	);
	const highlightedContents = highlightDiffContents(
		visible.map((line) => line.content),
		path,
		theme,
	);

	const previewLines: CompactDiffPreviewLine[] = visible.map((line, index) => ({
		text: formatDiffGutterLine(line, highlightedContents[index] ?? "", lineNumberWidth, theme),
		bgFn: diffLineBgFn(line.kind),
	}));

	if (hiddenCount > 0) {
		previewLines.push({
			text: theme.fg("muted", `... (${hiddenCount} more diff lines hidden)`),
			bgFn: diffLineBgFn("context"),
		});
	}

	return previewLines;
}

export function formatCompactSyntaxDiff(
	unifiedDiff: string,
	theme: CursorReplayRenderTheme,
	maxLines: number,
	path?: string,
): string {
	return buildCompactDiffPreviewLines(unifiedDiff, theme, maxLines, path)
		.map((line) => line.text)
		.join("\n");
}
