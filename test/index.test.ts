import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionContext, ProviderConfig, ToolDefinition, ToolInfo } from "@earendil-works/pi-coding-agent";
import { resetCapabilitiesCache, setCapabilities } from "@earendil-works/pi-tui";
import { Type, type TSchema } from "typebox";

vi.mock("../src/model-discovery.js", () => ({
	discoverModels: vi.fn(),
	loadCachedCursorModels: vi.fn(),
	getCursorModelMetadata: vi.fn(),
}));

vi.mock("../src/cursor-provider.js", () => ({
	streamCursor: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		getAgentDir: vi.fn(),
	};
});

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import extensionFactory from "../src/index.js";
import { __cursorAgentSettingsTestUtils } from "../src/cursor-agent-settings.js";
import { discoverModels, loadCachedCursorModels } from "../src/model-discovery.js";
import { streamCursor } from "../src/cursor-provider.js";
import {
	__testUtils as nativeToolDisplayTestUtils,
	canRenderCursorToolNatively,
	recordCursorNativeToolDisplay,
} from "../src/cursor-native-tool-display.js";
import { __testUtils as cursorPiToolBridgeTestUtils, buildCursorPiToolBridgeSnapshot } from "../src/cursor-pi-tool-bridge.js";
import { CURSOR_ASK_QUESTION_TOOL_NAME } from "../src/cursor-question-tool.js";
import { __testUtils as cursorSessionCwdTestUtils } from "../src/cursor-session-cwd.js";

const mockedDiscover = vi.mocked(discoverModels);
const mockedLoadCachedCursorModels = vi.mocked(loadCachedCursorModels);
const mockedStreamCursor = vi.mocked(streamCursor);
const mockedGetAgentDir = vi.mocked(getAgentDir);

let agentSettingsDir: string | undefined;

type DiscoverOptions = Parameters<typeof discoverModels>[0];
type RegisteredTool = ToolDefinition<TSchema, unknown, unknown>;
type TestExtensionContext = Pick<ExtensionContext, "cwd" | "hasUI" | "model"> & {
	ui: Pick<ExtensionContext["ui"], "notify" | "setStatus" | "select" | "input">;
	sessionManager: Pick<ExtensionContext["sessionManager"], "getBranch">;
};
type TestEventHandler = (event: unknown, ctx: TestExtensionContext) => Promise<void> | void;
type TestRegisteredCommand = {
	description?: string;
	handler: (args: string, ctx: TestExtensionContext) => Promise<void> | void;
};

function createBuiltinToolInfo(name: string): ToolInfo {
	return {
		name,
		description: "",
		parameters: Type.Object({}),
		sourceInfo: { source: "builtin", path: `<builtin:${name}>`, scope: "temporary", origin: "top-level" },
	};
}

function createTestExtensionContext(ctxOverrides: Partial<TestExtensionContext> = {}): TestExtensionContext {
	const notify = vi.fn();
	return {
		cwd: process.cwd(),
		hasUI: true,
		model: { provider: "cursor", api: "cursor-sdk", id: "composer-2.5" } as ExtensionContext["model"],
		ui: { notify, setStatus: vi.fn(), select: vi.fn(), input: vi.fn() },
		sessionManager: { getBranch: vi.fn(() => []) },
		...ctxOverrides,
	};
}

async function runSessionStartHandlers(pi: ReturnType<typeof createMockPi>, ctxOverrides: Partial<TestExtensionContext> = {}): Promise<void> {
	const ctx = createTestExtensionContext(ctxOverrides);
	for (const handler of pi._handlers.get("session_start") ?? []) {
		await handler({ reason: "startup" }, ctx);
	}
}

async function runModelSelectHandlers(
	pi: ReturnType<typeof createMockPi>,
	model: ExtensionContext["model"],
	ctxOverrides: Partial<TestExtensionContext> = {},
): Promise<void> {
	const ctx = createTestExtensionContext({ ...ctxOverrides, model });
	for (const handler of pi._handlers.get("model_select") ?? []) {
		await handler({ model, previousModel: undefined, source: "set" }, ctx);
	}
}

async function runBeforeAgentStartHandlers(pi: ReturnType<typeof createMockPi>, ctxOverrides: Partial<TestExtensionContext> = {}): Promise<void> {
	const ctx = createTestExtensionContext(ctxOverrides);
	for (const handler of pi._handlers.get("before_agent_start") ?? []) {
		await handler({ type: "before_agent_start", prompt: "start", systemPrompt: "", systemPromptOptions: {} }, ctx);
	}
}

async function runTurnStartHandlers(pi: ReturnType<typeof createMockPi>, ctxOverrides: Partial<TestExtensionContext> = {}): Promise<void> {
	const ctx = createTestExtensionContext(ctxOverrides);
	for (const handler of pi._handlers.get("turn_start") ?? []) {
		await handler({ type: "turn_start", turnIndex: 1, timestamp: Date.now() }, ctx);
	}
}

function createMockPi(existingTools?: ToolInfo[]) {
	const registered: Array<{ name: string; config: ProviderConfig }> = [];
	const commands = new Map<string, TestRegisteredCommand>();
	const tools: RegisteredTool[] = [];
	const handlers = new Map<string, TestEventHandler[]>();
	let activeToolNames = ["read", "bash", "edit", "write"];
	const initialTools = existingTools ?? ["read", "bash", "grep", "find", "ls", "edit", "write"].map(createBuiltinToolInfo);
	return {
		registerProvider: vi.fn((name: string, config: ProviderConfig) => {
			registered.push({ name, config });
		}),
		registerFlag: vi.fn(),
		registerCommand: vi.fn((name: string, command: TestRegisteredCommand) => {
			commands.set(name, command);
		}),
		registerTool: vi.fn((tool: RegisteredTool) => {
			tools.push(tool);
		}),
		getAllTools: vi.fn(() => {
			const toolsByName = new Map<string, ToolInfo>();
			for (const tool of initialTools) toolsByName.set(tool.name, tool);
			for (const tool of tools) {
				toolsByName.set(tool.name, {
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters,
					sourceInfo: { source: "test", path: "pi-cursor-sdk-test", scope: "temporary", origin: "top-level" },
				});
			}
			return [...toolsByName.values()];
		}),
		getActiveTools: vi.fn(() => [...activeToolNames]),
		setActiveTools: vi.fn((toolNames: string[]) => {
			activeToolNames = [...toolNames];
		}),
		sendMessage: vi.fn(),
		on: vi.fn((event: string, handler: TestEventHandler) => {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		}),
		getFlag: vi.fn().mockReturnValue(false),
		appendEntry: vi.fn(),
		_registered: registered,
		_commands: commands,
		_tools: tools,
		_handlers: handlers,
		_activeToolNames: () => activeToolNames,
	};
}

