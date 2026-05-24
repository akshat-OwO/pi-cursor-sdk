import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CursorPiToolDisplay } from "./cursor-tool-transcript.js";
import { getCursorCompactToolDisplaySetting } from "./cursor-agent-settings.js";
import { parseOptionalEnvBoolean } from "./cursor-env-boolean.js";
import { isCompactCursorReplayToolName, isCompactNativeCursorToolName } from "./cursor-compact-tool-display.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";

export interface CursorNativeToolDisplayItem extends CursorPiToolDisplay {
	id: string;
	terminate?: boolean;
}

export const NATIVE_CURSOR_TOOL_DISPLAY_ENV = "PI_CURSOR_NATIVE_TOOL_DISPLAY";
export const NATIVE_CURSOR_TOOL_REGISTRATION_ENV = "PI_CURSOR_REGISTER_NATIVE_TOOLS";
export const COMPACT_TOOL_DISPLAY_ENV = "PI_CURSOR_COMPACT_TOOL_DISPLAY";

export const registeredNativeToolNames = new Set<string>();
export const registeredNativeToolDefinitions = new Map<string, ToolDefinition<TSchema, unknown, unknown>>();
export const nativeToolResults = new Map<string, CursorNativeToolDisplayItem>();

let currentNativeToolDisplayModel: ExtensionContext["model"] | undefined;

export function setNativeToolDisplayModel(model: ExtensionContext["model"] | undefined): void {
	currentNativeToolDisplayModel = model;
}

export function isCursorProviderModel(model: ExtensionContext["model"] | undefined = currentNativeToolDisplayModel): boolean {
	return model?.provider === "cursor" || model?.api === "cursor-sdk";
}

export function isCursorCompactToolDisplayActive(): boolean {
	return isCursorCompactToolDisplayRequested() && isCursorProviderModel();
}

export function shouldUseCompactNativeCursorToolDisplay(toolName: string): boolean {
	return isCursorCompactToolDisplayActive() && isCompactNativeCursorToolName(toolName);
}

export function shouldUseCompactCursorReplayToolDisplay(toolName: string): boolean {
	return isCursorCompactToolDisplayActive() && isCompactCursorReplayToolName(toolName);
}

export function syncCompactNativeToolDisplayShells(): void {
	const useCompact = isCursorCompactToolDisplayActive();
	for (const [toolName, definition] of registeredNativeToolDefinitions) {
		const wantsCompactShell = useCompact && (isCompactNativeCursorToolName(toolName) || isCompactCursorReplayToolName(toolName));
		if (wantsCompactShell) {
			definition.renderShell = "self";
			continue;
		}
		delete definition.renderShell;
	}
}

export function readBooleanEnv(name: string, env: Record<string, string | undefined> = process.env): boolean | undefined {
	return parseOptionalEnvBoolean(env[name]);
}

export function isCursorNativeToolDisplayRequested(): boolean {
	const override = readBooleanEnv(NATIVE_CURSOR_TOOL_DISPLAY_ENV);
	if (override !== undefined) return override;
	return process.stdout.isTTY === true;
}

export function isCursorCompactToolDisplayRequested(): boolean {
	const envOverride = readBooleanEnv(COMPACT_TOOL_DISPLAY_ENV);
	if (envOverride !== undefined) return envOverride;
	return getCursorCompactToolDisplaySetting();
}

export function isCursorNativeToolRegistrationRequested(): boolean {
	return readBooleanEnv(NATIVE_CURSOR_TOOL_REGISTRATION_ENV) !== false && isCursorNativeToolDisplayRequested();
}

export function isCursorNativeToolDisplayEnabled(): boolean {
	return registeredNativeToolNames.size > 0;
}

export function isCursorNativeToolDisplayRuntimeEnabled(): boolean {
	return isCursorNativeToolDisplayRequested() && registeredNativeToolNames.size > 0;
}

export function canRenderCursorToolNatively(toolName: string): boolean {
	if (!isCursorNativeToolDisplayRequested()) return false;
	return registeredNativeToolNames.has(toolName);
}

export function isRegisteredCursorNativeToolName(toolName: string): boolean {
	return registeredNativeToolNames.has(toolName);
}

export function recordCursorNativeToolDisplay(item: CursorNativeToolDisplayItem): boolean {
	if (!canRenderCursorToolNatively(item.toolName)) return false;
	nativeToolResults.set(item.id, item);
	return true;
}

export function deleteCursorNativeToolDisplay(id: string): void {
	nativeToolResults.delete(id);
}

export function consumeCursorNativeToolDisplay(id: string): CursorNativeToolDisplayItem | undefined {
	const item = nativeToolResults.get(id);
	if (item) nativeToolResults.delete(id);
	return item;
}

export function isCursorReplayToolCallId(toolCallId: string): boolean {
	return toolCallId.startsWith("cursor-replay-");
}

export function isCursorFileMutationToolName(toolName: string): toolName is "edit" | "write" {
	return toolName === "edit" || toolName === "write";
}

export const __testUtils = {
	nativeToolResultCount: () => nativeToolResults.size,
	registerNativeToolNameForTests(toolName: string): void {
		registeredNativeToolNames.add(toolName);
	},
	reset(): void {
		registeredNativeToolNames.clear();
		registeredNativeToolDefinitions.clear();
		nativeToolResults.clear();
		currentNativeToolDisplayModel = undefined;
	},
};
