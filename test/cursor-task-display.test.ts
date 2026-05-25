import { describe, it, expect } from "vitest";
import {
	normalizeTaskExpandedText,
	renderCursorTaskCall,
	renderCursorTaskResult,
} from "../src/task/cursor-task-display.js";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

describe("cursor-task-display", () => {
	it("renders pi-subagents-style task call headers", () => {
		const rendered = renderCursorTaskCall({ description: "Explore repo layout" }, theme, true)
			.render(120)
			.join("\n");
		expect(rendered).toContain("▸ Task");
		expect(rendered).toContain("Explore repo layout");
	});

	it("renders running and completed task result cards", () => {
		const running = renderCursorTaskResult(
			{
				content: [{ type: "text", text: "task Explore repo layout\n\nrunning output" }],
				details: {
					cursorToolName: "task",
					title: "Cursor task",
					summary: "running output",
					description: "Explore repo layout",
				},
			},
			{ expanded: false, isPartial: true },
			theme,
			false,
		)
			.render(120)
			.join("\n");
		expect(running).toContain("Explore repo layout");
		expect(running).toContain("⎿  running output");

		const completed = renderCursorTaskResult(
			{
				content: [{ type: "text", text: "task Explore repo layout\n\n20 files" }],
				details: {
					cursorToolName: "task",
					title: "Cursor task",
					description: "Explore repo layout",
					summary: "20 files",
					expandedText: "task Explore repo layout\n\n20 files",
					durationMs: 2500,
				},
			},
			{ expanded: false, isPartial: false },
			theme,
			false,
		)
			.render(120)
			.join("\n");
		expect(completed).toContain("✓");
		expect(completed).toContain("Explore repo layout");
		expect(completed).toContain("2.5s");
		expect(completed).toContain("⎿  20 files");
		expect(completed).not.toContain("task Explore repo layout");
	});

	it("drops redundant summary lines from expanded task previews", () => {
		expect(
			normalizeTaskExpandedText(
				"Explore repo layout: I'll scan the tree\n\n## Summary",
				"Explore repo layout",
				"Explore repo layout: I'll scan the tree",
			),
		).toBe("## Summary");
	});
});
