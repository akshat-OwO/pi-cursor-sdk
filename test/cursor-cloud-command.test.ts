import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Cursor } from "@cursor/sdk";
import { registerCursorCloudCommand } from "../src/cursor-cloud-command.js";
import { __testUtils as cloudRuntimeTestUtils, getCursorCloudSelection } from "../src/cursor-cloud-runtime.js";

vi.mock("@cursor/sdk", () => ({
	Cursor: {
		repositories: {
			list: vi.fn(),
		},
	},
}));

vi.mock("../src/model-discovery.js", () => ({
	getCursorApiKey: vi.fn().mockResolvedValue("test-key"),
}));

const mockedListRepositories = vi.mocked(Cursor.repositories.list);

function createCommandContext(overrides: Partial<ExtensionCommandContext> = {}): ExtensionCommandContext {
	const notify = vi.fn();
	const select = vi.fn();
	const setFooter = vi.fn();
	return {
		cwd: process.cwd(),
		hasUI: true,
		model: { provider: "cursor", api: "cursor-sdk", id: "composer-2.5" } as ExtensionCommandContext["model"],
		ui: {
			notify,
			select,
			setFooter,
			setStatus: vi.fn(),
			confirm: vi.fn(),
			input: vi.fn(),
			onTerminalInput: vi.fn(() => () => {}),
			setWorkingMessage: vi.fn(),
			setWorkingVisible: vi.fn(),
			setWorkingIndicator: vi.fn(),
			setHiddenThinkingLabel: vi.fn(),
			setWidget: vi.fn(),
			setHeader: vi.fn(),
			setTitle: vi.fn(),
			custom: vi.fn(),
			pasteToEditor: vi.fn(),
			setEditorText: vi.fn(),
			getEditorText: vi.fn(),
			editor: vi.fn(),
			addAutocompleteProvider: vi.fn(),
			setEditorComponent: vi.fn(),
			getEditorComponent: vi.fn(),
			theme: {} as ExtensionCommandContext["ui"]["theme"],
			getAllThemes: vi.fn(() => []),
			getTheme: vi.fn(),
			setTheme: vi.fn(() => ({ success: true })),
			getToolsExpanded: vi.fn(() => false),
			setToolsExpanded: vi.fn(),
		},
		sessionManager: {
			getCwd: vi.fn(() => process.cwd()),
			getEntries: vi.fn(() => []),
			getBranch: vi.fn(() => []),
		} as ExtensionCommandContext["sessionManager"],
		modelRegistry: {} as ExtensionCommandContext["modelRegistry"],
		isIdle: vi.fn(() => true),
		signal: undefined,
		abort: vi.fn(),
		shutdown: vi.fn(),
		getContextUsage: vi.fn(),
		compact: vi.fn(),
		getSystemPrompt: vi.fn(() => ""),
		waitForIdle: vi.fn(),
		newSession: vi.fn(),
		fork: vi.fn(),
		navigateTree: vi.fn(),
		switchSession: vi.fn(),
		reload: vi.fn(),
		...overrides,
	} as ExtensionCommandContext;
}

describe("cursor-cloud command", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cloudRuntimeTestUtils.reset();
	});

	it("registers /cursor-cloud and selects a repository", async () => {
		const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
		registerCursorCloudCommand({
			registerCommand: (name, command) => {
				commands.set(name, command);
			},
			on: vi.fn(),
		});

		mockedListRepositories.mockResolvedValue([
			{ url: "https://github.com/acme/widgets" },
			{ url: "https://github.com/acme/other" },
		]);

		const ctx = createCommandContext();
		vi.mocked(ctx.ui.select).mockResolvedValue("acme/widgets");

		await commands.get("cursor-cloud")!.handler("", ctx);

		expect(getCursorCloudSelection()).toEqual({
			url: "https://github.com/acme/widgets",
			displayPath: "acme/widgets",
		});
		expect(ctx.ui.setFooter).toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"Cursor runtime switched to cloud repository acme/widgets.",
			"info",
		);
	});

	it("switches back to local workspace", async () => {
		const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
		registerCursorCloudCommand({
			registerCommand: (name, command) => {
				commands.set(name, command);
			},
			on: vi.fn(),
		});

		mockedListRepositories.mockResolvedValue([{ url: "https://github.com/acme/widgets" }]);
		const ctx = createCommandContext();
		vi.mocked(ctx.ui.select).mockResolvedValue("Local workspace (current directory)");

		await commands.get("cursor-cloud")!.handler("", ctx);

		expect(getCursorCloudSelection()).toBeUndefined();
		expect(ctx.ui.setFooter).toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith("Cursor runtime switched to local workspace.", "info");
	});
});
