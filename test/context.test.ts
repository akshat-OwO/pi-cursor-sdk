import { describe, it, expect } from "vitest";
import { buildCursorPrompt } from "../src/context.js";
import type { Context, UserMessage, AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";

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

	it("defensively formats assistant string content", () => {
		const ctx: Context = {
			messages: [
				{
					role: "assistant",
					content: "Legacy assistant text",
					api: "cursor-sdk",
					provider: "cursor",
					model: "test",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: "stop",
					timestamp: 2,
				} as unknown as AssistantMessage,
			],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("Assistant: Legacy assistant text");
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
		expect(result.text).toContain("Tool result (bash, call tc1): output here");
	});

	it("formats tool errors", () => {
		const ctx: Context = {
			messages: [
				{ role: "user", content: "Run it", timestamp: 1 } satisfies UserMessage,
				{
					role: "toolResult",
					toolCallId: "tc1",
					toolName: "bash",
					content: [{ type: "text", text: "command failed" }],
					isError: true,
					timestamp: 2,
				} satisfies ToolResultMessage,
			],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("Tool error (bash, call tc1): command failed");
	});

	it("formats assistant tool calls before tool results", () => {
		const ctx: Context = {
			messages: [
				{ role: "user", content: "List files", timestamp: 1 } satisfies UserMessage,
				{
					role: "assistant",
					content: [
						{ type: "text", text: "I will inspect the directory." },
						{ type: "toolCall", id: "tc1", name: "bash", arguments: { command: "ls" } },
					],
					api: "cursor-sdk",
					provider: "cursor",
					model: "test",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: "toolUse",
					timestamp: 2,
				} satisfies AssistantMessage,
				{
					role: "toolResult",
					toolCallId: "tc1",
					toolName: "bash",
					content: [{ type: "text", text: "README.md" }],
					isError: false,
					timestamp: 3,
				} satisfies ToolResultMessage,
			],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("Assistant: I will inspect the directory.\nTool call (bash, call tc1): {\"command\":\"ls\"}");
		expect(result.text).toContain("Tool result (bash, call tc1): README.md");
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

	it("budgets transcript history while preserving system prompt and latest user request", () => {
		const ctx: Context = {
			systemPrompt: "Always preserve this system instruction.",
			messages: [
				{ role: "user", content: `old request ${"x".repeat(200)}`, timestamp: 1 } satisfies UserMessage,
				{
					role: "assistant",
					content: [{ type: "text", text: `old answer ${"y".repeat(200)}` }],
					api: "cursor-sdk",
					provider: "cursor",
					model: "test",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: "stop",
					timestamp: 2,
				} satisfies AssistantMessage,
				{ role: "user", content: "latest request must stay", timestamp: 3 } satisfies UserMessage,
			],
		};

		const result = buildCursorPrompt(ctx, { maxInputTokens: 120, charsPerToken: 1 });

		expect(result.text).toContain("Always preserve this system instruction.");
		expect(result.text).toContain("User: latest request must stay");
		expect(result.text).toContain("Answer the latest user request");
		expect(result.text).toContain("[Earlier transcript omitted: 2 messages to fit Cursor context budget]");
		expect(result.text).not.toContain("old request");
		expect(result.text).not.toContain("old answer");
	});

	it("keeps recent transcript messages that fit the budget", () => {
		const ctx: Context = {
			messages: [
				{ role: "user", content: `old request ${"x".repeat(1200)}`, timestamp: 1 } satisfies UserMessage,
				{ role: "user", content: "recent request", timestamp: 2 } satisfies UserMessage,
				{
					role: "toolResult",
					toolCallId: "tc1",
					toolName: "bash",
					content: [{ type: "text", text: "recent tool output" }],
					isError: false,
					timestamp: 3,
				} satisfies ToolResultMessage,
				{ role: "user", content: "latest request", timestamp: 4 } satisfies UserMessage,
			],
		};

		const result = buildCursorPrompt(ctx, { maxInputTokens: 1000, charsPerToken: 1 });

		expect(result.text).toContain("User: latest request");
		expect(result.text).toContain("User: recent request");
		expect(result.text).toContain("Tool result (bash, call tc1): recent tool output");
		expect(result.text).not.toContain("old request");
	});

	it("omits oversized old tool results before older text that still fits", () => {
		const ctx: Context = {
			messages: [
				{
					role: "toolResult",
					toolCallId: "tc1",
					toolName: "bash",
					content: [{ type: "text", text: `large output ${"z".repeat(1200)}` }],
					isError: false,
					timestamp: 1,
				} satisfies ToolResultMessage,
				{ role: "user", content: "recent request", timestamp: 2 } satisfies UserMessage,
				{ role: "user", content: "latest request", timestamp: 3 } satisfies UserMessage,
			],
		};

		const result = buildCursorPrompt(ctx, { maxInputTokens: 1000, charsPerToken: 1 });

		expect(result.text).toContain("User: latest request");
		expect(result.text).toContain("User: recent request");
		expect(result.text).toContain("[Earlier transcript omitted: 1 message to fit Cursor context budget]");
		expect(result.text).not.toContain("large output");
	});

	it("appends answer instruction", () => {
		const ctx: Context = {
			messages: [{ role: "user", content: "test", timestamp: 1 }],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text).toContain("Answer the latest user request");
	});

	it("instructs Cursor not to claim web search without an actual Cursor web tool", () => {
		const ctx: Context = {
			systemPrompt: "You can use WebSearch and WebFetch.",
			messages: [{ role: "user", content: "search the web for Cursor SDK best practices", timestamp: 1 }],
		};
		const result = buildCursorPrompt(ctx);
		expect(result.text.indexOf("Cursor SDK tool boundary:")).toBeLessThan(result.text.indexOf("System instructions from pi:"));
		expect(result.text).toContain("they do not grant access to pi tools or tool names mentioned there");
		expect(result.text).toContain("Do not plan to use or claim to have used pi-only tools such as WebSearch or WebFetch");
		expect(result.text).toContain("do not claim to have searched the web unless a Cursor SDK web/search/browser/MCP tool was actually used");
	});
});
