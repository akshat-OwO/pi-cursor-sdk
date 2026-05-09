import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import type { CursorPiToolDisplay } from "./cursor-tool-transcript.js";

const CURSOR_NATIVE_TOOL_MESSAGE_TYPE = "cursor-native-tool-display";

export interface CursorNativeToolDisplayItem extends CursorPiToolDisplay {
	id: string;
}

interface CursorNativeToolDisplayMessageDetails {
	cwd: string;
	tools: CursorNativeToolDisplayItem[];
}

let nativeToolDisplayEnabled = false;
const pendingNativeToolDisplays: CursorNativeToolDisplayItem[] = [];

function createNoopTui(): TUI {
	return { requestRender: () => {} } as TUI;
}

export function isCursorNativeToolDisplayEnabled(): boolean {
	return nativeToolDisplayEnabled;
}

export function recordCursorNativeToolDisplay(item: CursorNativeToolDisplayItem): void {
	if (!nativeToolDisplayEnabled) return;
	pendingNativeToolDisplays.push(item);
}

function drainCursorNativeToolDisplays(): CursorNativeToolDisplayItem[] {
	return pendingNativeToolDisplays.splice(0);
}

function renderNativeToolDisplay(details: CursorNativeToolDisplayMessageDetails, expanded: boolean): Container | undefined {
	if (!Array.isArray(details.tools) || details.tools.length === 0) return undefined;

	const container = new Container();
	const tui = createNoopTui();
	for (const tool of details.tools) {
		const component = new ToolExecutionComponent(
			tool.toolName,
			tool.id,
			tool.args,
			{ showImages: true },
			undefined,
			tui,
			details.cwd,
		);
		component.setExpanded(expanded);
		component.markExecutionStarted();
		component.updateResult({ ...tool.result, isError: tool.isError });
		container.addChild(component);
	}
	return container;
}

export function registerCursorNativeToolDisplay(pi: ExtensionAPI): void {
	nativeToolDisplayEnabled = true;

	pi.registerMessageRenderer<CursorNativeToolDisplayMessageDetails>(CURSOR_NATIVE_TOOL_MESSAGE_TYPE, (message, options) => {
		const details = message.details as CursorNativeToolDisplayMessageDetails | undefined;
		return details ? renderNativeToolDisplay(details, options.expanded) : undefined;
	});

	pi.on("agent_end", () => {
		const tools = drainCursorNativeToolDisplays();
		if (tools.length === 0) return;
		pi.sendMessage({
			customType: CURSOR_NATIVE_TOOL_MESSAGE_TYPE,
			content: "",
			display: true,
			details: { cwd: process.cwd(), tools } satisfies CursorNativeToolDisplayMessageDetails,
		});
	});
}
