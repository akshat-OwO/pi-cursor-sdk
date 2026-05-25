import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import {
	asCursorReplayToolDetails,
	cursorReplayToolSchema,
	formatCursorReplayPreview,
	type CursorReplayRenderTheme,
} from "../replay/cursor-native-tool-display-replay.js";
import {
	CURSOR_TASK_SPINNER,
	formatCursorTaskDurationMs,
	type CursorTaskRecord,
} from "./cursor-task-ui.js";

type CursorReplayRenderResult = NonNullable<
	ToolDefinition<typeof cursorReplayToolSchema, unknown>["renderResult"]
>;

function firstContentText(result: Parameters<CursorReplayRenderResult>[0]): string {
	const content = result.content[0];
	return content?.type === "text" ? content.text : "";
}

export function isCursorTaskReplayContext(
	args: Record<string, unknown> | undefined,
	details: ReturnType<typeof asCursorReplayToolDetails>,
): boolean {
	if (details?.cursorToolName === "task") return true;
	if (args?.activityTitle === "Cursor task") return true;
	return false;
}

export function getCursorTaskReplayDescription(
	args: Record<string, unknown> | undefined,
	details: ReturnType<typeof asCursorReplayToolDetails>,
): string | undefined {
	const fromArgs =
		typeof args?.description === "string" && args.description.trim()
			? args.description.trim()
			: undefined;
	if (fromArgs) return fromArgs;
	const fromDetails =
		typeof details?.description === "string" && details.description.trim()
			? details.description.trim()
			: undefined;
	if (fromDetails) return fromDetails;
	const summary =
		typeof args?.activitySummary === "string" && args.activitySummary.trim()
			? args.activitySummary.trim()
			: undefined;
	if (summary) return summary.split(":")[0]?.trim() || summary;
	if (typeof details?.summary === "string" && details.summary.trim()) {
		const detailSummary = details.summary.trim();
		return detailSummary.split(":")[0]?.trim() || detailSummary;
	}
	return undefined;
}

export function renderCursorTaskCall(
	args: Record<string, unknown> | undefined,
	theme: CursorReplayRenderTheme,
	isPartial: boolean,
): Text {
	if (!isPartial) return new Text("", 0, 0);
	const description = getCursorTaskReplayDescription(args, undefined);
	let text = "▸ " + theme.fg("toolTitle", theme.bold("Task"));
	if (description) text += "  " + theme.fg("muted", description);
	return new Text(text, 0, 0);
}

function isRedundantTaskActivity(activity: string, description: string | undefined): boolean {
	if (!description) return false;
	const normalizedActivity = activity.trim();
	const normalizedDescription = description.trim();
	if (!normalizedActivity || !normalizedDescription) return false;
	if (normalizedActivity === normalizedDescription) return true;
	return (
		normalizedActivity.startsWith(`${normalizedDescription}:`) ||
		normalizedActivity.startsWith(`${normalizedDescription} `)
	);
}

export function normalizeTaskExpandedText(
	expandedText: string,
	description?: string,
	summary?: string,
): string {
	let body = expandedText.trim();
	if (!body) return body;
	const lines = body.split("\n");
	const firstLine = lines[0]?.trim() ?? "";
	if (description) {
		const normalizedDescription = description.trim();
		if (
			firstLine === normalizedDescription ||
			firstLine.startsWith(`${normalizedDescription}:`) ||
			firstLine.startsWith(`${normalizedDescription} `)
		) {
			body = lines.slice(1).join("\n").trim();
		}
	}
	if (summary && body) {
		const summaryLines = body.split("\n");
		const summaryFirst = summaryLines[0]?.trim() ?? "";
		if (summaryFirst === summary.trim()) {
			body = summaryLines.slice(1).join("\n").trim();
		}
	}
	return body || expandedText.trim();
}

