import { Cursor } from "@cursor/sdk";
import type {
	ModelListItem,
	ModelParameterDefinition,
	ModelParameterValue,
	ModelSelection,
} from "@cursor/sdk";
import type { ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import type { ThinkingLevelMap } from "@mariozechner/pi-ai";

const FALLBACK_MODELS: ProviderModelConfig[] = [
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
		thinkingLevelMap: {
			off: "none",
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "extra-high",
		},
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 16384,
	},
	{
		id: "claude-sonnet-4-6:context=1m;effort=medium;thinking=true",
		name: "Sonnet 4.6",
		reasoning: true,
		thinkingLevelMap: {
			off: "false",
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "max",
		},
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 16384,
	},
	{
		id: "claude-opus-4-7:context=1m;effort=xhigh;thinking=true",
		name: "Opus 4.7",
		reasoning: true,
		thinkingLevelMap: {
			off: "false",
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "max",
		},
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 16384,
	},
];

/**
 * Encode a Cursor model base ID and optional params into a single pi model ID.
 *
 * Format: `baseId` when params are empty, otherwise `baseId:key1=val1;key2=val2`.
 * The encoding is deterministic: params are sorted by id before joining.
 */
export function encodeModelId(baseId: string, params: ModelParameterValue[]): string {
	if (!params.length) return baseId;
	const suffix = params
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((p) => `${p.id}=${p.value}`)
		.join(";");
	return `${baseId}:${suffix}`;
}

/**
 * Decode a pi model ID back into a Cursor `ModelSelection`.
 *
 * Reverses `encodeModelId`. If the id contains no `:`, returns `{ id }`
 * with no params (backward compatible with plain model ids).
 */
export function decodeModelSelection(modelId: string): ModelSelection {
	const colonIndex = modelId.indexOf(":");
	if (colonIndex < 0) return { id: modelId };

	const baseId = modelId.slice(0, colonIndex);
	const paramString = modelId.slice(colonIndex + 1);
	if (!paramString) return { id: baseId };

	const params: ModelParameterValue[] = paramString.split(";").map((pair) => {
		const eqIndex = pair.indexOf("=");
		if (eqIndex < 0) return { id: pair, value: "" };
		return { id: pair.slice(0, eqIndex), value: pair.slice(eqIndex + 1) };
	});

	return { id: baseId, params };
}

/**
 * Determine if a model supports reasoning/thinking based on its parameters.
 */
function getParameter(item: ModelListItem, id: string): ModelParameterDefinition | undefined {
	return item.parameters?.find((p) => p.id === id);
}

function getReasoningParameter(item: ModelListItem): ModelParameterDefinition | undefined {
	return getParameter(item, "reasoning") ?? getParameter(item, "effort") ?? getParameter(item, "thinking");
}

function hasReasoningParameter(item: ModelListItem): boolean {
	return getReasoningParameter(item) !== undefined;
}

function hasValue(values: Set<string>, value: string): boolean {
	return values.has(value.toLowerCase());
}

function mapLevel(values: Set<string>, level: keyof ThinkingLevelMap): string | null {
	if (level === "xhigh") {
		if (hasValue(values, "max")) return "max";
		if (hasValue(values, "xhigh")) return "xhigh";
		if (hasValue(values, "extra-high")) return "extra-high";
		return null;
	}
	if (hasValue(values, level)) return level;
	return null;
}

function getParameterValues(parameter?: ModelParameterDefinition): Set<string> {
	return new Set(parameter?.values.map((v) => v.value.toLowerCase()) ?? []);
}

function getThinkingLevelMap(item: ModelListItem): ThinkingLevelMap | undefined {
	const effortParameter = getParameter(item, "effort");
	const reasoningParameter = getParameter(item, "reasoning");
	const thinkingParameter = getParameter(item, "thinking");
	const parameter = effortParameter ?? reasoningParameter ?? thinkingParameter;
	if (!parameter) return undefined;

	const values = getParameterValues(parameter);
	const thinkingValues = getParameterValues(thinkingParameter);
	if (parameter.id === "thinking") {
		return {
			off: hasValue(values, "false") ? "false" : null,
			minimal: null,
			low: null,
			medium: null,
			high: hasValue(values, "true") ? "true" : null,
			xhigh: null,
		};
	}

	return {
		off: hasValue(values, "off")
			? "off"
			: hasValue(values, "none")
				? "none"
				: hasValue(thinkingValues, "false")
					? "false"
					: null,
		minimal: mapLevel(values, "minimal"),
		low: mapLevel(values, "low"),
		medium: mapLevel(values, "medium"),
		high: mapLevel(values, "high"),
		xhigh: mapLevel(values, "xhigh"),
	};
}

function parseContextWindow(value: string): number | undefined {
	const match = /^(\d+(?:\.\d+)?)([km])$/i.exec(value.trim());
	if (!match) return undefined;
	const amount = Number(match[1]);
	const unit = match[2]?.toLowerCase();
	if (!Number.isFinite(amount)) return undefined;
	return Math.round(amount * (unit === "m" ? 1000000 : 1000));
}

function getContextWindow(_item: ModelListItem, params: ModelParameterValue[]): number {
	const contextParam = params.find((p) => p.id === "context");
	const parsed = contextParam ? parseContextWindow(contextParam.value) : undefined;
	return parsed ?? 128000;
}

/**
 * Find the default variant's params for a model.
 * Falls back to empty params if no variants or no default is marked.
 */
function getDefaultParams(item: ModelListItem): ModelParameterValue[] {
	if (!item.variants?.length) return [];
	const defaultVariant = item.variants.find((v) => v.isDefault);
	return defaultVariant?.params ?? item.variants[0]?.params ?? [];
}

function toModelConfig(item: ModelListItem): ProviderModelConfig {
	const params = getDefaultParams(item);
	const thinkingLevelMap = getThinkingLevelMap(item);
	return {
		id: encodeModelId(item.id, params),
		name: item.displayName || item.id,
		reasoning: hasReasoningParameter(item),
		...(thinkingLevelMap ? { thinkingLevelMap } : {}),
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: getContextWindow(item, params),
		maxTokens: 16384,
	};
}

export async function discoverModels(): Promise<ProviderModelConfig[]> {
	const apiKey = process.env.CURSOR_API_KEY?.trim();
	if (!apiKey) return FALLBACK_MODELS;

	try {
		const models = await Cursor.models.list({ apiKey });
		if (models.length > 0) {
			return models.map(toModelConfig);
		}
		return FALLBACK_MODELS;
	} catch {
		return FALLBACK_MODELS;
	}
}
