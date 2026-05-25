import { truncateToWidth } from "@earendil-works/pi-tui";
import {
	isCursorTaskWidgetEnabled,
	listCursorTasks,
	onCursorTaskTurnStart,
	setCursorTaskWidgetUiBound,
	subscribeCursorTaskUpdates,
} from "./cursor-task-ui.js";
import { renderCursorTaskWidgetRecord } from "./cursor-task-display.js";

type CursorTaskWidgetTheme = {
	fg(color: string, text: string): string;
	bold(text: string): string;
};

type CursorTaskWidgetUi = {
	setStatus(key: string, text: string | undefined): void;
	setWidget(
		key: string,
		content:
			| undefined
			| ((
					tui: { terminal: { columns: number }; requestRender(): void },
					theme: CursorTaskWidgetTheme,
			  ) => {
					render(): string[];
					invalidate(): void;
			  }),
		options?: { placement?: "aboveEditor" | "belowEditor" },
	): void;
};

const MAX_WIDGET_LINES = 10;

export class CursorTaskWidget {
	private uiCtx: CursorTaskWidgetUi | undefined;
	private widgetFrame = 0;
	private widgetInterval: ReturnType<typeof setInterval> | undefined;
	private widgetRegistered = false;
	private tui: { terminal: { columns: number }; requestRender(): void } | undefined;
	private lastStatusText: string | undefined;
	private unsubscribeTasks: (() => void) | undefined;

	setUICtx(ctx: CursorTaskWidgetUi | undefined): void {
		if (ctx !== this.uiCtx) {
			this.uiCtx = ctx;
			this.widgetRegistered = false;
			this.tui = undefined;
			this.lastStatusText = undefined;
			setCursorTaskWidgetUiBound(ctx !== undefined);
		}
		if (ctx && !this.unsubscribeTasks) {
			this.unsubscribeTasks = subscribeCursorTaskUpdates(() => this.update());
		}
	}

	onTurnStart(): void {
		onCursorTaskTurnStart();
		this.update();
	}

	ensureTimer(): void {
		if (!this.widgetInterval) {
			this.widgetInterval = setInterval(() => this.update(), 80);
		}
	}

	update(): void {
		if (!this.uiCtx || !isCursorTaskWidgetEnabled()) return;
		const tasks = listCursorTasks();
		const running = tasks.filter((task) => task.status === "running");
		const finished = tasks.filter((task) => task.status !== "running");

		if (running.length === 0 && finished.length === 0) {
			if (this.widgetRegistered) {
				this.uiCtx.setWidget("cursor-tasks", undefined);
				this.widgetRegistered = false;
				this.tui = undefined;
			}
			if (this.lastStatusText !== undefined) {
				this.uiCtx.setStatus("cursor-tasks", undefined);
				this.lastStatusText = undefined;
			}
			if (this.widgetInterval) {
				clearInterval(this.widgetInterval);
				this.widgetInterval = undefined;
			}
			return;
		}

		const statusText =
			running.length > 0
				? `${running.length} Cursor task${running.length === 1 ? "" : "s"} running`
				: undefined;
		if (statusText !== this.lastStatusText) {
			this.uiCtx.setStatus("cursor-tasks", statusText);
			this.lastStatusText = statusText;
		}

		this.widgetFrame++;
		this.ensureTimer();

		if (!this.widgetRegistered) {
			this.uiCtx.setWidget(
				"cursor-tasks",
				(tui, theme) => {
					this.tui = tui;
					return {
						render: () => this.renderWidget(tui, theme),
						invalidate: () => {
							this.widgetRegistered = false;
							this.tui = undefined;
						},
					};
				},
				{ placement: "aboveEditor" },
			);
			this.widgetRegistered = true;
		} else {
			this.tui?.requestRender();
		}
	}

	private renderWidget(
		tui: { terminal: { columns: number } },
		theme: CursorTaskWidgetTheme,
	): string[] {
		const tasks = listCursorTasks();
		const running = tasks.filter((task) => task.status === "running");
		const finished = tasks.filter((task) => task.status !== "running");
		if (running.length === 0 && finished.length === 0) return [];

		const width = tui.terminal.columns;
		const lines: string[] = [
			truncateToWidth(
				`${theme.fg(running.length > 0 ? "accent" : "dim", running.length > 0 ? "●" : "○")} ${theme.fg(running.length > 0 ? "accent" : "dim", "Cursor tasks")}`,
				width,
			),
		];

		for (const task of finished) {
			for (const line of renderCursorTaskWidgetRecord(task, theme, this.widgetFrame, width)) {
				lines.push(truncateToWidth(theme.fg("dim", "├─ ") + line, width));
			}
		}
		for (const task of running) {
			const rendered = renderCursorTaskWidgetRecord(task, theme, this.widgetFrame, width);
			if (rendered[0]) lines.push(truncateToWidth(theme.fg("dim", "├─ ") + rendered[0], width));
			if (rendered[1]) lines.push(truncateToWidth(rendered[1], width));
		}

		const maxLines = MAX_WIDGET_LINES;
		if (lines.length > maxLines) {
			const hidden = lines.length - maxLines + 1;
			return [
				...lines.slice(0, maxLines - 1),
				truncateToWidth(theme.fg("dim", `└─ +${hidden} more`), width),
			];
		}
		if (lines.length > 1) {
			const lastIndex = lines.length - 1;
			lines[lastIndex] = lines[lastIndex].replace("├─", "└─");
			if (lines[lastIndex].includes("│  ")) {
				lines[lastIndex] = lines[lastIndex].replace("│  ", "   ");
			}
		}
		return lines;
	}

	dispose(): void {
		if (this.widgetInterval) {
			clearInterval(this.widgetInterval);
			this.widgetInterval = undefined;
		}
		this.unsubscribeTasks?.();
		this.unsubscribeTasks = undefined;
		if (this.uiCtx) {
			this.uiCtx.setWidget("cursor-tasks", undefined);
			this.uiCtx.setStatus("cursor-tasks", undefined);
		}
		this.uiCtx = undefined;
		this.widgetRegistered = false;
		this.tui = undefined;
		this.lastStatusText = undefined;
		setCursorTaskWidgetUiBound(false);
	}
}

export const cursorTaskWidget = new CursorTaskWidget();
