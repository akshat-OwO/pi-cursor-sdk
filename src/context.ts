import type { Context, Message } from "@mariozechner/pi-ai";
import type { SDKImage } from "@cursor/sdk";

export interface CursorPrompt {
	text: string;
	images: SDKImage[];
}

function isTextBlock(block: { type: string }): block is { type: "text"; text: string } {
	return block.type === "text";
}

function isImageBlock(block: { type: string }): block is { type: "image"; data: string; mimeType: string } {
	return block.type === "image";
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

function formatUserContent(content: string | { type: string; text?: string; data?: string; mimeType?: string }[]): string {
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

export function buildCursorPrompt(context: Context): CursorPrompt {
	const parts: string[] = [];

	if (context.systemPrompt) {
		parts.push(`System instructions from pi:\n${context.systemPrompt}`);
	}

	for (const msg of context.messages) {
		switch (msg.role) {
			case "user": {
				const text = formatUserContent(msg.content);
				if (text) parts.push(`User: ${text}`);
				break;
			}
			case "assistant": {
				const blocks = typeof msg.content === "string" ? [{ type: "text" as const, text: msg.content }] : msg.content;
				const textParts: string[] = [];
				for (const block of blocks) {
					if (isTextBlock(block)) textParts.push(block.text);
					// Omit thinking content from transcript
				}
				if (textParts.length > 0) {
					parts.push(`Assistant: ${textParts.join("\n")}`);
				}
				break;
			}
			case "toolResult": {
				const text = formatUserContent(msg.content);
				parts.push(`Tool result (${msg.toolName}): ${text}`);
				break;
			}
		}
	}

	parts.push("Answer the latest user request above using your capabilities. Do not assume access to pi tools.");

	const images = extractLatestImages(context.messages);

	return { text: parts.join("\n\n"), images };
}
