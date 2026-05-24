import { truncateCursorDisplayLine } from "./cursor-display-text.js";
import { parseEnvBoolean } from "./cursor-env-boolean.js";
import { scrubSensitiveText } from "./cursor-sensitive-text.js";
import { getString, getToolArgs, getToolName } from "./cursor-transcript-utils.js";

export const CURSOR_TASK_WIDGET_ENV = "PI_CURSOR_TASK_WIDGET";
export const CURSOR_TASK_DISPLAY_ENV = "PI_CURSOR_TASK_DISPLAY";

export type CursorTaskStatus = "running" | "completed" | "error";

export interface CursorTaskRecord {
	callId: string;
	description: string;
	startedAt: number;
	status: CursorTaskStatus;
	completedAt?: number;
	activity?: string;
}

export const CURSOR_TASK_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const cursorTasks = new Map<string, CursorTaskRecord>();
const finishedTaskTurnAge = new Map<string, number>();
const taskUpdateListeners = new Set<() => void>();
let cursorTaskWidgetUiBound = false;
const ERROR_LINGER_TURNS = 2;
const SUCCESS_LINGER_TURNS = 1;

export function isCursorTaskWidgetEnabled(env: Record<string, string | undefined> = process.env): boolean {
	return parseEnvBoolean(env[CURSOR_TASK_WIDGET_ENV], true);
}

export function isCursorTaskDisplayEnabled(env: Record<string, string | undefined> = process.env): boolean {
	return parseEnvBoolean(env[CURSOR_TASK_DISPLAY_ENV], true);
}

export function setCursorTaskWidgetUiBound(bound: boolean): void {
	cursorTaskWidgetUiBound = bound;
}

export function isCursorTaskWidgetUiBound(): boolean {
	return cursorTaskWidgetUiBound;
}

export function shouldSuppressCursorTaskThinkingProgress(env: Record<string, string | undefined> = process.env): boolean {
	return isCursorTaskWidgetEnabled(env) && cursorTaskWidgetUiBound;
}

export function getCursorTask(callId: string): CursorTaskRecord | undefined {
	return cursorTasks.get(callId);
}

export function isCursorTaskToolCall(toolCall: unknown): boolean {
	return getToolName(toolCall).replace(/\s+/g, " ").trim().toLowerCase() === "task";
}

export function extractCursorTaskDescription(toolCall: unknown, apiKey?: string): string | undefined {
	if (!isCursorTaskToolCall(toolCall)) return undefined;
	const description = getString(getToolArgs(toolCall), "description");
	if (!description?.trim()) return undefined;
	return truncateCursorDisplayLine(scrubSensitiveText(description, apiKey));
}

export function subscribeCursorTaskUpdates(listener: () => void): () => void {
	taskUpdateListeners.add(listener);
	return () => {
		taskUpdateListeners.delete(listener);
	};
}

function notifyCursorTaskUpdates(): void {
	for (const listener of taskUpdateListeners) listener();
}

export function listCursorTasks(): CursorTaskRecord[] {
	return [...cursorTasks.values()];
}

export function startCursorTask(callId: string, description: string): void {
	if (!callId || !description.trim()) return;
	const existing = cursorTasks.get(callId);
	if (existing?.status === "running") return;
	cursorTasks.set(callId, {
		callId,
		description,
		startedAt: existing?.startedAt ?? Date.now(),
		status: "running",
		activity: "running subagent…",
	});
	finishedTaskTurnAge.delete(callId);
	notifyCursorTaskUpdates();
}

export function completeCursorTask(callId: string, status: Exclude<CursorTaskStatus, "running">, activity?: string): void {
	const existing = cursorTasks.get(callId);
	if (!existing) return;
	cursorTasks.set(callId, {
		...existing,
		status,
		completedAt: Date.now(),
		activity: activity ?? existing.activity,
	});
	if (!finishedTaskTurnAge.has(callId)) finishedTaskTurnAge.set(callId, 0);
	notifyCursorTaskUpdates();
}

export function onCursorTaskTurnStart(): void {
	for (const [callId, age] of finishedTaskTurnAge) {
		finishedTaskTurnAge.set(callId, age + 1);
	}
	pruneFinishedCursorTasks();
}

function shouldShowFinishedTask(callId: string, status: CursorTaskStatus): boolean {
	const age = finishedTaskTurnAge.get(callId) ?? 0;
	const maxAge = status === "error" ? ERROR_LINGER_TURNS : SUCCESS_LINGER_TURNS;
	return age < maxAge;
}

function pruneFinishedCursorTasks(): void {
	let changed = false;
	for (const [callId, record] of cursorTasks) {
		if (record.status === "running") continue;
		if (shouldShowFinishedTask(callId, record.status)) continue;
		cursorTasks.delete(callId);
		finishedTaskTurnAge.delete(callId);
		changed = true;
	}
	if (changed) notifyCursorTaskUpdates();
}

export function clearCursorTasks(): void {
	if (cursorTasks.size === 0 && finishedTaskTurnAge.size === 0) return;
	cursorTasks.clear();
	finishedTaskTurnAge.clear();
	notifyCursorTaskUpdates();
}

export function formatCursorTaskDurationMs(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}
