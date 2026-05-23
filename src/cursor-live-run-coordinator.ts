import type { Context, ToolResultMessage } from "@earendil-works/pi-ai";
import type { CursorPiToolBridgeRun } from "./cursor-pi-tool-bridge.js";
import { getCursorSessionScopeKey } from "./cursor-session-scope.js";

type CursorLiveBridgeMatcher = Pick<CursorPiToolBridgeRun, "hasPendingPiToolCallId">;

export interface CursorLiveRunRecord {
	id: string;
	disposed: boolean;
	bridgeRun?: CursorLiveBridgeMatcher;
	sessionAgentScopeKey?: string;
}

type CursorReplayIdResolver = (toolCallId: string) => string | undefined;

export function hasTrailingUserMessagesAfterToolResults(context: Context): boolean {
	let index = context.messages.length - 1;
	let sawTrailingUser = false;
	while (index >= 0 && context.messages[index]?.role === "user") {
		sawTrailingUser = true;
		index -= 1;
	}
	if (!sawTrailingUser) return false;

	let sawToolResult = false;
	while (index >= 0 && context.messages[index]?.role === "toolResult") {
		sawToolResult = true;
		index -= 1;
	}
	return sawToolResult;
}

export function matchesCursorLiveRunToolResult(
	run: CursorLiveRunRecord,
	message: ToolResultMessage,
	getReplayId: CursorReplayIdResolver,
): boolean {
	const replayId = getReplayId(message.toolCallId);
	if (replayId) return replayId === run.id;
	return run.bridgeRun?.hasPendingPiToolCallId(message.toolCallId) ?? false;
}

export function createCursorLiveRunCoordinator<TRun extends CursorLiveRunRecord>() {
	const pendingRuns = new Map<string, TRun>();
	const pendingRunIdsByScopeKey = new Map<string, string>();

	function getUndisposed(runId: string | undefined): TRun | undefined {
		if (!runId) return undefined;
		const run = pendingRuns.get(runId);
		if (!run || run.disposed) return undefined;
		return run;
	}

	return {
		register(run: TRun): void {
			const scopeKey = run.sessionAgentScopeKey ?? getCursorSessionScopeKey();
			run.sessionAgentScopeKey = scopeKey;
			pendingRuns.set(run.id, run);
			pendingRunIdsByScopeKey.set(scopeKey, run.id);
		},

		unregister(run: TRun): void {
			pendingRuns.delete(run.id);
			const scopeKey = run.sessionAgentScopeKey;
			if (!scopeKey) return;
			if (pendingRunIdsByScopeKey.get(scopeKey) === run.id) {
				pendingRunIdsByScopeKey.delete(scopeKey);
			}
		},

		count(): number {
			return pendingRuns.size;
		},

		getActiveForScope(scopeKey: string = getCursorSessionScopeKey()): TRun | undefined {
			return getUndisposed(pendingRunIdsByScopeKey.get(scopeKey));
		},

		getPendingFromContext(context: Context, getReplayId: CursorReplayIdResolver): TRun | undefined {
			let index = context.messages.length - 1;
			while (index >= 0 && context.messages[index]?.role === "user") {
				index -= 1;
			}

			for (; index >= 0; index -= 1) {
				const message = context.messages[index];
				if (message.role !== "toolResult") break;
				const replayId = getReplayId(message.toolCallId);
				if (replayId) {
					const replayRun = getUndisposed(replayId);
					if (replayRun) return replayRun;
				}
				for (const run of pendingRuns.values()) {
					if (run.disposed) continue;
					if (run.bridgeRun?.hasPendingPiToolCallId(message.toolCallId)) return run;
				}
			}
			return undefined;
		},
	};
}
