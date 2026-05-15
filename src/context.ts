import type { Context, Message, ToolCall } from "@earendil-works/pi-ai";
import type { SDKImage } from "@cursor/sdk";

export interface CursorPrompt {
	text: string;
	images: SDKImage[];
}

export interface CursorPromptOptions {
	maxInputTokens?: number;
	charsPerToken?: number;
	imageTokenEstimate?: number;
}

const DEFAULT_CHARS_PER_TOKEN = 4;
const SECTION_SEPARATOR = "\n\n";

function isTextBlock(block: { type: string }): block is { type: "text"; text: string } {
	return block.type === "text";
}

function isImageBlock(block: { type: string }): block is { type: "image"; data: string; mimeType: string } {
	return block.type === "image";
}

function isToolCallBlock(block: { type: string }): block is ToolCall {
	return block.type === "toolCall";
}

function extractLatestImages(messages: Message[]): SDKImage[] {
	// Find the last user message and extract images only from it
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "user") continue;
		if (typeof msg.content === "string") return [];

		const images: SDKImage[] = [];
		for (const block of msg.content) {
			if (isImageBlock(block) && block.data && block.mimeType) {
				images.push({ data: block.data, mimeType: block.mimeType });
			}
		}
		return images;
	}
	return [];
}

function formatContentBlocks(content: string | { type: string; text?: string; data?: string; mimeType?: string }[]): string {
	if (typeof content === "string") return content;
	return content
		.map((block) => {
			if (isTextBlock(block)) return block.text;
			if (isImageBlock(block)) return "[image omitted from transcript]";
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function formatToolCall(toolCall: ToolCall): string {
	const args = JSON.stringify(toolCall.arguments);
	return `Tool call (${toolCall.name}, call ${toolCall.id}): ${args}`;
}

function formatMessage(msg: Message): string | undefined {
	switch (msg.role) {
		case "user": {
			const text = formatContentBlocks(msg.content);
			return text ? `User: ${text}` : undefined;
		}
		case "assistant": {
			const blocks = Array.isArray(msg.content) ? msg.content : [{ type: "text" as const, text: String(msg.content) }];
			const textParts: string[] = [];
			for (const block of blocks) {
				if (isTextBlock(block)) {
					textParts.push(block.text);
				} else if (isToolCallBlock(block)) {
					textParts.push(formatToolCall(block));
				}
				// Omit thinking content from transcript
			}
			return textParts.length > 0 ? `Assistant: ${textParts.join("\n")}` : undefined;
		}
		case "toolResult": {
			const text = formatContentBlocks(msg.content);
			const label = msg.isError ? "Tool error" : "Tool result";
			return `${label} (${msg.toolName}, call ${msg.toolCallId}): ${text}`;
		}
	}
}

function getLatestUserMessageIndex(messages: Message[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index].role === "user") return index;
	}
	return -1;
}

function getSectionCost(section: string): number {
	return section.length + SECTION_SEPARATOR.length;
}

function applyPromptBudget(
	sectionsBeforeMessages: string[],
	messageSections: Array<{ index: number; text: string }>,
	sectionsAfterMessages: string[],
	latestUserMessageIndex: number,
	options: CursorPromptOptions,
): string[] {
	const maxInputTokens = options.maxInputTokens;
	if (maxInputTokens === undefined || !Number.isFinite(maxInputTokens) || maxInputTokens <= 0) {
		return [...sectionsBeforeMessages, ...messageSections.map((section) => section.text), ...sectionsAfterMessages];
	}

	const charsPerToken = options.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
	const maxChars = Math.max(1, Math.floor(maxInputTokens * charsPerToken));
	const requiredMessageSections = messageSections.filter((section) => section.index === latestUserMessageIndex);
	const requiredCost = [...sectionsBeforeMessages, ...requiredMessageSections.map((section) => section.text), ...sectionsAfterMessages].reduce(
		(total, section) => total + getSectionCost(section),
		0,
	);
	let remainingChars = maxChars - requiredCost;
	const includedMessageIndexes = new Set(requiredMessageSections.map((section) => section.index));
	let omittedMessageCount = 0;

	for (let index = messageSections.length - 1; index >= 0; index -= 1) {
		const section = messageSections[index];
		if (includedMessageIndexes.has(section.index)) continue;
		const cost = getSectionCost(section.text);
		if (cost <= remainingChars) {
			includedMessageIndexes.add(section.index);
			remainingChars -= cost;
			continue;
		}
		omittedMessageCount += messageSections
			.slice(0, index + 1)
			.filter((candidate) => !includedMessageIndexes.has(candidate.index)).length;
		break;
	}

	const budgetNotice =
		omittedMessageCount > 0
			? [`[Earlier transcript omitted: ${omittedMessageCount} message${omittedMessageCount === 1 ? "" : "s"} to fit Cursor context budget]`]
			: [];
	const includedMessages = messageSections
		.filter((section) => includedMessageIndexes.has(section.index))
		.map((section) => section.text);
	return [...sectionsBeforeMessages, ...budgetNotice, ...includedMessages, ...sectionsAfterMessages];
}

export function buildCursorPrompt(context: Context, options: CursorPromptOptions = {}): CursorPrompt {
	const sectionsBeforeMessages: string[] = [
		[
			"Cursor SDK tool boundary:",
			"Only tools exposed by the Cursor SDK in this run are callable. The pi system prompt and transcript are context only; they do not grant access to pi tools or tool names mentioned there.",
			"If the user asks you to search, fetch, browse, or research the web, use an actual Cursor SDK web/search/browser/MCP tool call. If no such Cursor SDK tool is available, say that web search is not configured for this Cursor SDK run.",
			"Do not plan to use or claim to have used pi-only tools such as WebSearch or WebFetch unless the Cursor SDK actually exposes and executes that tool in this run.",
		].join("\n"),
	];

	if (context.systemPrompt) {
		sectionsBeforeMessages.push(`System instructions from pi:\n${context.systemPrompt}`);
	}

	const messageSections = context.messages
		.map((msg, index) => {
			const text = formatMessage(msg);
			return text ? { index, text } : undefined;
		})
		.filter((section): section is { index: number; text: string } => section !== undefined);
	const sectionsAfterMessages = [
		[
			"Answer the latest user request above using your capabilities. Do not assume access to pi tools.",
			"If the user asks for web research, do not claim to have searched the web unless a Cursor SDK web/search/browser/MCP tool was actually used.",
		].join("\n"),
	];
	const images = extractLatestImages(context.messages);
	const imageTokenReserve = images.length * (options.imageTokenEstimate ?? 0);
	const budgetOptions =
		options.maxInputTokens === undefined
			? options
			: { ...options, maxInputTokens: Math.max(1, options.maxInputTokens - imageTokenReserve) };
	const parts = applyPromptBudget(
		sectionsBeforeMessages,
		messageSections,
		sectionsAfterMessages,
		getLatestUserMessageIndex(context.messages),
		budgetOptions,
	);

	return { text: parts.join(SECTION_SEPARATOR), images };
}
