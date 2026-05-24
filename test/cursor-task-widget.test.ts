import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { completeCursorTask, onCursorTaskTurnStart, startCursorTask } from "../src/cursor-task-ui.js";
import { cursorTaskWidget } from "../src/cursor-task-widget.js";
import { resetCursorTaskWidgetForTest } from "../src/cursor-task-widget-registration.js";

describe("cursor-task-widget", () => {
	beforeEach(() => {
		resetCursorTaskWidgetForTest();
	});

	afterEach(() => {
		resetCursorTaskWidgetForTest();
	});

	it("registers the widget and status bar while a task is running", () => {
		const setWidget = vi.fn();
		const setStatus = vi.fn();
		cursorTaskWidget.setUICtx({ setWidget, setStatus });

		startCursorTask("task-1", "Review changes");
		cursorTaskWidget.update();

		expect(setWidget).toHaveBeenCalledWith("cursor-tasks", expect.any(Function), { placement: "aboveEditor" });
		expect(setStatus).toHaveBeenCalledWith("cursor-tasks", "1 Cursor task running");
	});

	it("renders running task lines from the widget callback", () => {
		const setWidget = vi.fn();
		const setStatus = vi.fn();
		cursorTaskWidget.setUICtx({ setWidget, setStatus });

		startCursorTask("task-1", "Review changes");
		cursorTaskWidget.update();

		const factory = setWidget.mock.calls.at(-1)?.[1];
		expect(typeof factory).toBe("function");
		const theme = {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const component = factory?.({ terminal: { columns: 120 }, requestRender: vi.fn() }, theme);
		const lines = component?.render() ?? [];
		expect(lines.some((line: string) => line.includes("Review changes"))).toBe(true);
		expect(lines.some((line: string) => line.includes("running subagent"))).toBe(true);
	});

	it("clears the widget after finished tasks linger out", () => {
		const setWidget = vi.fn();
		const setStatus = vi.fn();
		cursorTaskWidget.setUICtx({ setWidget, setStatus });

		startCursorTask("task-1", "Review changes");
		completeCursorTask("task-1", "completed");
		cursorTaskWidget.onTurnStart();
		onCursorTaskTurnStart();
		cursorTaskWidget.update();

		expect(setWidget).toHaveBeenCalledWith("cursor-tasks", undefined);
		expect(setStatus).toHaveBeenCalledWith("cursor-tasks", undefined);
	});
});
