import type { ExtensionAPI, ExtensionContext, SessionStartEvent, TurnStartEvent } from "@earendil-works/pi-coding-agent";
import { clearCursorTasks, isCursorTaskWidgetEnabled } from "./cursor-task-ui.js";
import { cursorTaskWidget } from "./cursor-task-widget.js";

type CursorTaskWidgetExtensionApi = Pick<ExtensionAPI, "on">;

export function registerCursorTaskWidget(pi: CursorTaskWidgetExtensionApi): void {
	pi.on("session_start", (_event: SessionStartEvent, ctx: ExtensionContext) => {
		if (!ctx.hasUI || !isCursorTaskWidgetEnabled()) {
			cursorTaskWidget.setUICtx(undefined);
			return;
		}
		cursorTaskWidget.setUICtx(ctx.ui);
		cursorTaskWidget.update();
	});
	pi.on("turn_start", (_event: TurnStartEvent, ctx: ExtensionContext) => {
		if (!ctx.hasUI || !isCursorTaskWidgetEnabled()) return;
		cursorTaskWidget.setUICtx(ctx.ui);
		cursorTaskWidget.onTurnStart();
	});
	pi.on("session_shutdown", () => {
		cursorTaskWidget.dispose();
		clearCursorTasks();
	});
}

export function bindCursorTaskWidgetForTest(ui: ExtensionContext["ui"] | undefined): void {
	cursorTaskWidget.setUICtx(ui);
}

export function resetCursorTaskWidgetForTest(): void {
	cursorTaskWidget.dispose();
	clearCursorTasks();
}
