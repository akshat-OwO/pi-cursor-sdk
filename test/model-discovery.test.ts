import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discoverModels, encodeModelId, decodeModelSelection } from "../src/model-discovery.js";
import type { ModelParameterValue } from "@cursor/sdk";

// Mock @cursor/sdk
vi.mock("@cursor/sdk", () => ({
	Cursor: {
		models: {
			list: vi.fn(),
		},
	},
}));

import { Cursor } from "@cursor/sdk";

const mockedList = vi.mocked(Cursor.models.list);

describe("encodeModelId", () => {
	it("returns base id when params are empty", () => {
		expect(encodeModelId("gemini-3.1-pro", [])).toBe("gemini-3.1-pro");
	});

	it("encodes single param", () => {
		const params: ModelParameterValue[] = [{ id: "fast", value: "true" }];
		expect(encodeModelId("composer-2", params)).toBe("composer-2:fast=true");
	});

	it("encodes multiple params sorted by id", () => {
		const params: ModelParameterValue[] = [
			{ id: "reasoning", value: "medium" },
			{ id: "fast", value: "false" },
			{ id: "context", value: "1m" },
		];
		expect(encodeModelId("gpt-5.4", params)).toBe(
			"gpt-5.4:context=1m;fast=false;reasoning=medium",
		);
	});

	it("handles param with empty value", () => {
		const params: ModelParameterValue[] = [{ id: "mode", value: "" }];
		expect(encodeModelId("test-model", params)).toBe("test-model:mode=");
	});
});

describe("decodeModelSelection", () => {
	it("decodes plain id with no colon", () => {
		const result = decodeModelSelection("gemini-3.1-pro");
		expect(result).toEqual({ id: "gemini-3.1-pro" });
	});

	it("decodes id with params", () => {
		const result = decodeModelSelection("composer-2:fast=true");
		expect(result).toEqual({
			id: "composer-2",
			params: [{ id: "fast", value: "true" }],
		});
	});

	it("decodes id with multiple params", () => {
		const result = decodeModelSelection("gpt-5.4:context=1m;fast=false;reasoning=medium");
		expect(result).toEqual({
			id: "gpt-5.4",
			params: [
				{ id: "context", value: "1m" },
				{ id: "fast", value: "false" },
				{ id: "reasoning", value: "medium" },
			],
		});
	});

	it("handles trailing colon with no params", () => {
		const result = decodeModelSelection("model-id:");
		expect(result).toEqual({ id: "model-id" });
	});

	it("round-trips through encode then decode", () => {
		const params: ModelParameterValue[] = [
			{ id: "reasoning", value: "high" },
			{ id: "fast", value: "true" },
		];
		const encoded = encodeModelId("gpt-5.2", params);
		const decoded = decodeModelSelection(encoded);
		// Params come back in sorted order from encode, decode preserves that order
		expect(decoded.id).toBe("gpt-5.2");
		expect(decoded.params).toEqual([
			{ id: "fast", value: "true" },
			{ id: "reasoning", value: "high" },
		]);
	});

	it("round-trips plain id with no params", () => {
		const encoded = encodeModelId("gemini-3.1-pro", []);
		const decoded = decodeModelSelection(encoded);
		expect(decoded).toEqual({ id: "gemini-3.1-pro" });
	});
});

