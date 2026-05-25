import { Text } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
	COMPACT_ROW_PADDING,
	countCompactLsEntries,
	countCompactSearchMatches,
	formatCompactBashCall,
	formatCompactCursorReplayCall,
	formatCompactEditCall,
	formatCompactFindCall,
	formatCompactGrepCall,
	formatCompactLsCall,
	formatCompactReadCall,
	formatCompactWriteCall,
	renderCompactFileMutationBlock,
	renderCompactCursorReplayResult,
	renderCompactNativeToolCall,
	renderCompactNativeToolResult,
} from "../src/replay/cursor-compact-tool-display.js";
import {
	buildCompactOutputPreviewLines,
	parseCompactBashExitCode,
	stripCompactBashStatusSuffix,
} from "../src/replay/cursor-compact-output-display.js";
import { COMPACT_ERROR_BLOCK_BG_RGB } from "../src/replay/cursor-compact-diff-display.js";
import { buildCompactFileMutationPreviewText } from "../src/replay/cursor-compact-file-mutation-display.js";
import { buildCompactDiffPreviewLines } from "../src/replay/cursor-compact-diff-display.js";

const theme = {
	fg: (_style: string, text: string) => text,
	bold: (text: string) => text,
};

const pad = (text: string) => `${COMPACT_ROW_PADDING}${text}`;

