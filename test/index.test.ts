import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock model-discovery before importing the extension
vi.mock("../src/model-discovery.js", () => ({
	discoverModels: vi.fn(),
}));

// Mock cursor-provider before importing the extension
vi.mock("../src/cursor-provider.js", () => ({
	streamCursor: vi.fn(),
}));

import extensionFactory from "../src/index.js";
import { discoverModels } from "../src/model-discovery.js";
import { streamCursor } from "../src/cursor-provider.js";

const mockedDiscover = vi.mocked(discoverModels);
const mockedStreamCursor = vi.mocked(streamCursor);

function createMockPi() {
	const registered: Array<{ name: string; config: Record<string, unknown> }> = [];
	return {
		registerProvider: vi.fn((name: string, config: Record<string, unknown>) => {
			registered.push({ name, config });
		}),
		_registered: registered,
	};
}

describe("extension factory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers one provider with correct fields", async () => {
		const mockModels = [
			{
				id: "composer-2:fast=true",
				name: "Cursor Composer 2",
				reasoning: false,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
		];
		mockedDiscover.mockResolvedValueOnce(mockModels);

		const pi = createMockPi();
		await extensionFactory(pi as any);

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

	it("registers provider even with fallback models", async () => {
		mockedDiscover.mockResolvedValueOnce([
			{
				id: "composer-2:fast=true",
				name: "Cursor Composer 2",
				reasoning: false,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
			{
				id: "gpt-5.5:context=1m;reasoning=medium;fast=false",
				name: "GPT-5.5",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16384,
			},
		]);

		const pi = createMockPi();
		await extensionFactory(pi as any);

		expect(pi.registerProvider).toHaveBeenCalledOnce();
		const [call] = pi._registered;
		expect(call.config.models).toHaveLength(2);
	});
});
