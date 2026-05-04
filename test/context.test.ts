import { describe, it, expect } from "vitest";
import { buildCursorPrompt } from "../src/context.js";
import type { Context, UserMessage, AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";

describe("buildCursorPrompt", () => {
	it("includes system prompt", () => {
		const ctx: Context = {
			systemPrompt: "You are helpful.",
			messages: [],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("System instructions from pi:");
		expect(result.text).toContain("You are helpful.");
	});

	it("formats user and assistant messages", () => {
		const ctx: Context = {
			messages: [
				{ role: "user", content: "Hello", timestamp: 1 } satisfies UserMessage,
				{ role: "assistant", content: [{ type: "text", text: "Hi there" }], api: "cursor-sdk", provider: "cursor", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 2 } satisfies AssistantMessage,
			],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("User: Hello");
		expect(result.text).toContain("Assistant: Hi there");
	});

	it("omits thinking content from transcript", () => {
		const ctx: Context = {
			messages: [
				{ role: "user", content: "Think hard", timestamp: 1 } satisfies UserMessage,
				{
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "internal thought" },
						{ type: "text", text: "Final answer" },
					],
					api: "cursor-sdk", provider: "cursor", model: "test",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: "stop", timestamp: 2,
				} satisfies AssistantMessage,
			],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("Final answer");
		expect(result.text).not.toContain("internal thought");
	});

	it("formats tool results", () => {
		const ctx: Context = {
			messages: [
				{ role: "user", content: "Run it", timestamp: 1 } satisfies UserMessage,
				{
					role: "toolResult",
					toolCallId: "tc1",
					toolName: "bash",
					content: [{ type: "text", text: "output here" }],
					isError: false,
					timestamp: 2,
				} satisfies ToolResultMessage,
			],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("Tool result (bash): output here");
	});

	it("extracts images from latest user message only", () => {
		const ctx: Context = {
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "Look at this" },
						{ type: "image", data: "oldbase64", mimeType: "image/png" },
					],
					timestamp: 1,
				} satisfies UserMessage,
				{
					role: "user",
					content: [
						{ type: "text", text: "And this one" },
						{ type: "image", data: "newbase64", mimeType: "image/jpeg" },
					],
					timestamp: 2,
				} satisfies UserMessage,
			],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.images).toHaveLength(1);
		expect(result.images[0]).toEqual({ data: "newbase64", mimeType: "image/jpeg" });
	});

	it("replaces historical images with placeholder text", () => {
		const ctx: Context = {
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "First" },
						{ type: "image", data: "abc", mimeType: "image/png" },
					],
					timestamp: 1,
				} satisfies UserMessage,
				{
					role: "user",
					content: "Second",
					timestamp: 2,
				} satisfies UserMessage,
			],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("[image omitted from transcript]");
		expect(result.images).toHaveLength(0);
	});

	it("appends answer instruction", () => {
		const ctx: Context = {
			messages: [{ role: "user", content: "test", timestamp: 1 }],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("Answer the latest user request");
	});
});