function renderCursorTaskStatsLine(
	theme: CursorReplayRenderTheme,
	durationMs: number | undefined,
	_isError: boolean,
): string {
	const parts: string[] = [];
	if (durationMs !== undefined && durationMs >= 0) {
		parts.push(theme.fg("dim", formatCursorTaskDurationMs(durationMs)));
	}
	return parts.join(" " + theme.fg("dim", "·") + " ");
}

export function renderCursorTaskResult(
	result: Parameters<CursorReplayRenderResult>[0],
	options: Parameters<CursorReplayRenderResult>[1],
	theme: CursorReplayRenderTheme,
	_isError: boolean,
	spinnerFrame = 0,
): Component {
	const details = asCursorReplayToolDetails(result.details);
	const text = firstContentText(result);
	const description = getCursorTaskReplayDescription(undefined, details);
	const activity = details?.summary ?? text.split("\n").find((line) => line.trim()) ?? "thinking…";
	const durationMs = typeof details?.durationMs === "number" ? details.durationMs : undefined;

	if (options.isPartial) {
		const frame =
			CURSOR_TASK_SPINNER[spinnerFrame % CURSOR_TASK_SPINNER.length] ?? CURSOR_TASK_SPINNER[0];
		let line = theme.fg("accent", frame);
		if (description) line += " " + theme.fg("muted", description);
		line += "\n" + theme.fg("dim", `  ⎿  ${activity}`);
		return new Text(line, 0, 0);
	}

	const icon = _isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
	const stats = renderCursorTaskStatsLine(theme, durationMs, _isError);
	let line = icon;
	if (description) line += " " + theme.fg("muted", description);
	if (stats) line += " " + theme.fg("dim", "·") + " " + stats;
	const previewSource = details?.expandedText ?? (text.includes("\n") ? text : undefined);
	const previewLine =
		activity && activity !== description && !isRedundantTaskActivity(activity, description)
			? activity
			: undefined;
	if (previewLine) line += "\n" + theme.fg("dim", `  ⎿  ${previewLine}`);
	if (previewSource) {
		const normalizedPreview = normalizeTaskExpandedText(
			previewSource,
			description,
			typeof details?.summary === "string" ? details.summary : undefined,
		);
		const preview = options.expanded
			? normalizedPreview
					.split("\n")
					.slice(0, 50)
					.map((entry) => theme.fg("dim", `  ${entry}`))
					.join("\n")
			: formatCursorReplayPreview(normalizedPreview, theme);
		if (preview) line += `\n${preview}`;
	}
	return new Text(line, 0, 0);
}

type CursorTaskDisplayTheme = {
	fg(color: string, text: string): string;
	bold(text: string): string;
};

export function renderCursorTaskWidgetRecord(
	record: CursorTaskRecord,
	theme: CursorTaskDisplayTheme,
	spinnerFrame: number,
	width: number,
): string[] {
	const truncate = (line: string) => truncateToWidth(line, width);
	const elapsed = formatCursorTaskDurationMs((record.completedAt ?? Date.now()) - record.startedAt);

	if (record.status === "running") {
		const frame =
			CURSOR_TASK_SPINNER[spinnerFrame % CURSOR_TASK_SPINNER.length] ?? CURSOR_TASK_SPINNER[0];
		const header = `${theme.fg("accent", frame)} ${theme.bold("Task")}  ${theme.fg("muted", record.description)} ${theme.fg("dim", "·")} ${theme.fg("dim", elapsed)}`;
		const activity = record.activity ?? "running subagent…";
		return [
			truncate(header),
			truncate(theme.fg("dim", "│  ") + theme.fg("dim", `  ⎿  ${activity}`)),
		];
	}

	const icon = record.status === "error" ? theme.fg("error", "✗") : theme.fg("success", "✓");
	const statusNote = record.status === "error" ? theme.fg("error", " error") : "";
	return [
		truncate(
			`${icon} ${theme.fg("dim", "Task")}  ${theme.fg("dim", record.description)} ${theme.fg("dim", "·")} ${theme.fg("dim", elapsed)}${statusNote}`,
		),
	];
}