describe("extension factory", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		if (agentSettingsDir) {
			rmSync(agentSettingsDir, { recursive: true, force: true });
		}
		agentSettingsDir = mkdtempSync(join(tmpdir(), "pi-cursor-index-settings-"));
		mockedGetAgentDir.mockReturnValue(agentSettingsDir);
		delete process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY;
		delete process.env.PI_CURSOR_REGISTER_NATIVE_TOOLS;
		delete process.env.PI_CURSOR_PI_TOOL_BRIDGE;
		delete process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY;
		__cursorAgentSettingsTestUtils.reset();
		await cursorPiToolBridgeTestUtils.resetRegisteredBridgeForTests();
		cursorSessionCwdTestUtils.reset();
		nativeToolDisplayTestUtils.reset();
		mockedLoadCachedCursorModels.mockReturnValue(undefined);
	});

	it("registers the provider and refresh command", async () => {
		const mockModels = [
			{
				id: "composer-2",
				name: "Cursor Composer 2",
				reasoning: false,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
		];
		mockedDiscover.mockResolvedValueOnce(mockModels);

		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		expect(pi.registerCommand).toHaveBeenCalledWith(
			"cursor-refresh-models",
			expect.objectContaining({ description: expect.stringContaining("Refresh the live Cursor model catalog") }),
		);
		expect(pi.registerTool).toHaveBeenCalledTimes(18);
		expect(pi._tools.map((tool) => tool.name)).toEqual([
			CURSOR_ASK_QUESTION_TOOL_NAME,
			"read",
			"bash",
			"edit",
			"write",
			"grep",
			"find",
			"ls",
			"cursor",
			"cursor_edit",
			"cursor_write",
			"cursor_read_lints",
			"cursor_delete",
			"cursor_update_todos",
			"cursor_task",
			"cursor_create_plan",
			"cursor_generate_image",
			"cursor_mcp",
		]);
		expect(pi.setActiveTools).toHaveBeenCalledWith([
			"read",
			"bash",
			"edit",
			"write",
			"grep",
			"find",
			"ls",
			"cursor",
			CURSOR_ASK_QUESTION_TOOL_NAME,
		]);
		expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("turn_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("model_select", expect.any(Function));
		expect(mockedDiscover).toHaveBeenCalledOnce();
		expect(pi.registerProvider).toHaveBeenCalledOnce();

		const [call] = pi._registered;
		expect(call.name).toBe("cursor");
		expect(call.config.name).toBe("Cursor");
		expect(call.config.apiKey).toBe("CURSOR_API_KEY");
		expect(call.config.api).toBe("cursor-sdk");
		expect(call.config.models).toBe(mockModels);
		expect(call.config.streamSimple).toBe(mockedStreamCursor);
	});

	it("registers cached Cursor models immediately and refreshes live models in the background", async () => {
		const cachedModels = [
			{
				id: "composer-2",
				name: "Cursor Composer 2",
				reasoning: false,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
		];
		const refreshedModels = [
			{
				id: "gpt-5.5@1m",
				name: "GPT-5.5 @ 1m",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 16384,
			},
		];
		mockedLoadCachedCursorModels.mockReturnValueOnce(cachedModels);
		let resolveDiscover: ((models: typeof refreshedModels) => void) | undefined;
		mockedDiscover.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveDiscover = resolve;
			}),
		);

		const pi = createMockPi();
		await extensionFactory(pi);

		expect(pi.registerProvider).toHaveBeenCalledOnce();
		expect(pi._registered[0].config.models).toBe(cachedModels);
		expect(mockedDiscover).toHaveBeenCalledOnce();

		resolveDiscover!(refreshedModels);
		await vi.waitFor(() => expect(pi.registerProvider).toHaveBeenCalledTimes(2));
		expect(pi._registered[1].config.models).toBe(refreshedModels);
	});

	it("ignores stale extension ctx when background live refresh completes on a stale pi api", async () => {
		const cachedModels = [
			{
				id: "composer-2",
				name: "Cursor Composer 2",
				reasoning: false,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
		];
		const refreshedModels = [
			{
				id: "gpt-5.5@1m",
				name: "GPT-5.5 @ 1m",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 16384,
			},
		];
		mockedLoadCachedCursorModels.mockReturnValueOnce(cachedModels);
		let resolveDiscover: ((models: typeof refreshedModels) => void) | undefined;
		mockedDiscover.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveDiscover = resolve;
			}),
		);

		const pi = createMockPi();
		pi.registerProvider.mockImplementation((name: string, config: ProviderConfig) => {
			if (pi._registered.length > 0) {
				throw new Error("This extension ctx is stale after session replacement or reload.");
			}
			pi._registered.push({ name, config });
		});
		await extensionFactory(pi);

		resolveDiscover!(refreshedModels);
		await vi.waitFor(() => expect(mockedDiscover).toHaveBeenCalledOnce());
		expect(pi.registerProvider).toHaveBeenCalledTimes(2);
		expect(pi._registered).toHaveLength(1);
		expect(pi._registered[0].config.models).toBe(cachedModels);
	});

	it("keeps cached Cursor models when background live refresh falls back", async () => {
		const cachedModels = [
			{
				id: "composer-2",
				name: "Cursor Composer 2",
				reasoning: false,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
		];
		mockedLoadCachedCursorModels.mockReturnValueOnce(cachedModels);
		mockedDiscover.mockImplementationOnce(async (options: DiscoverOptions) => {
			options.onFallback?.({ reason: "discovery-failed", message: "network error" });
			return cachedModels;
		});

		const pi = createMockPi();
		await extensionFactory(pi);

		await vi.waitFor(() => expect(mockedDiscover).toHaveBeenCalledOnce());
		expect(pi.registerProvider).toHaveBeenCalledOnce();
		expect(pi._registered[0].config.models).toBe(cachedModels);
	});

	it("keeps legacy Cursor replay-only tools out of active tools", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		expect(pi._activeToolNames()).toContain("cursor");
		expect(pi._activeToolNames()).toContain(CURSOR_ASK_QUESTION_TOOL_NAME);
		expect(pi._activeToolNames()).not.toContain("cursor_edit");

		await runModelSelectHandlers(
			pi,
			{ provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.5" } as ExtensionContext["model"],
		);
		expect(pi._activeToolNames()).not.toContain("cursor_edit");
		expect(pi._activeToolNames()).not.toContain("cursor_generate_image");
		expect(pi._activeToolNames()).not.toContain("cursor");
		expect(pi._activeToolNames()).not.toContain(CURSOR_ASK_QUESTION_TOOL_NAME);
		expect(pi._activeToolNames()).not.toContain("grep");
		expect(pi._activeToolNames()).not.toContain("find");
		expect(pi._activeToolNames()).toContain("read");

		await runModelSelectHandlers(pi, { provider: "cursor", api: "cursor-sdk", id: "composer-2.5" } as ExtensionContext["model"]);
		expect(pi._activeToolNames()).toContain("cursor");
		expect(pi._activeToolNames()).toContain(CURSOR_ASK_QUESTION_TOOL_NAME);
		expect(pi._activeToolNames()).not.toContain("cursor_edit");
		expect(pi._activeToolNames()).not.toContain("cursor_generate_image");
	});

	it("resyncs Cursor-only tools before a turn when session startup did not know the model", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi, { model: undefined });

		expect(pi._activeToolNames()).not.toContain("cursor");
		expect(pi._activeToolNames()).not.toContain("grep");
		expect(pi._activeToolNames()).not.toContain(CURSOR_ASK_QUESTION_TOOL_NAME);

		await runBeforeAgentStartHandlers(pi, { model: { provider: "cursor", api: "cursor-sdk", id: "composer-2.5" } as ExtensionContext["model"] });

		expect(pi._activeToolNames()).toContain("cursor");
		expect(pi._activeToolNames()).toContain("grep");
		expect(pi._activeToolNames()).toContain(CURSOR_ASK_QUESTION_TOOL_NAME);
		expect(buildCursorPiToolBridgeSnapshot(pi).piToolNameToMcpToolName.get(CURSOR_ASK_QUESTION_TOOL_NAME)).toBe("pi__cursor_ask_question");

		pi.setActiveTools(["read", "bash", "edit", "write"]);
		expect(pi._activeToolNames()).not.toContain("cursor");
		expect(pi._activeToolNames()).not.toContain("grep");
		expect(pi._activeToolNames()).not.toContain(CURSOR_ASK_QUESTION_TOOL_NAME);

		await runTurnStartHandlers(pi, { model: { provider: "cursor", api: "cursor-sdk", id: "composer-2.5" } as ExtensionContext["model"] });

		expect(pi._activeToolNames()).toContain("cursor");
		expect(pi._activeToolNames()).toContain("grep");
		expect(pi._activeToolNames()).toContain(CURSOR_ASK_QUESTION_TOOL_NAME);
	});

	it("asks Cursor questions through pi UI selection", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "0";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		const select = vi.fn().mockResolvedValue("Web app");
		const input = vi.fn();
		const tool = pi._tools.find((candidate) => candidate.name === CURSOR_ASK_QUESTION_TOOL_NAME);
		const result = await tool!.execute(
			"question-1",
			{
				question: "What kind of calculator should Cursor plan?",
				options: [
					{ label: "Web app", value: "web" },
					{ label: "CLI", value: "cli" },
				],
				allowCustom: false,
			},
			undefined,
			undefined,
			createTestExtensionContext({ ui: { notify: vi.fn(), setStatus: vi.fn(), select, input } }) as never,
		);

		expect(select).toHaveBeenCalledWith("What kind of calculator should Cursor plan?", ["Web app", "CLI"]);
		expect(input).not.toHaveBeenCalled();
		expect(result.content).toEqual([{ type: "text", text: "User answered: Web app" }]);
		expect(result.details).toMatchObject({
			uiAvailable: true,
			cancelled: false,
			answers: [{ id: "question_1", answer: "Web app", value: "web", cancelled: false }],
		});
	});

	it("registers Cursor pi tool bridge state and activates the Cursor question tool", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "0";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();

		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		expect(cursorPiToolBridgeTestUtils.getRegisteredBridgeForTests()?.isEnabled()).toBe(true);
		expect(pi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
		expect(pi._activeToolNames()).toContain(CURSOR_ASK_QUESTION_TOOL_NAME);

		const snapshot = buildCursorPiToolBridgeSnapshot(pi);
		expect(snapshot.piToolNameToMcpToolName.get(CURSOR_ASK_QUESTION_TOOL_NAME)).toBe("pi__cursor_ask_question");
		expect(snapshot.tools.find((tool) => tool.piToolName === CURSOR_ASK_QUESTION_TOOL_NAME)?.description).toContain("Ask the user");
	});

	it("honors PI_CURSOR_PI_TOOL_BRIDGE=0 at the extension registration path", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "0";
		process.env.PI_CURSOR_PI_TOOL_BRIDGE = "0";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();

		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		expect(cursorPiToolBridgeTestUtils.getRegisteredBridgeForTests()?.isEnabled()).toBe(false);
		expect(pi.setActiveTools).not.toHaveBeenCalled();
	});

	it("registers provider even with fallback models", async () => {
		mockedDiscover.mockResolvedValueOnce([
			{
				id: "composer-2",
				name: "Cursor Composer 2",
				reasoning: false,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
			{
				id: "gpt-5.5@1m",
				name: "GPT-5.5 @ 1m",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 16384,
			},
		]);

		const pi = createMockPi();
		await extensionFactory(pi);

		expect(pi.registerProvider).toHaveBeenCalledOnce();
		const [call] = pi._registered;
		expect(call.config.models).toHaveLength(2);
	});

	it("refreshes Cursor models through a live command without reload", async () => {
		const startupModels = [
			{
				id: "composer-2",
				name: "Cursor Composer 2",
				reasoning: false,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
		];
		const refreshedModels = [
			{
				id: "gpt-5.5@1m",
				name: "GPT-5.5 @ 1m",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 16384,
			},
		];
		mockedDiscover.mockResolvedValueOnce(startupModels).mockResolvedValueOnce(refreshedModels);
		const pi = createMockPi();
		await extensionFactory(pi);
		const notify = vi.fn();

		await pi._commands.get("cursor-refresh-models")!.handler("", {
			cwd: process.cwd(),
			hasUI: true,
			model: undefined,
			ui: { notify, setStatus: vi.fn(), select: vi.fn(), input: vi.fn() },
			sessionManager: { getBranch: vi.fn(() => []) },
		});

		expect(mockedDiscover).toHaveBeenCalledTimes(2);
		expect(pi.registerProvider).toHaveBeenCalledTimes(2);
		expect(pi._registered[0].config.models).toBe(startupModels);
		expect(pi._registered[1].config.models).toBe(refreshedModels);
		expect(pi._registered[1].config.streamSimple).toBe(mockedStreamCursor);
		expect(notify).toHaveBeenCalledWith("Cursor model catalog refreshed with 1 model.", "info");
	});

	it("warns when live Cursor model refresh still uses fallback models", async () => {
		mockedDiscover
			.mockResolvedValueOnce([])
			.mockImplementationOnce(async (options: DiscoverOptions) => {
				options.onFallback({ reason: "missing-api-key", message: "missing key; using fallback models" });
				return [];
			});
		const pi = createMockPi();
		await extensionFactory(pi);
		const notify = vi.fn();

		await pi._commands.get("cursor-refresh-models")!.handler("", {
			cwd: process.cwd(),
			hasUI: true,
			model: undefined,
			ui: { notify, setStatus: vi.fn(), select: vi.fn(), input: vi.fn() },
			sessionManager: { getBranch: vi.fn(() => []) },
		});

		expect(pi.registerProvider).toHaveBeenCalledTimes(2);
		expect(notify).toHaveBeenCalledWith(
			"Cursor model catalog refresh still using fallback models: missing key; using fallback models",
			"warning",
		);
	});

	it("notifies interactive users when fallback models are registered", async () => {
		mockedDiscover.mockImplementationOnce(async (options: DiscoverOptions) => {
			options.onFallback({
				reason: "missing-api-key",
				message:
					"Cursor model discovery needs an API key from /login (Use an API key -> Cursor), CURSOR_API_KEY, or --api-key. Using fallback Cursor models so /login and model selection still work; fallback models can run once auth exists. After adding auth to an already-started pi session, run /cursor-refresh-models to refresh the full live Cursor model catalog without restarting pi.",
			});
			return [
				{
					id: "composer-2",
					name: "Cursor Composer 2",
					reasoning: false,
					input: ["text", "image"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 128000,
					maxTokens: 16384,
				},
			];
		});

		const pi = createMockPi();
		await extensionFactory(pi);

		const notify = vi.fn();
		const ctx = {
			cwd: process.cwd(),
			hasUI: true,
			ui: { notify, setStatus: vi.fn() },
			sessionManager: { getBranch: vi.fn(() => []) },
		};
		const sessionHandlers = pi._handlers.get("session_start") ?? [];
		await sessionHandlers.at(-1)!({}, ctx);

		expect(notify).toHaveBeenCalledWith(
			"Cursor model discovery needs an API key from /login (Use an API key -> Cursor), CURSOR_API_KEY, or --api-key. Using fallback Cursor models so /login and model selection still work; fallback models can run once auth exists. After adding auth to an already-started pi session, run /cursor-refresh-models to refresh the full live Cursor model catalog without restarting pi.",
			"warning",
		);
	});

	it("does not notify fallback discovery issues without UI", async () => {
		mockedDiscover.mockImplementationOnce(async (options: DiscoverOptions) => {
			options.onFallback({ reason: "empty-model-list", message: "Cursor model discovery returned no models; using fallback Cursor model list." });
			return [];
		});

		const pi = createMockPi();
		await extensionFactory(pi);

		const notify = vi.fn();
		const ctx = { cwd: process.cwd(), hasUI: false, ui: { notify, setStatus: vi.fn() }, sessionManager: { getBranch: vi.fn(() => []) } };
		const sessionHandlers = pi._handlers.get("session_start") ?? [];
		await sessionHandlers.at(-1)!({}, ctx);

		expect(notify).not.toHaveBeenCalled();
	});

	it("defers native Cursor tool wrapper registration until session_start", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		pi.getAllTools.mockImplementation(() => {
			throw new Error("runtime tool actions are unavailable during extension load");
		});

		await extensionFactory(pi);

		expect(pi._tools.map((tool) => tool.name)).toEqual([CURSOR_ASK_QUESTION_TOOL_NAME]);
		expect(canRenderCursorToolNatively("grep")).toBe(false);
	});

	it("registers native Cursor tool wrappers with the pi session cwd", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const dir = mkdtempSync(join(tmpdir(), "pi-cursor-native-cwd-"));
		try {
			writeFileSync(join(dir, "session-file.txt"), "from session cwd\n");
			const pi = createMockPi();
			await extensionFactory(pi);
			await runSessionStartHandlers(pi, { cwd: dir });

			const readTool = pi._tools.find((tool) => tool.name === "read");
			const result = await readTool.execute("ordinary-read", { path: "session-file.txt" }, undefined, undefined, {});

			expect(result.content).toEqual([{ type: "text", text: "from session cwd\n" }]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("updates registered native Cursor tool wrappers to the latest pi session cwd", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const firstDir = mkdtempSync(join(tmpdir(), "pi-cursor-native-cwd-first-"));
		const secondDir = mkdtempSync(join(tmpdir(), "pi-cursor-native-cwd-second-"));
		try {
			writeFileSync(join(firstDir, "session-file.txt"), "from first cwd\n");
			writeFileSync(join(secondDir, "session-file.txt"), "from second cwd\n");
			const pi = createMockPi();
			await extensionFactory(pi);
			await runSessionStartHandlers(pi, { cwd: firstDir });
			await runSessionStartHandlers(pi, { cwd: secondDir });

			const readTool = pi._tools.find((tool) => tool.name === "read");
			const result = await readTool.execute("ordinary-read", { path: "session-file.txt" }, undefined, undefined, {});

			expect(pi.registerTool).toHaveBeenCalledTimes(18);
			expect(result.content).toEqual([{ type: "text", text: "from second cwd\n" }]);
		} finally {
			rmSync(firstDir, { recursive: true, force: true });
			rmSync(secondDir, { recursive: true, force: true });
		}
	});

	it("registered native Cursor tool wrappers return recorded Cursor results without executing built-ins", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		recordCursorNativeToolDisplay({
			id: "cursor-tool-1",
			toolName: "read",
			args: { path: "README.md" },
			result: { content: [{ type: "text", text: "# pi-cursor-sdk" }] },
			isError: false,
		});

		const readTool = pi._tools.find((tool) => tool.name === "read");
		const result = await readTool.execute("cursor-tool-1", { path: "README.md" }, undefined, undefined, {});

		expect(result).toEqual({
			content: [{ type: "text", text: "# pi-cursor-sdk" }],
			details: undefined,
			terminate: true,
		});
	});

	it("renders Cursor generateImage replay results with a visible path and image fallback", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const dir = mkdtempSync(join(tmpdir(), "pi-cursor-image-replay-"));
		const imagePath = join(dir, "badge.png");
		writeFileSync(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
		setCapabilities({ images: null, trueColor: false, hyperlinks: false });
		try {
			const pi = createMockPi();
			await extensionFactory(pi);
			await runSessionStartHandlers(pi);

			const generateImageTool = pi._tools.find((tool) => tool.name === "cursor_generate_image");
			const component = generateImageTool.renderResult?.(
				{
					content: [{ type: "text", text: `generateImage Small badge\n\nSaved image: ${imagePath}` }],
					details: {
						cursorToolName: "generateImage",
						title: "Cursor generateImage",
						summary: `saved ${imagePath}`,
						imagePath,
						imageDisplayPath: imagePath,
						imageMimeType: "image/png",
						expandedText: `generateImage Small badge\n\nSaved image: ${imagePath}`,
					},
				},
				{ expanded: true, isPartial: false } as never,
				{ fg: (_style: string, text: string) => text, bold: (text: string) => text } as never,
				{ isError: false, showImages: true } as never,
			);

			const rendered = component?.render(120).join("\n") ?? "";
			expect(rendered).toContain(`Cursor generateImage saved ${imagePath}`);
			expect(rendered).toContain("[Image: badge.png [image/png] 1x1]");
		} finally {
			resetCapabilitiesCache();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("renders neutral cursor partial calls from activity metadata", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);
		const theme = { fg: (_style: string, text: string) => text, bold: (text: string) => text } as never;
		const cursorTool = pi._tools.find((tool) => tool.name === "cursor");

		const rendered = [
			cursorTool.renderCall?.({ activityTitle: "Cursor plan", activitySummary: "2 items", totalCount: 2 }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n"),
			cursorTool.renderCall?.({ activityTitle: "Cursor todos", activitySummary: "1/2 completed, 1 pending", totalCount: 2 }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n"),
			cursorTool.renderCall?.({ activityTitle: "Cursor MCP", activitySummary: "external_search", toolName: "external_search" }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n"),
		]
			.filter((entry): entry is string => Boolean(entry))
			.join("\n");

		expect(rendered).toContain("  → Cursor plan 2 items");
		expect(rendered).toContain("  → Cursor todos 1/2 completed, 1 pending");
		expect(rendered).toContain("  → Cursor MCP external_search");
		expect(rendered).not.toContain("Cursor activity");
		expect(rendered).not.toContain("cursor_create_plan");
		expect(rendered).not.toContain("cursor_update_todos");
		expect(rendered).not.toContain("cursor_mcp");
		expect(cursorTool.renderShell).toBe("self");
	});

	it("renders compact read, grep, find, bash, edit, write, and ls native tool calls without boxed shells", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi, {
			model: { provider: "cursor", api: "cursor-sdk", id: "composer-2.5" } as ExtensionContext["model"],
		});
		const theme = { fg: (_style: string, text: string) => text, bold: (text: string) => text } as never;

		const readTool = pi._tools.find((tool) => tool.name === "read");
		const grepTool = pi._tools.find((tool) => tool.name === "grep");
		const findTool = pi._tools.find((tool) => tool.name === "find");
		const bashTool = pi._tools.find((tool) => tool.name === "bash");
		const editTool = pi._tools.find((tool) => tool.name === "edit");
		const writeTool = pi._tools.find((tool) => tool.name === "write");
		const lsTool = pi._tools.find((tool) => tool.name === "ls");

		for (const tool of [readTool, grepTool, findTool, bashTool, editTool, writeTool, lsTool]) {
			expect(tool.renderShell).toBe("self");
		}
		expect(readTool.renderCall?.({ path: "README.md", limit: 80 }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n").trimEnd()).toBe(
			"  → Read README.md [limit=80]",
		);
		expect(grepTool.renderCall?.({ pattern: "foo", path: "src" }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n").trimEnd()).toBe(
			'  ✱ Grep "foo" in src',
		);
		expect(findTool.renderCall?.({ pattern: "**/*.ts", path: "src" }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n").trimEnd()).toBe(
			'  ✱ Find "**/*.ts" in src',
		);
		expect(bashTool.renderCall?.({ command: "npm test" }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n").trimEnd()).toBe(
			"  $ npm test",
		);
		expect(editTool.renderCall?.({ path: "src/index.ts" }, theme, { isPartial: true, cwd: process.cwd(), toolCallId: "ordinary-edit" } as never)?.render(120).join("\n").trimEnd()).toBe(
			"  ← Edit src/index.ts",
		);
		expect(writeTool.renderCall?.({ path: "README.md" }, theme, { isPartial: true, cwd: process.cwd(), toolCallId: "ordinary-write" } as never)?.render(120).join("\n").trimEnd()).toBe(
			"  ← Write README.md",
		);
		expect(lsTool.renderCall?.({ path: "src" }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n").trimEnd()).toBe(
			"  → List src",
		);
	});

	it("uses default pi tool shells for native replay when compact display is not enabled", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY = "0";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		const readTool = pi._tools.find((tool) => tool.name === "read");
		const cursorTool = pi._tools.find((tool) => tool.name === "cursor");

		expect(readTool.renderShell).toBeUndefined();
		expect(cursorTool.renderShell).toBeUndefined();
	});

	it("enables compact display from cursorCompactToolDisplay in agent settings", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		writeFileSync(
			join(agentSettingsDir!, "settings.json"),
			JSON.stringify({ cursorCompactToolDisplay: true }),
		);
		__cursorAgentSettingsTestUtils.reset();
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi, {
			model: { provider: "cursor", api: "cursor-sdk", id: "composer-2.5" } as ExtensionContext["model"],
		});

		const readTool = pi._tools.find((tool) => tool.name === "read");
		expect(readTool.renderShell).toBe("self");
	});

	it("registers /cursor-settings command", async () => {
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		expect(pi._commands.has("cursor-settings")).toBe(true);
	});

	it("does not apply compact display on non-Cursor models even when PI_CURSOR_COMPACT_TOOL_DISPLAY=1", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi, {
			model: { provider: "opencode", api: "opencode-go", id: "kimi-k2.6" } as ExtensionContext["model"],
		});
		await runModelSelectHandlers(pi, { provider: "opencode", api: "opencode-go", id: "kimi-k2.6" } as ExtensionContext["model"]);

		const readTool = pi._tools.find((tool) => tool.name === "read");
		const cursorTool = pi._tools.find((tool) => tool.name === "cursor");
		const theme = { fg: (_style: string, text: string) => text, bold: (text: string) => text } as never;

		expect(readTool.renderShell).toBeUndefined();
		expect(cursorTool.renderShell).toBeUndefined();
		expect(readTool.renderCall?.({ path: "README.md", limit: 80 }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n").trimEnd()).not.toBe(
			"  → Read README.md [limit=80]",
		);
	});

	it("renders legacy Cursor replay-only tool labels without raw synthetic names", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);
		const theme = { fg: (_style: string, text: string) => text, bold: (text: string) => text } as never;
		const collapsedOptions = { expanded: false, isPartial: false } as never;
		const expandedOptions = { expanded: true, isPartial: false } as never;
		const context = { isError: false, showImages: false } as never;

		const editTool = pi._tools.find((tool) => tool.name === "cursor_edit");
		const writeTool = pi._tools.find((tool) => tool.name === "cursor_write");
		const mcpTool = pi._tools.find((tool) => tool.name === "cursor_mcp");

		// Cursor replay-only tools use compact one-line rendering without boxed shells.
		expect(mcpTool.renderShell).toBe("self");

		const rendered = [
			editTool.renderCall?.({ path: "src/index.ts" }, theme, { isPartial: true, cwd: process.cwd() } as never)?.render(120).join("\n"),
			writeTool.renderResult?.(
				{
					content: [{ type: "text", text: "write new.txt\n\nCreated 1 lines" }],
					details: { cursorToolName: "write", path: "new.txt", linesCreated: 1, fileSize: 6, expandedText: "Created 1 lines" },
				},
				expandedOptions,
				theme,
				context,
			)?.render(120).join("\n"),
			mcpTool.renderResult?.(
				{
					content: [{ type: "text", text: "mcp git\n\nstatus" }],
					details: { cursorToolName: "mcp", title: "Cursor MCP activity", summary: "git", expandedText: "status" },
				},
				expandedOptions,
				theme,
				context,
			)?.render(120).join("\n"),
			mcpTool.renderResult?.(
				{
					content: [{ type: "text", text: "mcp git\n\nstatus" }],
					details: { cursorToolName: "mcp", title: "Cursor MCP activity", summary: "git", expandedText: "status" },
				},
				collapsedOptions,
				theme,
				context,
			)?.render(120).join("\n"),
		]
			.filter((entry): entry is string => Boolean(entry))
			.join("\n");

		expect(rendered).toContain("  ← Edit src/index.ts");
		expect(rendered).toContain("write new.txt");
		expect(rendered).not.toContain("Cursor edit");
		expect(rendered).not.toContain("Cursor write");
		expect(rendered).toContain("Cursor MCP activity git");
		expect(rendered).not.toContain("cursor_edit");
		expect(rendered).not.toContain("cursor_write");
		expect(rendered).not.toContain("cursor_mcp");
	});

	it("renders native edit and write replay wrappers without synthetic card names", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);
		const theme = {
			fg: (style: string, text: string) =>
				["toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "toolOutput"].includes(style) ? `<${style}>${text}</${style}>` : text,
			bold: (text: string) => text,
		} as never;
		const options = { expanded: false, isPartial: false } as never;
		const replayContext = { isError: false, showImages: false, toolCallId: "cursor-replay-1-1-tool-1" } as never;

		const editTool = pi._tools.find((tool) => tool.name === "edit");
		const writeTool = pi._tools.find((tool) => tool.name === "write");
		const rendered = [
			editTool.renderCall?.({ path: "src/index.ts" }, theme, { isPartial: true, toolCallId: "cursor-replay-1-1-tool-1" } as never)?.render(120).join("\n"),
			editTool.renderResult?.(
				{
					content: [{ type: "text", text: "edit src/index.ts\n\n+1 -1" }],
					details: {
						cursorToolName: "edit",
						path: "src/index.ts",
						linesAdded: 1,
						linesRemoved: 1,
						diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old line\n+new line",
					},
				},
				options,
				theme,
				replayContext,
			)?.render(120).join("\n"),
			writeTool.renderCall?.({ path: "new.txt", content: "hello\n" }, theme, { isPartial: true, toolCallId: "cursor-replay-1-1-tool-2" } as never)?.render(120).join("\n"),
			writeTool.renderResult?.(
				{
					content: [{ type: "text", text: "write new.txt\n\nCreated 3 lines\n\n# Title\n\nBody" }],
					details: { cursorToolName: "write", path: "new.txt", linesCreated: 3, fileSize: 13, fileContentAfterWrite: "# Title\n\nBody\n" },
				},
				options,
				theme,
				replayContext,
			)?.render(120).join("\n"),
		]
			.filter((entry): entry is string => Boolean(entry))
			.join("\n");

		expect(rendered).toContain("  ← Edit src/index.ts");
		expect(rendered).toContain("<toolDiffRemoved>-</toolDiffRemoved>");
		expect(rendered).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(rendered).toContain("old line");
		expect(rendered).toContain("new line");
		expect(rendered).not.toContain("write new.txt 3 lines");
		expect(rendered).toContain("  ← Write new.txt (1 line)");
		expect(rendered).toContain("# Title");
		expect(rendered).toContain("Body");
		expect(rendered).not.toContain("Cursor edit");
		expect(rendered).not.toContain("Cursor write");
		expect(rendered).not.toContain("cursor_");
	});

	it("renders Cursor replay-only results with collapsed previews instead of summary-only cards", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		process.env.PI_CURSOR_COMPACT_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);
		const theme = {
			fg: (style: string, text: string) =>
				["toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "dim", "toolOutput"].includes(style)
					? `<${style}>${text}</${style}>`
					: text,
			bold: (text: string) => text,
		} as never;
		const options = { expanded: true, isPartial: false } as never;
		const context = { isError: false, showImages: false } as never;

		const todosTool = pi._tools.find((tool) => tool.name === "cursor_update_todos");
		const todosRendered = todosTool.renderResult?.(
			{
				content: [{ type: "text", text: "updateTodos\n\n✓ Demo TodoWrite tool output (completed)\n… Run remaining Cursor tools once (inProgress)" }],
				details: {
					cursorToolName: "updateTodos",
					title: "Cursor todos",
					summary: "1/2 completed, 1 in progress",
					expandedText: "updateTodos\n\n✓ Demo TodoWrite tool output (completed)\n… Run remaining Cursor tools once (inProgress)",
				},
			},
			options,
			theme,
			context,
		)?.render(120).join("\n") ?? "";
		expect(todosRendered).toContain("Demo TodoWrite tool output");
		expect(todosRendered).toContain("Run remaining Cursor tools once");

		const taskTool = pi._tools.find((tool) => tool.name === "cursor_task");
		const taskRendered = taskTool.renderResult?.(
			{
				content: [{ type: "text", text: "task Quick repo file count\n\n20" }],
				details: {
					cursorToolName: "task",
					title: "Cursor task",
					summary: "Quick repo file count: 20",
					expandedText: "task Quick repo file count\n\n20",
				},
			},
			options,
			theme,
			context,
		)?.render(120).join("\n") ?? "";
		expect(taskRendered).toContain("✓");
		expect(taskRendered).toContain("Quick repo file count");
		expect(taskRendered).toContain("20");

		const editTool = pi._tools.find((tool) => tool.name === "cursor_edit");
		const editRendered = editTool.renderResult?.(
			{
				content: [{ type: "text", text: "edit src/index.ts\n\n+1 -1" }],
				details: {
					cursorToolName: "edit",
					path: "src/index.ts",
					linesAdded: 1,
					linesRemoved: 1,
					diffString: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old line\n+new line",
				},
			},
			options,
			theme,
			context,
		)?.render(120).join("\n") ?? "";
		expect(editRendered).toContain("<dim>← </dim>Edit");
		expect(editRendered).toContain("src/index.ts");
		expect(editRendered).not.toContain("Cursor updated");
		expect(editRendered).toContain("<toolDiffRemoved>-</toolDiffRemoved>");
		expect(editRendered).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(editRendered).toContain("old line");
		expect(editRendered).toContain("new line");
		expect(editRendered).not.toContain("--- a/src/index.ts");
		expect(editRendered).not.toContain("@@");
		expect(editRendered).not.toContain("expand for diff");

		const createRendered = editTool.renderResult?.(
			{
				content: [{ type: "text", text: "edit new.txt\n\n+2 -1" }],
				details: {
					cursorToolName: "edit",
					path: "new.txt",
					linesAdded: 2,
					linesRemoved: 1,
					diffString: "--- /dev/null\n+++ b/new.txt\n@@ -1 +1,2 @@\n-\n+first line\n+second line",
				},
			},
			options,
			theme,
			context,
		)?.render(120).join("\n") ?? "";
		expect(createRendered).toContain("<dim>← </dim>Edit");
		expect(createRendered).toContain("new.txt");
		expect(createRendered).not.toContain("Cursor created");
		expect(createRendered).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(createRendered).toContain("first line");
		expect(createRendered).toContain("second line");
		expect(createRendered).not.toContain("/dev/null");
		expect(createRendered).not.toContain("@@");

		const neutralPathOnlyEditTool = pi._tools.find((tool) => tool.name === "cursor");
		const neutralPathOnlyEditRendered = neutralPathOnlyEditTool.renderResult?.(
			{
				content: [{ type: "text", text: "edit .tool-demo/ux-demo.ts\n\n+1 -1" }],
				details: {
					cursorToolName: "edit",
					title: "Cursor edit",
					summary: ".tool-demo/ux-demo.ts",
					path: ".tool-demo/ux-demo.ts",
					linesAdded: 1,
					linesRemoved: 1,
					diffString: "--- a/.tool-demo/ux-demo.ts\n+++ b/.tool-demo/ux-demo.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;",
					expandedText: "edit .tool-demo/ux-demo.ts\n\n+1 -1\n\n--- a/.tool-demo/ux-demo.ts\n+++ b/.tool-demo/ux-demo.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;",
				},
			},
			options,
			theme,
			context,
		)?.render(120).join("\n") ?? "";
		expect(neutralPathOnlyEditRendered).toContain("<dim>← </dim>Edit");
		expect(neutralPathOnlyEditRendered).toContain(".tool-demo/ux-demo.ts");
		expect(neutralPathOnlyEditRendered).toContain("<toolDiffRemoved>-</toolDiffRemoved>");
		expect(neutralPathOnlyEditRendered).toContain("<toolDiffAdded>+</toolDiffAdded>");
		expect(neutralPathOnlyEditRendered).toContain("export const value = 1;");
		expect(neutralPathOnlyEditRendered).toContain("export const value = 2;");
		expect(neutralPathOnlyEditRendered).not.toContain("@@");
	});

	it("registered native Cursor tool wrappers replay recorded Cursor errors as tool errors", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		recordCursorNativeToolDisplay({
			id: "cursor-tool-error",
			toolName: "bash",
			args: { command: "exit 7" },
			result: { content: [{ type: "text", text: "Command exited with code 7" }] },
			isError: true,
		});

		const bashTool = pi._tools.find((tool) => tool.name === "bash");
		await expect(bashTool.execute("cursor-tool-error", { command: "exit 7" }, undefined, undefined, {})).rejects.toThrow(
			"Command exited with code 7",
		);
	});

	it("does not register native Cursor tool wrappers when native display is disabled", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "0";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		expect(pi._tools.map((tool) => tool.name)).toEqual([CURSOR_ASK_QUESTION_TOOL_NAME]);
		expect(canRenderCursorToolNatively("read")).toBe(false);
	});

	it("does not register native Cursor tool wrappers when native tool registration is disabled", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		process.env.PI_CURSOR_REGISTER_NATIVE_TOOLS = "0";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi();
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		expect(pi._tools.map((tool) => tool.name)).toEqual([CURSOR_ASK_QUESTION_TOOL_NAME]);
		expect(canRenderCursorToolNatively("read")).toBe(false);
	});

	it("registers native Cursor tool wrappers even when another extension owns read", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const pi = createMockPi([
			{
				name: "read",
				description: "hashline read",
				parameters: Type.Object({}),
				sourceInfo: {
					source: "package",
					path: "/opt/homebrew/lib/node_modules/pi-hashline-edit/index.ts",
					scope: "user",
					origin: "package",
				},
			},
			createBuiltinToolInfo("bash"),
			createBuiltinToolInfo("grep"),
			createBuiltinToolInfo("find"),
			createBuiltinToolInfo("ls"),
		]);
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		expect(pi._tools.map((tool) => tool.name)).toEqual([
			CURSOR_ASK_QUESTION_TOOL_NAME,
			"read",
			"bash",
			"edit",
			"write",
			"grep",
			"find",
			"ls",
			"cursor",
			"cursor_edit",
			"cursor_write",
			"cursor_read_lints",
			"cursor_delete",
			"cursor_update_todos",
			"cursor_task",
			"cursor_create_plan",
			"cursor_generate_image",
			"cursor_mcp",
		]);
		expect(canRenderCursorToolNatively("read")).toBe(true);
		expect(canRenderCursorToolNatively("bash")).toBe(true);
		expect(canRenderCursorToolNatively("edit")).toBe(true);
		expect(canRenderCursorToolNatively("write")).toBe(true);
		expect(canRenderCursorToolNatively("grep")).toBe(true);
		expect(canRenderCursorToolNatively("find")).toBe(true);
		expect(canRenderCursorToolNatively("cursor")).toBe(true);
		expect(canRenderCursorToolNatively("cursor_edit")).toBe(true);
		expect(canRenderCursorToolNatively("ls")).toBe(true);
	});

	it("registers native read/grep/find replay wrappers even when a global extension already owns them", async () => {
		process.env.PI_CURSOR_NATIVE_TOOL_DISPLAY = "1";
		mockedDiscover.mockResolvedValueOnce([]);
		const compactExtensionPath = `${process.env.HOME}/.pi/agent/extensions/compact-tool-display/index.ts`;
		const pi = createMockPi([
			{
				name: "read",
				description: "compact read",
				parameters: Type.Object({}),
				sourceInfo: { source: "extension", path: compactExtensionPath, scope: "user", origin: "top-level" },
			},
			{
				name: "grep",
				description: "compact grep",
				parameters: Type.Object({}),
				sourceInfo: { source: "extension", path: compactExtensionPath, scope: "user", origin: "top-level" },
			},
			{
				name: "find",
				description: "compact find",
				parameters: Type.Object({}),
				sourceInfo: { source: "extension", path: compactExtensionPath, scope: "user", origin: "top-level" },
			},
			createBuiltinToolInfo("bash"),
			createBuiltinToolInfo("edit"),
			createBuiltinToolInfo("write"),
			createBuiltinToolInfo("ls"),
		]);
		await extensionFactory(pi);
		await runSessionStartHandlers(pi);

		expect(pi._tools.map((tool) => tool.name)).toContain("read");
		expect(pi._tools.map((tool) => tool.name)).toContain("grep");
		expect(pi._tools.map((tool) => tool.name)).toContain("find");
		expect(canRenderCursorToolNatively("read")).toBe(true);
		expect(canRenderCursorToolNatively("grep")).toBe(true);
		expect(canRenderCursorToolNatively("find")).toBe(true);
		expect(canRenderCursorToolNatively("bash")).toBe(true);
	});
});
