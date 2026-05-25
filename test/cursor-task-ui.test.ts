import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	clearCursorTasks,
	completeCursorTask,
	extractCursorTaskDescription,
	isCursorTaskToolCall,
	listCursorTasks,
	onCursorTaskTurnStart,
	setCursorTaskWidgetUiBound,
	shouldSuppressCursorTaskThinkingProgress,
	startCursorTask,
} from "../src/task/cursor-task-ui.js";

describe("cursor-task-ui", () => {
	beforeEach(() => {
		clearCursorTasks();
	});

	afterEach(() => {
		setCursorTaskWidgetUiBound(false);
		clearCursorTasks();
	});

	it("tracks running and completed Cursor tasks by call ID", () => {
		startCursorTask("task-1", "Explore repo layout");
		expect(listCursorTasks()).toEqual([
			expect.objectContaining({
				callId: "task-1",
				description: "Explore repo layout",
				status: "running",
			}),
		]);

		completeCursorTask("task-1", "completed", "done");
		expect(listCursorTasks()[0]).toMatchObject({ status: "completed", activity: "done" });
	});

	it("ages finished tasks off the widget after linger turns", () => {
		startCursorTask("task-1", "Explore repo layout");
		completeCursorTask("task-1", "completed");
		expect(listCursorTasks()).toHaveLength(1);
		onCursorTaskTurnStart();
		expect(listCursorTasks()).toHaveLength(0);
	});

	it("detects Cursor SDK task tool calls and scrubs descriptions", () => {
		const toolCall = { name: "task", args: { description: "Bearer secret-key explore" } };
		expect(isCursorTaskToolCall(toolCall)).toBe(true);
		expect(extractCursorTaskDescription(toolCall, "secret-key")).toBe("Bearer [redacted] explore");
	});

	it("suppresses thinking progress only when the widget UI is bound", () => {
		expect(shouldSuppressCursorTaskThinkingProgress()).toBe(false);
		setCursorTaskWidgetUiBound(true);
		expect(shouldSuppressCursorTaskThinkingProgress()).toBe(true);
	});
});