describe("cursor-compact-tool-display", () => {
	it("formats read calls as a single compact line with optional params", () => {
		expect(formatCompactReadCall({ path: "README.md", limit: 80 }, theme, "/repo")).toBe(
			"→ Read README.md [limit=80]",
		);
		expect(formatCompactReadCall({ path: "/repo/package.json", limit: 30 }, theme, "/repo")).toBe(
			"→ Read package.json [limit=30]",
		);
		expect(
			formatCompactReadCall({ path: "src/index.ts", offset: 10, limit: 20 }, theme, "/repo"),
		).toBe("→ Read src/index.ts [offset=10, limit=20]");
	});

	it("formats grep calls as a single compact line with optional params", () => {
		expect(formatCompactGrepCall({ pattern: "registerTool", path: "src" }, theme, "/repo")).toBe(
			'✱ Grep "registerTool" in src',
		);
		expect(
			formatCompactGrepCall({ pattern: "foo", path: ".", glob: "*.ts", limit: 50 }, theme, "/repo"),
		).toBe('✱ Grep "foo" in . [glob=*.ts, limit=50]');
		expect(formatCompactGrepCall({ pattern: "foo", path: "src" }, theme, "/repo", 3)).toBe(
			'✱ Grep "foo" in src (3 matches)',
		);
	});

	it("formats find calls as a single compact line with optional params", () => {
		expect(formatCompactFindCall({ pattern: "**/*.test.ts", path: "src" }, theme, "/repo")).toBe(
			'✱ Find "**/*.test.ts" in src',
		);
		expect(formatCompactFindCall({ pattern: "*.ts", path: ".", limit: 200 }, theme, "/repo")).toBe(
			'✱ Find "*.ts" in . [limit=200]',
		);
		expect(formatCompactFindCall({ pattern: "*.ts", path: "src" }, theme, "/repo", 1)).toBe(
			'✱ Find "*.ts" in src (1 match)',
		);
	});

	it("formats bash, edit, write, and ls calls in OpenCode style", () => {
		expect(formatCompactBashCall({ command: "npm test" }, theme, "/repo")).toBe("$ npm test");
		expect(formatCompactBashCall({ command: "sleep 5", timeout: 30 }, theme, "/repo")).toBe(
			"$ sleep 5 [timeout=30]",
		);
		expect(
			formatCompactBashCall({ command: "npm test" }, theme, "/repo", {
				exitCode: 0,
				durationMs: 1200,
			}),
		).toBe("$ npm test (exit 0 · 1.2s)");
		expect(formatCompactEditCall({ path: "src/index.ts" }, theme, "/repo")).toBe(
			"← Edit src/index.ts",
		);
		expect(formatCompactWriteCall({ path: "README.md" }, theme, "/repo")).toBe("← Write README.md");
		expect(formatCompactLsCall({ path: "src", limit: 50 }, theme, "/repo")).toBe(
			"→ List src [limit=50]",
		);
		expect(formatCompactLsCall({ path: "src" }, theme, "/repo", 12)).toBe(
			"→ List src (12 entries)",
		);
	});

	it("formats cursor activity replay calls compactly", () => {
		expect(
			formatCompactCursorReplayCall(
				"cursor",
				{ activityTitle: "Cursor plan", activitySummary: "2 items" },
				theme,
				"/repo",
			),
		).toBe("→ Cursor plan 2 items");
		expect(
			formatCompactCursorReplayCall("cursor_mcp", { toolName: "external_search" }, theme, "/repo"),
		).toBe("→ Cursor MCP external_search");
		expect(
			formatCompactCursorReplayCall("cursor_delete", { path: "src/old.ts" }, theme, "/repo"),
		).toBe("→ Delete src/old.ts");
	});

	it("renders compact read/grep/find calls through pi tool renderers with padding", () => {
		const readCall = renderCompactNativeToolCall("read", { path: "README.md", limit: 80 }, theme, {
			cwd: "/repo",
		});
		const grepCall = renderCompactNativeToolCall("grep", { pattern: "foo", path: "src" }, theme, {
			cwd: "/repo",
		});
		const findCall = renderCompactNativeToolCall(
			"find",
			{ pattern: "**/*.ts", path: "src" },
			theme,
			{ cwd: "/repo" },
		);

		expect(readCall.render(120).join("\n").trimEnd()).toBe(pad("→ Read README.md [limit=80]"));
		expect(grepCall.render(120).join("\n").trimEnd()).toBe(pad('✱ Grep "foo" in src'));
		expect(findCall.render(120).join("\n").trimEnd()).toBe(pad('✱ Find "**/*.ts" in src'));
	});

	it("counts grep and find matches from result text", () => {
		expect(
			countCompactSearchMatches("grep", {
				content: [{ type: "text", text: "src/a.ts:1: foo\nsrc/b.ts:2: foo" }],
			}),
		).toBe(2);
		expect(
			countCompactSearchMatches("find", {
				content: [{ type: "text", text: "src/a.ts\nsrc/b.ts" }],
			}),
		).toBe(2);
		expect(
			countCompactSearchMatches("find", {
				content: [{ type: "text", text: "No files found matching pattern" }],
			}),
		).toBe(0);
	});

	it("counts ls entries from result text", () => {
		expect(
			countCompactLsEntries({
				content: [{ type: "text", text: "a.ts\nb.ts\nc.ts" }],
			}),
		).toBe(3);
		expect(
			countCompactLsEntries({
				content: [{ type: "text", text: "(empty directory)" }],
			}),
		).toBe(0);
	});

	it("shows collapsed grep/find call rows with match counts and padding", () => {
		const collapsedGrep = renderCompactNativeToolResult(
			"grep",
			{ content: [{ type: "text", text: "src/index.ts:1: match\nsrc/util.ts:4: match" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: false, showImages: true, args: { pattern: "match", path: "src" } },
			false,
			() => undefined,
		);
		expect(collapsedGrep.render(120).join("\n").trimEnd()).toBe(
			pad('✱ Grep "match" in src (2 matches)'),
		);
	});

	it("shows collapsed bash and ls rows with result metadata", () => {
		const collapsedBash = renderCompactNativeToolResult(
			"bash",
			{ content: [{ type: "text", text: "ok\n" }] },
			{ expanded: false, isPartial: false },
			theme,
			{
				cwd: "/repo",
				isError: false,
				showImages: true,
				args: { command: "npm test" },
				state: { startedAt: 0, endedAt: 1500 },
			},
			false,
			() => undefined,
		);
		expect(collapsedBash.render(120).join("\n").trimEnd()).toBe(pad("$ npm test (exit 0 · 1.5s)"));

		const collapsedLs = renderCompactNativeToolResult(
			"ls",
			{ content: [{ type: "text", text: "a.ts\nb.ts" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: false, showImages: true, args: { path: "src" } },
			false,
			() => undefined,
		);
		expect(collapsedLs.render(120).join("\n").trimEnd()).toBe(pad("→ List src (2 entries)"));
	});

	it("hides compact tool results until expanded", () => {
		const renderResult = () => new Text("\nmatch output", 0, 0);
		const collapsed = renderCompactNativeToolResult(
			"read",
			{ content: [{ type: "text", text: "file contents" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: false, showImages: true, args: { path: "README.md" } },
			false,
			() => renderResult,
		);
		expect(collapsed.render(120).join("\n")).toBe("");
	});

	it("shows compact tool errors when collapsed", () => {
		const collapsedError = renderCompactNativeToolResult(
			"read",
			{ content: [{ type: "text", text: "file not found" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: true, showImages: true, args: { path: "missing.txt" } },
			true,
			() => () => new Text("fallback should not run", 0, 0),
		);
		const rendered = collapsedError.render(120).join("\n");
		expect(rendered).toContain("file not found");
		expect(rendered).not.toContain("fallback should not run");
	});

	it("renders collapsed bash errors in a red block with truncated output", () => {
		const errorTheme = {
			fg: (style: string, text: string) => text,
			bold: (text: string) => text,
		};
		const lines = Array.from({ length: 6 }, (_, index) => `err-${index + 1}`).join("\n");
		const collapsedError = renderCompactNativeToolResult(
			"bash",
			{ content: [{ type: "text", text: `${lines}\n\nCommand exited with code 2` }] },
			{ expanded: false, isPartial: false },
			errorTheme,
			{
				cwd: "/repo",
				isError: true,
				showImages: true,
				args: { command: "false" },
				state: { startedAt: 0, endedAt: 500 },
			},
			true,
			() => () => new Text("fallback should not run", 0, 0),
		);
		const rendered = collapsedError.render(120);
		const joined = rendered.join("\n");
		expect(joined).not.toContain("fallback should not run");
		expect(joined).toContain("$ false");
		expect(joined).toContain("(exit 2");
		expect(joined).toContain("err-1");
		expect(joined).toContain("err-5");
		expect(joined).not.toContain("err-6");
		expect(joined).toContain("1 more lines hidden");
		const redBg = `\x1b[48;2;${COMPACT_ERROR_BLOCK_BG_RGB.r};${COMPACT_ERROR_BLOCK_BG_RGB.g};${COMPACT_ERROR_BLOCK_BG_RGB.b}m`;
		expect(rendered[0]).toContain(redBg);
		expect(joined.split("$ false").length - 1).toBe(1);
	});

	it("renders compact cursor task results with subagent output", () => {
		const collapsedTask = renderCompactCursorReplayResult(
			"cursor_task",
			{
				content: [{ type: "text", text: "agent output line 1\nagent output line 2" }],
				details: {
					cursorToolName: "task",
					description: "Explore repo",
					expandedText: "agent output line 1\nagent output line 2",
					durationMs: 2500,
				},
			},
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: false, showImages: true, args: { description: "Explore repo" } },
			false,
			() => undefined,
		);
		const rendered = collapsedTask.render(120).join("\n");
		expect(rendered).toContain("Explore repo");
		expect(rendered).toContain("agent output line 1");
		expect(rendered).not.toBe("");
	});

	it("strips bash status suffixes and parses exit codes for compact errors", () => {
		expect(parseCompactBashExitCode("stdout\n\nCommand exited with code 2")).toBe(2);
		expect(stripCompactBashStatusSuffix("stdout\n\nCommand exited with code 2")).toBe("stdout");
		const preview = buildCompactOutputPreviewLines("one\ntwo\n\nCommand exited with code 1", theme, false, {
			error: true,
			stripBashStatusSuffix: true,
		});
		expect(preview).toHaveLength(2);
		expect(preview[0]?.text).toBe("one");
	});

	it("renders expanded read images through compact display", () => {
		const tinyPng =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		const expandedImage = renderCompactNativeToolResult(
			"read",
			{
				content: [
					{ type: "text", text: "Read image file [image/png]" },
					{ type: "image", data: tinyPng, mimeType: "image/png" },
				],
			},
			{ expanded: true, isPartial: false },
			theme,
			{ cwd: "/repo", isError: false, showImages: true, args: { path: "badge.png" } },
			false,
			() => () => new Text("fallback should not run", 0, 0),
		);
		const rendered = expandedImage.render(120).join("\n");
		expect(rendered).toContain("→ Read badge.png");
		expect(rendered).not.toContain("fallback should not run");
		expect(rendered).not.toContain("[image loaded — expand to view]");
	});

	it("shows a collapsed image hint for read results with image content", () => {
		const collapsedImage = renderCompactNativeToolResult(
			"read",
			{ content: [{ type: "image", data: "abc", mimeType: "image/png" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: false, showImages: true, args: { path: "badge.png" } },
			false,
			() => undefined,
		);
		expect(collapsedImage.render(120).join("\n").trimEnd()).toBe(
			pad("[image loaded — expand to view]"),
		);
	});

	it("shows collapsed edit and write previews without summary headers", () => {
		const diffTheme = {
			fg: (style: string, text: string) =>
				["toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "toolOutput", "muted"].includes(
					style,
				)
					? `<${style}>${text}</${style}>`
					: text,
			bg: (style: string, text: string) => (style === "selectedBg" ? `<bg>${text}</bg>` : text),
			bold: (text: string) => text,
		};

		const editPreview = buildCompactFileMutationPreviewText(
			"edit",
			{
				content: [{ type: "text", text: "edit src/index.ts\n\n+1 -1" }],
				details: {
					cursorToolName: "edit",
					path: "src/index.ts",
					diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old\n+new",
				},
			},
			{ path: "src/index.ts" },
			diffTheme,
			false,
		);
		expect(editPreview).toContain("<toolDiffRemoved>-</toolDiffRemoved>");
		expect(editPreview).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(editPreview).toContain("old");
		expect(editPreview).toContain("new");
		expect(editPreview).not.toContain("--- a/");
		expect(editPreview).not.toContain("+++ b/");
		expect(editPreview).not.toContain("@@");

		const writePreview = buildCompactFileMutationPreviewText(
			"write",
			{
				content: [{ type: "text", text: "write README.md\n\nCreated 2 lines" }],
				details: {
					cursorToolName: "write",
					path: "README.md",
					fileContentAfterWrite: "# Title\n\nBody",
				},
			},
			{ path: "README.md", content: "# Title\n\nBody" },
			diffTheme,
			false,
		);
		expect(writePreview).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(writePreview).toContain("# Title");
		expect(writePreview).toContain("Body");
		expect(writePreview).not.toContain("Created 2 lines");

		const collapsedWrite = renderCompactNativeToolResult(
			"write",
			{
				content: [{ type: "text", text: "Successfully wrote 10 bytes to README.md" }],
				details: undefined,
			},
			{ expanded: false, isPartial: false },
			diffTheme,
			{
				cwd: "/repo",
				isError: false,
				showImages: true,
				args: { path: "README.md", content: "hello\nworld" },
			},
			false,
			() => undefined,
		);
		const collapsedWriteText = collapsedWrite.render(120).join("\n");
		expect(collapsedWriteText).toContain("← Write README.md (2 lines)");
		expect(collapsedWriteText).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(collapsedWriteText).toContain("hello");
		expect(collapsedWriteText).toContain("world");
		expect(collapsedWriteText).not.toContain("Successfully wrote");
		expect(collapsedWriteText).not.toContain("--- /dev/null");
		expect(collapsedWriteText).not.toContain("+++ b/");
	});

	it("formats native edit unified diffs without raw diff headers", () => {
		const diffTheme = {
			fg: (style: string, text: string) =>
				["toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "muted"].includes(style)
					? `<${style}>${text}</${style}>`
					: text,
			bg: (style: string, text: string) => (style === "selectedBg" ? `<bg>${text}</bg>` : text),
			bold: (text: string) => text,
		};
		const preview = buildCompactFileMutationPreviewText(
			"edit",
			{
				content: [{ type: "text", text: "Successfully replaced 1 block(s) in src/index.ts." }],
				details: {
					diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old\n+new",
				},
			},
			{ path: "src/index.ts" },
			diffTheme,
			false,
		);
		expect(preview).toContain("<toolDiffRemoved>-</toolDiffRemoved>");
		expect(preview).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(preview).toContain("old");
		expect(preview).toContain("new");
		expect(preview).not.toContain("--- a/src/index.ts");
		expect(preview).not.toContain("+++ b/src/index.ts");
		expect(preview).not.toContain("@@");
	});

	it("applies OpenCode-style block and per-line backgrounds to compact diff previews", () => {
		const diffTheme = {
			fg: (style: string, text: string) =>
				[
					"toolDiffAdded",
					"toolDiffRemoved",
					"toolDiffContext",
					"muted",
					"dim",
					"toolOutput",
				].includes(style)
					? `<${style}>${text}</${style}>`
					: text,
			bold: (text: string) => text,
		};
		const blockBg = "\x1b[48;2;20;20;20m";
		const addedBg = "\x1b[48;2;24;36;24m";
		const previewLines = buildCompactDiffPreviewLines(
			"--- /dev/null\n+++ b/README.md\n@@ -0,0 +1,2 @@\n+hello\n+world",
			diffTheme,
			8,
			"README.md",
		);
		const rendered = renderCompactFileMutationBlock(
			"← Write README.md (2 lines)",
			previewLines,
			diffTheme,
		).render(120);
		expect(rendered[0]).toMatch(new RegExp(`^${blockBg.replace(/\[/g, "\\[")}  `));
		expect(rendered[0]).toMatch(/\x1b\[49m$/);
		expect(rendered[1]).toMatch(new RegExp(`^${blockBg.replace(/\[/g, "\\[")}  `));
		expect(rendered[1]).toContain("← Write README.md (2 lines)");
		expect(rendered[1]).toMatch(/\x1b\[49m$/);
		expect(rendered[2]).toMatch(new RegExp(`^${addedBg.replace(/\[/g, "\\[")}  `));
		expect(rendered[2]).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(rendered[2]).toContain("hello");
		expect(rendered[2]).toMatch(/\x1b\[49m$/);
		expect(rendered[3]).toMatch(new RegExp(`^${addedBg.replace(/\[/g, "\\[")}  `));
		expect(rendered[3]).toContain("world");
		expect(rendered[3]).toMatch(/\x1b\[49m$/);
	});

	it("uses the same block styling for expanded edit and write previews", () => {
		const diffTheme = {
			fg: (style: string, text: string) =>
				[
					"toolDiffAdded",
					"toolDiffRemoved",
					"toolDiffContext",
					"muted",
					"dim",
					"toolOutput",
				].includes(style)
					? `<${style}>${text}</${style}>`
					: text,
			bold: (text: string) => text,
		};
		const diff =
			"--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,50 +1,50 @@\n" +
			Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? `-old${i}` : `+new${i}`)).join("\n");
		const expandedEdit = renderCompactNativeToolResult(
			"edit",
			{
				content: [{ type: "text", text: "edit src/index.ts\n\n+6 -6" }],
				details: { diff },
			},
			{ expanded: true, isPartial: false },
			diffTheme,
			{ cwd: "/repo", isError: false, showImages: true, args: { path: "src/index.ts" } },
			false,
			() => () => new Text("legacy fallback", 0, 0),
		);
		const rendered = expandedEdit.render(120);
		expect(rendered.length).toBeGreaterThan(10);
		expect(rendered[1]).toContain("Edit");
		expect(rendered[1]).toContain("src/index.ts");
		expect(rendered.some((line) => line.includes("more diff lines hidden"))).toBe(true);
		expect(rendered.join("\n")).not.toContain("legacy fallback");
	});
});
