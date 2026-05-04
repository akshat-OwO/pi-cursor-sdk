import {
	type Api,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	type SimpleStreamOptions,
	type AssistantMessage,
} from "@mariozechner/pi-ai";
import { Agent } from "@cursor/sdk";
import type { InteractionUpdate, ModelSelection, SDKAgent } from "@cursor/sdk";
import { buildCursorPrompt } from "./context.js";
import { decodeModelSelection } from "./model-discovery.js";

function makeInitialMessage(model: Model<Api>): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function sanitizeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

function withPiReasoningLevel(
	selection: ModelSelection,
	model: Model<Api>,
	reasoning: SimpleStreamOptions["reasoning"],
): ModelSelection {
	if (!selection.params?.length) return selection;

	const requestedLevel = reasoning ?? "off";
	const mapped = model.thinkingLevelMap?.[requestedLevel] ?? (reasoning ? reasoning : undefined);
	if (mapped === undefined || mapped === null) return selection;

	const hasEffort = selection.params.some((param) => param.id === "effort");
	const params = selection.params.map((param) => {
		if (param.id === "reasoning") return { ...param, value: mapped };
		if (param.id === "effort" && reasoning) return { ...param, value: mapped };
		if (param.id === "thinking") {
			if (!reasoning) return { ...param, value: mapped };
			return { ...param, value: hasEffort ? "true" : mapped };
		}
		return param;
	});
	return { ...selection, params };
}

export function streamCursor(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	(async () => {
		const partial = makeInitialMessage(model);
		let agent: SDKAgent | null = null;

		try {
			stream.push({ type: "start", partial });

			const apiKey = options?.apiKey;
			if (!apiKey) throw new Error("CURSOR_API_KEY is required");

			const cwd = process.cwd();
			const selection = withPiReasoningLevel(
				decodeModelSelection(model.id),
				model,
				options?.reasoning,
			);

			agent = await Agent.create({
				apiKey,
				model: selection,
				local: { cwd, settingSources: ["all"] },
			});

			const prompt = buildCursorPrompt(context);
			let textContentIndex = -1;
			let thinkingContentIndex = -1;
			let hasText = false;

			const onDelta = (args: { update: InteractionUpdate }): void => {
				const update = args.update;

				if (update.type === "text-delta") {
					if (textContentIndex < 0) {
						textContentIndex = partial.content.length;
						partial.content.push({ type: "text", text: "" });
						stream.push({ type: "text_start", contentIndex: textContentIndex, partial });
					}
					const block = partial.content[textContentIndex];
					if (block.type === "text") {
						block.text += update.text;
						stream.push({
							type: "text_delta",
							contentIndex: textContentIndex,
							delta: update.text,
							partial,
						});
					}
					hasText = true;
				} else if (update.type === "thinking-delta") {
					if (thinkingContentIndex < 0) {
						thinkingContentIndex = partial.content.length;
						partial.content.push({ type: "thinking", thinking: "" });
						stream.push({ type: "thinking_start", contentIndex: thinkingContentIndex, partial });
					}
					const block = partial.content[thinkingContentIndex];
					if (block.type === "thinking") {
						block.thinking += update.text;
						stream.push({
							type: "thinking_delta",
							contentIndex: thinkingContentIndex,
							delta: update.text,
							partial,
						});
					}
				} else if (update.type === "thinking-completed") {
					if (thinkingContentIndex >= 0) {
						const block = partial.content[thinkingContentIndex];
						if (block.type === "thinking") {
							stream.push({
								type: "thinking_end",
								contentIndex: thinkingContentIndex,
								content: block.thinking,
								partial,
							});
						}
						thinkingContentIndex = -1;
					}
				}
				// tool-call-started, tool-call-completed, summary-*, turn-ended,
				// shell-output-delta, token-delta: intentionally ignored
			};

			// Handle abort signal
			let run: Awaited<ReturnType<SDKAgent["send"]>> | null = null;
			const onAbort = () => {
				if (run) {
					run.cancel().catch(() => {});
				}
			};
			options?.signal?.addEventListener("abort", onAbort, { once: true });

			run = await agent.send(
				{ text: prompt.text, images: prompt.images.length > 0 ? prompt.images : undefined },
				{ onDelta },
			);

			const result = await run.wait();

			options?.signal?.removeEventListener("abort", onAbort);

			// Close open text block
			if (textContentIndex >= 0) {
				const block = partial.content[textContentIndex];
				if (block.type === "text") {
					stream.push({
						type: "text_end",
						contentIndex: textContentIndex,
						content: block.text,
						partial,
					});
				}
			}

			// Close open thinking block
			if (thinkingContentIndex >= 0) {
				const block = partial.content[thinkingContentIndex];
				if (block.type === "thinking") {
					stream.push({
						type: "thinking_end",
						contentIndex: thinkingContentIndex,
						content: block.thinking,
						partial,
					});
				}
			}

			// If no text was emitted but result has text, emit it
			if (!hasText && result.result) {
				textContentIndex = partial.content.length;
				partial.content.push({ type: "text", text: result.result });
				stream.push({ type: "text_start", contentIndex: textContentIndex, partial });
				stream.push({
					type: "text_end",
					contentIndex: textContentIndex,
					content: result.result,
					partial,
				});
			}

			if (result.status === "cancelled") {
				partial.stopReason = "aborted";
				stream.push({ type: "error", reason: "aborted", error: partial });
			} else {
				stream.push({ type: "done", reason: "stop", message: partial });
			}
		} catch (error) {
			partial.stopReason = "error";
			partial.errorMessage = sanitizeError(error);
			stream.push({ type: "error", reason: "error", error: partial });
		} finally {
			if (agent) {
				try {
					await agent[Symbol.asyncDispose]();
				} catch {
					// disposal failure should not mask original error
				}
				agent = null;
			}
		}

		stream.end();
	})();

	return stream;
}
