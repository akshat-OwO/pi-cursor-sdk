import { Text } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
	formatCompactFindCall,
	formatCompactGrepCall,
	formatCompactReadCall,
	renderCompactNativeToolCall,
	renderCompactNativeToolResult,
} from "../src/cursor-compact-tool-display.js";

const theme = {
	fg: (_style: string, text: string) => text,
	bold: (text: string) => text,
};

describe("cursor-compact-tool-display", () => {
	it("formats read calls as a single compact line with optional params", () => {
		expect(formatCompactReadCall({ path: "README.md", limit: 80 }, theme, "/repo")).toBe("→ Read README.md [limit=80]");
		expect(formatCompactReadCall({ path: "/repo/package.json", limit: 30 }, theme, "/repo")).toBe("→ Read package.json [limit=30]");
		expect(formatCompactReadCall({ path: "src/index.ts", offset: 10, limit: 20 }, theme, "/repo")).toBe(
			"→ Read src/index.ts [offset=10, limit=20]",
		);
	});

	it("formats grep calls as a single compact line with optional params", () => {
		expect(formatCompactGrepCall({ pattern: "registerTool", path: "src" }, theme, "/repo")).toBe("→ Grep registerTool in src");
		expect(formatCompactGrepCall({ pattern: "foo", path: ".", glob: "*.ts", limit: 50 }, theme, "/repo")).toBe(
			"→ Grep foo in . [glob=*.ts, limit=50]",
		);
	});

	it("formats find calls as a single compact line with optional params", () => {
		expect(formatCompactFindCall({ pattern: "**/*.test.ts", path: "src" }, theme, "/repo")).toBe("→ Find **/*.test.ts in src");
		expect(formatCompactFindCall({ pattern: "*.ts", path: ".", limit: 200 }, theme, "/repo")).toBe("→ Find *.ts in . [limit=200]");
	});

	it("renders compact read/grep/find calls through pi tool renderers", () => {
		const readCall = renderCompactNativeToolCall("read", { path: "README.md", limit: 80 }, theme, { cwd: "/repo" });
		const grepCall = renderCompactNativeToolCall("grep", { pattern: "foo", path: "src" }, theme, { cwd: "/repo" });
		const findCall = renderCompactNativeToolCall("find", { pattern: "**/*.ts", path: "src" }, theme, { cwd: "/repo" });

		expect(readCall.render(120).join("\n").trimEnd()).toBe("→ Read README.md [limit=80]");
		expect(grepCall.render(120).join("\n").trimEnd()).toBe("→ Grep foo in src");
		expect(findCall.render(120).join("\n").trimEnd()).toBe("→ Find **/*.ts in src");
	});

	it("hides compact tool results until expanded", () => {
		const renderResult = () => new Text("\nmatch output", 0, 0);
		const collapsed = renderCompactNativeToolResult(
			{ content: [{ type: "text", text: "src/index.ts:1: match" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: false, showImages: true, args: { pattern: "foo" } },
			false,
			() => renderResult,
		);
		expect(collapsed.render(120).join("\n")).toBe("");
	});

	it("shows compact tool errors when collapsed", () => {
		const renderResult = () => new Text("\nfile not found", 0, 0);
		const collapsedError = renderCompactNativeToolResult(
			{ content: [{ type: "text", text: "file not found" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: true, showImages: true, args: { path: "missing.txt" } },
			true,
			() => renderResult,
		);
		expect(collapsedError.render(120).join("\n")).toContain("file not found");
	});

	it("shows a collapsed image hint for read results with image content", () => {
		const collapsedImage = renderCompactNativeToolResult(
			{ content: [{ type: "image", data: "abc", mimeType: "image/png" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ cwd: "/repo", isError: false, showImages: true, args: { path: "badge.png" } },
			false,
			() => undefined,
		);
		expect(collapsedImage.render(120).join("\n").trimEnd()).toBe("[image loaded — expand to view]");
	});
});