describe("discoverModels", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("returns fallback models when no API key", async () => {
		delete process.env.CURSOR_API_KEY;
		const models = await discoverModels();
		expect(models).toHaveLength(4);
		expect(models[0].id).toContain("composer-2");
		expect(models[1].id).toContain("gpt-5.5");
		expect(models[2].id).toContain("claude-sonnet");
		expect(models[3].id).toContain("claude-opus");
		expect(mockedList).not.toHaveBeenCalled();
	});

	it("returns fallback models when API key is whitespace", async () => {
		process.env.CURSOR_API_KEY = "   ";
		const models = await discoverModels();
		expect(models).toHaveLength(4);
		expect(models[0].id).toContain("composer-2");
	});

	it("calls Cursor.models.list with API key", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "model-a",
				displayName: "Model A",
				variants: [{ params: [], displayName: "Model A", isDefault: true }],
			},
			{
				id: "model-b",
				displayName: "Model B",
				variants: [{ params: [], displayName: "Model B", isDefault: true }],
			},
		]);
		const models = await discoverModels();
		expect(mockedList).toHaveBeenCalledWith({ apiKey: "test-key-123" });
		expect(models).toHaveLength(2);
		expect(models[0].id).toBe("model-a");
		expect(models[0].name).toBe("Model A");
		expect(models[1].id).toBe("model-b");
	});

	it("encodes default variant params into model id", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "gpt-5.4",
				displayName: "GPT-5.4",
				parameters: [{ id: "reasoning", displayName: "Reasoning", values: [{ value: "medium" }] }],
				variants: [
					{
						params: [
							{ id: "context", value: "1m" },
							{ id: "reasoning", value: "medium" },
							{ id: "fast", value: "false" },
						],
						displayName: "GPT-5.4",
						isDefault: true,
					},
				],
			},
		]);
		const models = await discoverModels();
		expect(models[0].id).toBe("gpt-5.4:context=1m;fast=false;reasoning=medium");
		expect(models[0].name).toBe("GPT-5.4");
	});

	it("sets reasoning true for models with thinking parameter", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "claude-opus-4-6",
				displayName: "Opus 4.6",
				parameters: [{ id: "thinking", displayName: "Thinking", values: [{ value: "true" }] }],
				variants: [
					{
						params: [{ id: "thinking", value: "true" }],
						displayName: "Opus 4.6",
						isDefault: true,
					},
				],
			},
		]);
		const models = await discoverModels();
		expect(models[0].reasoning).toBe(true);
	});

	it("sets reasoning true for models with reasoning parameter", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "gpt-5.2",
				displayName: "GPT-5.2",
				parameters: [{ id: "reasoning", displayName: "Reasoning", values: [{ value: "high" }] }],
				variants: [
					{
						params: [{ id: "reasoning", value: "high" }],
						displayName: "GPT-5.2",
						isDefault: true,
					},
				],
			},
		]);
		const models = await discoverModels();
		expect(models[0].reasoning).toBe(true);
	});

	it("maps Cursor reasoning values to pi thinking levels", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "gpt-5.4",
				displayName: "GPT-5.4",
				parameters: [
					{
						id: "reasoning",
						displayName: "Reasoning",
						values: [{ value: "low" }, { value: "medium" }, { value: "high" }],
					},
				],
				variants: [
					{
						params: [{ id: "reasoning", value: "medium" }],
						displayName: "GPT-5.4",
						isDefault: true,
					},
				],
			},
		]);
		const models = await discoverModels();
		expect(models[0].thinkingLevelMap).toEqual({
			off: null,
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: null,
		});
	});

	it("maps boolean Cursor thinking values to off and high", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "claude-opus-4-6",
				displayName: "Opus 4.6",
				parameters: [
					{
						id: "thinking",
						displayName: "Thinking",
						values: [{ value: "false" }, { value: "true" }],
					},
				],
				variants: [
					{
						params: [{ id: "thinking", value: "true" }],
						displayName: "Opus 4.6",
						isDefault: true,
					},
				],
			},
		]);
		const models = await discoverModels();
		expect(models[0].thinkingLevelMap).toMatchObject({
			off: "false",
			minimal: null,
			low: null,
			medium: null,
			high: "true",
		});
	});

	it("maps Claude effort max to pi xhigh and parses 1m context", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "claude-opus-4-7",
				displayName: "Opus 4.7",
				parameters: [
					{ id: "thinking", displayName: "Thinking", values: [{ value: "false" }, { value: "true" }] },
					{ id: "context", displayName: "Context", values: [{ value: "300k" }, { value: "1m" }] },
					{
						id: "effort",
						displayName: "Effort",
						values: [
							{ value: "low" },
							{ value: "medium" },
							{ value: "high" },
							{ value: "xhigh" },
							{ value: "max" },
						],
					},
				],
				variants: [
					{
						params: [
							{ id: "thinking", value: "true" },
							{ id: "context", value: "1m" },
							{ id: "effort", value: "xhigh" },
						],
						displayName: "Opus 4.7",
						isDefault: true,
					},
				],
			},
		]);
		const models = await discoverModels();
		expect(models[0].id).toBe("claude-opus-4-7:context=1m;effort=xhigh;thinking=true");
		expect(models[0].contextWindow).toBe(1000000);
		expect(models[0].thinkingLevelMap).toEqual({
			off: "false",
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "max",
		});
	});

	it("maps extra-high reasoning values to pi xhigh and parses 272k context", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "gpt-5.4",
				displayName: "GPT-5.4",
				parameters: [
					{ id: "context", displayName: "Context", values: [{ value: "272k" }, { value: "1m" }] },
					{
						id: "reasoning",
						displayName: "Reasoning",
						values: [
							{ value: "none" },
							{ value: "low" },
							{ value: "medium" },
							{ value: "high" },
							{ value: "extra-high" },
						],
					},
				],
				variants: [
					{
						params: [
							{ id: "context", value: "272k" },
							{ id: "reasoning", value: "medium" },
						],
						displayName: "GPT-5.4",
						isDefault: true,
					},
				],
			},
		]);
		const models = await discoverModels();
		expect(models[0].contextWindow).toBe(272000);
		expect(models[0].thinkingLevelMap?.off).toBe("none");
		expect(models[0].thinkingLevelMap?.xhigh).toBe("extra-high");
	});

	it("sets reasoning false for models without thinking or reasoning params", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "gemini-3.1-pro",
				displayName: "Gemini 3.1 Pro",
				variants: [{ params: [], displayName: "Gemini 3.1 Pro", isDefault: true }],
			},
		]);
		const models = await discoverModels();
		expect(models[0].reasoning).toBe(false);
	});

	it("falls back when Cursor.models.list throws", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockRejectedValueOnce(new Error("network error"));
		const models = await discoverModels();
		expect(models).toHaveLength(4);
		expect(models[0].id).toContain("composer-2");
	});

	it("falls back when Cursor.models.list returns empty", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([]);
		const models = await discoverModels();
		expect(models).toHaveLength(4);
		expect(models[0].id).toContain("composer-2");
	});

	it("uses id as name when displayName is missing", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{ id: "raw-id", variants: [{ params: [], displayName: "raw-id", isDefault: true }] },
		]);
		const models = await discoverModels();
		expect(models[0].name).toBe("raw-id");
	});

	it("uses first variant when no isDefault is marked", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{
				id: "test-model",
				displayName: "Test Model",
				variants: [
					{ params: [{ id: "reasoning", value: "low" }], displayName: "Test Model" },
					{ params: [{ id: "reasoning", value: "high" }], displayName: "Test Model" },
				],
			},
		]);
		const models = await discoverModels();
		expect(models[0].id).toBe("test-model:reasoning=low");
	});

	it("handles model with no variants array", async () => {
		process.env.CURSOR_API_KEY = "test-key-123";
		mockedList.mockResolvedValueOnce([
			{ id: "bare-model", displayName: "Bare Model" },
		]);
		const models = await discoverModels();
		expect(models[0].id).toBe("bare-model");
	});
});
